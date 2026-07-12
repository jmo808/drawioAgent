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
            progress_msg = "Planning layout and structural changes..." if turn == 1 else "Analyzing results and placing nodes..."
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
                    
                    yield {
                        "event": "tool_progress",
                        "data": {
                            "toolName": tool_name,
                            "step": step_num,
                            "totalSteps": total_steps,
                            "message": f"Executing tool {tool_name}"
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
                if "xml" in finalize_res:
                    final_xml = finalize_res["xml"]
                elif "content" in finalize_res and finalize_res["content"]:
                    final_xml = finalize_res["content"][0].get("text", "")
            
            yield {"event": "diagram_update", "data": {"xml": final_xml}}
        except Exception as e:
            logger.error(f"Failed to finalize diagram: {e}")
            yield {"event": "error", "data": {"message": f"Failed to finalize diagram: {str(e)}"}}

        # 5. Emit final chat response
        if not final_text or not final_text.strip():
            final_text = "I have successfully compiled your architecture request and updated the diagram canvas."
            self.conversation_manager.add_message(session_id, "assistant", final_text)
        yield {"event": "chat_message", "data": {"text": final_text}}
