import json
import logging
from typing import AsyncGenerator, Dict, Any, List
from agent.config import Settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager

logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """
    Orchestrates the agent loop, managing state initialization,
    tool execution callbacks, multi-turn LLM completions, and SSE event streaming.
    """
    def __init__(
        self,
        settings: Settings,
        llm_service: LLMService,
        mcp_bridge: MCPBridge,
        conversation_manager: ConversationManager
    ):
        self.settings = settings
        self.llm_service = llm_service
        self.mcp_bridge = mcp_bridge
        self.conversation_manager = conversation_manager

    async def run(
        self,
        session_id: str,
        prompt: str,
        diagram_xml: str | None = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Runs the orchestration loop and streams back progress, updates, or errors.
        """
        # 1. Initialize MCP state
        try:
            if diagram_xml:
                yield {
                    "event": "tool_progress",
                    "data": {
                        "toolName": "open_drawio_xml",
                        "step": 0,
                        "totalSteps": 2,
                        "message": "Restoring diagram state from snapshot"
                    }
                }
                await self.mcp_bridge.call_tool("open_drawio_xml", {"content": diagram_xml})
            else:
                yield {
                    "event": "tool_progress",
                    "data": {
                        "toolName": "init_diagram",
                        "step": 0,
                        "totalSteps": 2,
                        "message": "Initializing new diagram"
                    }
                }
                await self.mcp_bridge.call_tool("init_diagram", {})
        except Exception as e:
            logger.error(f"Failed to initialize MCP state: {e}")
            yield {"event": "error", "data": {"message": f"State initialization failed: {str(e)}"}}
            return

        # 2. Get/Create conversation history
        tools = self.mcp_bridge.get_tools()
        self.conversation_manager.get_or_create_conversation(session_id, tools=tools)
        
        # Add user prompt (triggers keyword loading if needed)
        self.conversation_manager.add_message(session_id, "user", prompt)

        # 3. Execution Loop
        max_turns = 15
        turn = 0
        final_text = ""
        
        while turn < max_turns:
            turn += 1
            # Emit a thinking progress event to let the user know the AI is active
            progress_msg = self._get_progress_message(session_id, turn)
            yield {
                "event": "tool_progress",
                "data": {
                    "toolName": "Archimedes AI",
                    "step": turn,
                    "totalSteps": max_turns,
                    "message": progress_msg
                }
            }

            messages = self.conversation_manager.get_conversation(session_id)
            
            try:
                # Call LLM with current history and tools
                response_msg = await self.llm_service.generate_chat(messages, tools=tools)
            except Exception as e:
                logger.error(f"LLM generation failed: {e}")
                yield {"event": "error", "data": {"message": f"LLM generation failed: {str(e)}"}}
                return

            # Check if LLM generated tool calls
            tool_calls = getattr(response_msg, "tool_calls", None)
            if tool_calls:
                # Append assistant message to history
                assistant_msg = {
                    "role": "assistant",
                    "content": response_msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        } for tc in tool_calls
                    ]
                }
                self.conversation_manager.get_conversation(session_id).append(assistant_msg)
                
                # Execute each tool call sequentially
                total_steps = len(tool_calls)
                for idx, tc in enumerate(tool_calls):
                    tool_name = tc.function.name
                    step_num = idx + 1
                    
                    tool_desc = self._get_prettified_tool_description(tool_name)
                    yield {
                        "event": "tool_progress",
                        "data": {
                            "toolName": tool_desc["name"],
                            "step": step_num,
                            "totalSteps": total_steps,
                            "message": tool_desc["message"]
                        }
                    }
                    
                    try:
                        args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                        tool_res = await self.mcp_bridge.call_tool(tool_name, args)
                        tool_res_content = json.dumps(tool_res)
                    except Exception as err:
                        logger.error(f"Failed to execute tool {tool_name}: {err}")
                        tool_res_content = f"Error executing tool: {str(err)}"

                    # Append tool response message to history
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tool_name,
                        "content": tool_res_content
                    }
                    self.conversation_manager.get_conversation(session_id).append(tool_msg)
            else:
                # Final turn - text response only
                final_text = response_msg.content or ""
                self.conversation_manager.add_message(session_id, "assistant", final_text)
                break

        # 4. Finalize diagram and emit diagram_update
        try:
            finalize_res = await self.mcp_bridge.call_tool("finalize", {})
            final_xml = ""
            if isinstance(finalize_res, dict):
                # Handle validation errors returned by downstream builder / wrapper
                if finalize_res.get("isError"):
                    err_msg = "Cannot finalize diagram - validation failed."
                    if "content" in finalize_res and finalize_res["content"]:
                        try:
                            detail_json = json.loads(finalize_res["content"][0].get("text", "{}"))
                            err_msg = detail_json.get("error", err_msg)
                            if "details" in detail_json and detail_json["details"]:
                                err_msg += "\n" + "\n".join(detail_json["details"])
                        except Exception:
                            err_msg = finalize_res["content"][0].get("text", err_msg)
                    raise RuntimeError(err_msg)
                
                if "xml" in finalize_res:
                    final_xml = finalize_res["xml"]
                elif "content" in finalize_res and finalize_res["content"]:
                    text = finalize_res["content"][0].get("text", "")
                    if text.strip().startswith("<"):
                        final_xml = text
                    else:
                        raise RuntimeError(f"Unexpected finalize response format: {text[:100]}")
                else:
                    raise RuntimeError("No XML returned from finalize")
            
            yield {"event": "diagram_update", "data": {"xml": final_xml}}
        except Exception as e:
            logger.error(f"Failed to finalize diagram: {e}")
            yield {"event": "error", "data": {"message": f"Failed to finalize diagram: {str(e)}"}}

        # 5. Emit final chat response
        if not final_text or not final_text.strip():
            final_text = "I have successfully compiled your architecture request and updated the diagram canvas."
        else:
            final_text = self._strip_drawio_links(final_text)
            
        self.conversation_manager.add_message(session_id, "assistant", final_text)
        yield {"event": "chat_message", "data": {"text": final_text}}

    def _strip_drawio_links(self, text: str) -> str:
        """
        Strips draw.io diagram links and editor URLs from the assistant text response
        to prevent duplicate or confusing links when the diagram is already loaded.
        """
        import re
        # Remove markdown links pointing to embed.diagrams.net or diagrams.net
        text = re.sub(
            r'\[[^\]]*\]\(https?://(?:embed\.)?diagrams\.net/[^\)]*\)',
            '',
            text
        )
        # Remove raw URLs pointing to embed.diagrams.net or diagrams.net
        text = re.sub(
            r'https?://(?:embed\.)?diagrams\.net/\S*',
            '',
            text
        )
        # Clean up labels introducing the URL
        text = re.sub(r'(?i)Draw\.io\s+Editor\s+URL\s*:\s*\n?', '', text)
        text = re.sub(r'(?i)you can open the diagram using this link\s*:\s*\n?', '', text)
        text = re.sub(r'(?i)click here to open\s*:\s*\n?', '', text)
        # Clean up layout artifacts (extra spaces and duplicate newlines)
        text = re.sub(r' +', ' ', text)
        text = re.sub(r'\n\s*\n', '\n\n', text)
        return text.strip()

    def _get_prettified_tool_description(self, tool_name: str) -> Dict[str, str]:
        """
        Maps raw MCP tool names to user-friendly titles and progress descriptions.
        """
        mapping = {
            "init_diagram": {
                "name": "Canvas Initializer",
                "message": "Initializing diagram workspace..."
            },
            "compile_json_spec": {
                "name": "Layout Compiler",
                "message": "Compiling full diagram specification..."
            },
            "finalize": {
                "name": "Finalizer & Validator",
                "message": "Running validations and updating canvas..."
            },
            "open_drawio_xml": {
                "name": "Diagram Loader",
                "message": "Opening existing diagram snapshot..."
            },
            "add_node": {
                "name": "Shape Placer",
                "message": "Placing shapes onto diagram..."
            },
            "add_container": {
                "name": "Boundary Group",
                "message": "Adding container boundaries..."
            },
            "connect": {
                "name": "Connector Router",
                "message": "Routing links and process lines..."
            }
        }
        return mapping.get(tool_name, {
            "name": tool_name.replace("_", " ").title(),
            "message": f"Running {tool_name}..."
        })

    def _get_progress_message(self, session_id: str, turn: int) -> str:
        """
        Dynamically computes a descriptive progress message based on the 
        current conversation state and the outcome of the last step.
        """
        messages = self.conversation_manager.get_conversation(session_id)
        if not messages:
            return "Starting agent session..."
        
        last_msg = messages[-1]
        role = last_msg.get("role")
        
        if turn == 1:
            return "Reasoning about requirements and planning diagram layout..."
            
        if role == "tool":
            tool_name = last_msg.get("name")
            content = last_msg.get("content", "")
            
            if tool_name == "init_diagram":
                return "Canvas initialized. Generating diagram components..."
            elif tool_name == "compile_json_spec":
                if "error" in content.lower() or "fail" in content.lower():
                    return "Compilation failed. Rethinking diagram specification..."
                return "Diagram specification compiled. Applying topological layout rules..."
            elif tool_name in ["validate_file", "builder_validate"]:
                if "error" in content.lower() or "violation" in content.lower() or "collision" in content.lower():
                    return "Topological/domain errors detected. Adjusting component placement..."
                return "Validation passed. Preparing final layout update..."
            elif tool_name == "add_node":
                return "Added node to diagram. Re-aligning container boundaries..."
            elif tool_name == "add_container":
                return "Added group boundary. Re-computing layout coordinates..."
            elif tool_name == "connect":
                return "Connecting nodes and routing process streams..."
            
            return f"Processed tool response for {tool_name}. Determining next steps..."
            
        elif role == "assistant":
            tool_calls = last_msg.get("tool_calls", [])
            if tool_calls:
                names = [tc["function"]["name"] for tc in tool_calls]
                return f"Executing diagram updates: {', '.join(names)}..."
        
        return "Analyzing results and refining component layout..."

