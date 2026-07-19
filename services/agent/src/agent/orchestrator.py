import json
import logging
import asyncio
from typing import AsyncGenerator, Dict, Any, List
from datetime import datetime, timezone
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
        diagram_xml: str | None = None,
        classification: str | None = None,
        request_id: str | None = None,
        user_identity: str | None = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Runs the orchestration loop and streams back progress, updates, or errors.
        """
        # Audit log the incoming chat request
        chat_audit_log = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "event_type": "chat_request",
            "request_id": request_id,
            "user_identity": user_identity,
            "details": {
                "provider": self.settings.llm_provider,
                "model": self.settings.llm_model
            },
            "audit": True
        }
        logger.info(json.dumps(chat_audit_log))

        async def call_tool_audited(name: str, arguments: dict):
            tool_audit_log = {
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "event_type": "mcp_tool_call",
                "request_id": request_id,
                "user_identity": user_identity,
                "details": {
                    "tool_name": name,
                    "arguments": arguments
                },
                "audit": True
            }
            logger.info(json.dumps(tool_audit_log))
            return await self.mcp_bridge.call_tool(name, arguments)

        # Gate cloud LLM usage based on classification level
        is_cloud_provider = self.settings.llm_provider in ["gemini", "openai"]
        if is_cloud_provider and classification and classification.lower() in ["confidential", "restricted"]:
            yield {
                "event": "error",
                "data": {
                    "message": f"Cloud LLM usage is forbidden for {classification} sessions."
                }
            }
            return
        # 1. Initialize MCP state
        try:
            if diagram_xml:
                # Security content scan if using a cloud LLM provider
                is_cloud_provider = self.settings.llm_provider in ["gemini", "openai"]
                if is_cloud_provider:
                    from agent.content_filter import ContentFilter
                    findings = ContentFilter.scan(diagram_xml)
                    if findings:
                        yield {
                            "event": "provider_warning",
                            "data": {
                                "message": (
                                    "Warning: The current diagram contains potentially sensitive "
                                    f"information ({findings[0]}) and is being sent "
                                    f"to a cloud LLM provider ({self.settings.llm_provider})."
                                )
                            }
                        }

                yield {
                    "event": "tool_progress",
                    "data": {
                        "toolName": "open_drawio_xml",
                        "step": 0,
                        "totalSteps": 2,
                        "message": "Restoring diagram state from snapshot"
                    }
                }
                await call_tool_audited("open_drawio_xml", {"content": diagram_xml})
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
                await call_tool_audited("init_diagram", {})
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
        text_already_added = False
        
        while turn < max_turns:
            turn += 1
            # Truncate conversation to keep context window manageable
            if turn > 1:
                self.conversation_manager.truncate_conversation(session_id, max_history_messages=40)
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
                # Call LLM with current history and tools, streaming heartbeats in real-time
                response_msg = None
                async for event_or_res in self._generate_chat_with_heartbeat(
                    session_id, messages, tools, turn, max_turns
                ):
                    if isinstance(event_or_res, dict) and event_or_res.get("event") == "tool_progress":
                        yield event_or_res
                    else:
                        response_msg = event_or_res
            except Exception as e:
                err_str = str(e)
                # Handle "empty output" errors from the model API — retry instead of crashing
                if "empty" in err_str.lower() and "tool calls" in err_str.lower():
                    logger.warning(f"LLM returned empty response on turn {turn} — retrying.")
                    continue
                logger.error(f"LLM generation failed: {e}")
                yield {"event": "error", "data": {"message": f"LLM generation failed: {err_str}"}}
                return

            # Guard: if the LLM response is None or has no content and no tool calls, retry
            if response_msg is None:
                logger.warning(f"LLM returned None response on turn {turn} — retrying.")
                continue

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
                    
                    try:
                        args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                    except Exception:
                        args = {}

                    if tool_name == "compile_json_spec" and isinstance(args, dict):
                        spec = args.get("spec", {}) or {}
                        num_containers = len(spec.get("containers", []) or [])
                        num_nodes = len(spec.get("nodes", []) or [])
                        num_edges = len(spec.get("edges", []) or [])
                        
                        compile_steps = []
                        if num_containers > 0:
                            compile_steps.append({
                                "name": "Boundary Group",
                                "message": f"Adding {num_containers} container boundaries..."
                            })
                        if num_nodes > 0:
                            compile_steps.append({
                                "name": "Shape Placer",
                                "message": f"Placing {num_nodes} shapes onto diagram..."
                            })
                        if num_edges > 0:
                            compile_steps.append({
                                "name": "Connector Router",
                                "message": f"Routing {num_edges} links and process lines..."
                            })
                        compile_steps.append({
                            "name": "Layout Compiler",
                            "message": "Compiling full diagram specification..."
                        })
                        
                        total_substeps = len(compile_steps)
                        for s_idx, step_info in enumerate(compile_steps):
                            yield {
                                "event": "tool_progress",
                                "data": {
                                    "toolName": step_info["name"],
                                    "step": s_idx + 1,
                                    "totalSteps": total_substeps,
                                    "message": step_info["message"]
                                }
                            }
                            await asyncio.sleep(0.8)
                    else:
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
                        # Small sleep to ensure the frontend renders the tool progress step
                        await asyncio.sleep(0.8)
                    
                    try:
                        tool_res = await call_tool_audited(tool_name, args)
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
                # Check if the last tool execution was compile_json_spec and if it failed validation
                history = self.conversation_manager.get_conversation(session_id)
                last_tool_msg = None
                for msg in reversed(history):
                    if msg.get("role") == "tool":
                        last_tool_msg = msg
                        break
                
                if last_tool_msg and last_tool_msg.get("name") == "compile_json_spec":
                    try:
                        res_data = json.loads(last_tool_msg.get("content", "{}"))
                        if isinstance(res_data, dict) and not res_data.get("valid", True):
                            errors = res_data.get("validation_errors", [])
                            err_msg = "\n".join([f"- {e}" for e in errors])
                            system_feedback = {
                                "role": "user",
                                "content": (
                                    "Your last diagram specification is invalid and failed validation with the following errors:\n"
                                    f"{err_msg}\n\n"
                                    "You MUST correct these errors by modifying the spec and calling compile_json_spec again. "
                                    "Do not finish or output final text until the validation errors are fully resolved."
                                )
                            }
                            self.conversation_manager.get_conversation(session_id).append(system_feedback)
                            logger.info("Spec validation failed. Forcing LLM to correct the spec.")
                            continue
                    except Exception as ex:
                        logger.error(f"Error checking last tool message validation: {ex}")

                # Final turn - text response only
                final_text = response_msg.content or ""

                # Guard: Detect if the LLM dumped raw JSON/XML as text instead of calling a tool.
                # This happens when max_tokens truncates mid-tool-call or the model fails to use function calling.
                if final_text and self._looks_like_raw_spec(final_text) and turn < max_turns:
                    logger.warning("Detected raw JSON/XML spec dumped as text — forcing retry via tool call.")
                    correction = {
                        "role": "user",
                        "content": (
                            "You output a raw JSON or XML diagram specification as text instead of calling the compile_json_spec tool. "
                            "NEVER output raw JSON or XML in chat. You MUST use the compile_json_spec tool with the spec as its argument. "
                            "Call compile_json_spec now with the complete specification."
                        )
                    }
                    self.conversation_manager.get_conversation(session_id).append(correction)
                    continue

                self.conversation_manager.add_message(session_id, "assistant", final_text)
                text_already_added = True
                break

        # 4. Finalize diagram and emit diagram_update
        try:
            # Yield finalizer and validator progress
            yield {
                "event": "tool_progress",
                "data": {
                    "toolName": "Finalizer & Validator",
                    "step": 1,
                    "totalSteps": 1,
                    "message": "Running validations and updating canvas..."
                }
            }
            await asyncio.sleep(0.8)
            
            finalize_res = await call_tool_audited("finalize", {})
            final_xml = ""
            validation_errors = []
            
            if isinstance(finalize_res, dict):
                # Check for XML directly in response dict first
                if "xml" in finalize_res:
                    final_xml = finalize_res["xml"]
                
                # Check content for serialized json details
                if "content" in finalize_res and finalize_res["content"]:
                    text = finalize_res["content"][0].get("text", "")
                    if text.strip().startswith("<"):
                        final_xml = text
                    else:
                        try:
                            detail_json = json.loads(text)
                            if isinstance(detail_json, dict):
                                if "xml" in detail_json:
                                    final_xml = detail_json["xml"]
                                if "errors" in detail_json:
                                    validation_errors = detail_json["errors"]
                        except Exception:
                            pass
                
                # If we still don't have XML and it's a validation error, we fall back to raising
                if finalize_res.get("isError") and not final_xml:
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
            
            if final_xml:
                yield {"event": "diagram_update", "data": {"xml": final_xml}}
                if validation_errors:
                    warnings_list = "\n".join([f"- {err}" for err in validation_errors])
                    logger.warning(f"Diagram finalized with validation warnings:\n{warnings_list}")
            else:
                raise RuntimeError("No XML returned from finalize")
        except Exception as e:
            logger.error(f"Failed to finalize diagram: {e}")
            yield {"event": "error", "data": {"message": f"Failed to finalize diagram: {str(e)}"}}

        # 5. Emit final chat response
        if not final_text or not final_text.strip():
            final_text = "I have successfully compiled your architecture request and updated the diagram canvas."
        else:
            final_text = self._strip_drawio_links(final_text)
            
        if not text_already_added:
            self.conversation_manager.add_message(session_id, "assistant", final_text)
        yield {"event": "chat_message", "data": {"text": final_text}}

    def _strip_drawio_links(self, text: str) -> str:
        """
        Strips draw.io diagram links and editor URLs from the assistant text response
        to prevent duplicate or confusing links when the diagram is already loaded.
        """
        import re
        # Remove markdown links pointing to diagrams.net, draw.io, or relative /draw/
        text = re.sub(
            r'\[[^\]]*\]\((?:https?://(?:[a-z0-9-]+\.)?(?:diagrams\.net|draw\.io)|/draw)/?[^\)]*\)',
            '',
            text
        )
        # Remove raw URLs pointing to diagrams.net, draw.io, or relative /draw/
        text = re.sub(
            r'(?:https?://(?:[a-z0-9-]+\.)?(?:diagrams\.net|draw\.io)|/draw)/\S*',
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

    def _looks_like_raw_spec(self, text: str) -> bool:
        """
        Detects if the LLM has dumped a raw JSON spec or XML diagram as text
        instead of properly calling compile_json_spec or open_drawio_xml.
        """
        stripped = text.strip()

        # Check for raw XML (mxGraphModel)
        if '<mxGraphModel' in stripped or '<mxCell' in stripped:
            return True

        # Check for JSON spec patterns — look for the characteristic keys
        # that indicate a compile_json_spec argument was dumped as text
        json_indicators = ['"containers"', '"nodes"', '"edges"', '"sourceId"', '"targetId"']
        indicator_count = sum(1 for ind in json_indicators if ind in stripped)
        if indicator_count >= 3:
            return True

        # Check for JSON code blocks containing spec-like content
        if '```json' in stripped and ('"nodes"' in stripped or '"edges"' in stripped):
            return True

        return False

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

    async def _generate_chat_with_heartbeat(
        self, 
        session_id: str, 
        messages: List[Dict[str, Any]], 
        tools: List[Dict[str, Any]] | None, 
        turn: int, 
        max_turns: int
    ) -> AsyncGenerator[Any, None]:
        """
        Calls generate_chat while concurrently yielding periodic heartbeat progress events
        to keep the thinking bubble active and responsive.
        """
        llm_task = asyncio.create_task(self.llm_service.generate_chat(messages, tools=tools))
        base_msg = self._get_progress_message(session_id, turn)
        dots = 0
        
        while not llm_task.done():
            # Wait for 1.5 seconds or until the LLM task completes
            done, pending = await asyncio.wait([llm_task], timeout=1.5)
            if llm_task.done():
                break
                
            dots = (dots + 1) % 4
            heartbeat_msg = f"{base_msg}{'.' * dots}"
            
            yield {
                "event": "tool_progress",
                "data": {
                    "toolName": "Archimedes AI",
                    "step": turn,
                    "totalSteps": max_turns,
                    "message": heartbeat_msg
                }
            }
            
        # Retrieve the final LLM response
        response_msg = await llm_task
        yield response_msg

