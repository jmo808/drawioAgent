import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json
from agent.orchestrator import AgentOrchestrator
from agent.config import Settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager

@pytest.mark.asyncio
async def test_orchestrator_schema_validation_retry_and_bypass():
    """
    Verifies that when compile_json_spec receives an invalid spec:
    1. The orchestrator intercepts it on the first turn and triggers a schema validation error.
    2. A system feedback message is added to the history.
    3. On the next turn, if the LLM calls it again with an invalid spec, it bypasses validation
       and forwards it as best-effort.
    """
    settings = Settings(skills_dir="skills/drawio")
    
    # Turn 1: LLM returns compile_json_spec with invalid node type
    mock_msg_1 = MagicMock()
    mock_msg_1.content = None
    mock_tool_call_1 = MagicMock()
    mock_tool_call_1.function.name = "compile_json_spec"
    mock_tool_call_1.function.arguments = json.dumps({
        "spec": {
            "title": "Invalid Node Type Architecture",
            "type": "architecture",
            "containers": [],
            "nodes": [
                {"id": "node_1", "label": "Bad Node", "type": "super_duper_invalid_type", "parentId": "1"}
            ],
            "edges": []
        }
    })
    mock_tool_call_1.id = "call-1"
    mock_msg_1.tool_calls = [mock_tool_call_1]
    
    # Turn 2: LLM returns compile_json_spec with same invalid node type (retry failed)
    mock_msg_2 = MagicMock()
    mock_msg_2.content = None
    mock_tool_call_2 = MagicMock()
    mock_tool_call_2.function.name = "compile_json_spec"
    mock_tool_call_2.function.arguments = json.dumps({
        "spec": {
            "title": "Invalid Node Type Architecture",
            "type": "architecture",
            "containers": [],
            "nodes": [
                {"id": "node_1", "label": "Bad Node", "type": "super_duper_invalid_type", "parentId": "1"}
            ],
            "edges": []
        }
    })
    mock_tool_call_2.id = "call-2"
    mock_msg_2.tool_calls = [mock_tool_call_2]
    
    # Turn 3: Final message
    mock_msg_3 = MagicMock()
    mock_msg_3.content = "All done!"
    mock_msg_3.tool_calls = None
    
    llm_service = AsyncMock(spec=LLMService)
    llm_service.generate_chat.side_effect = [mock_msg_1, mock_msg_2, mock_msg_3]
    
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = [{"name": "compile_json_spec", "inputSchema": {}}]
    mcp_bridge.call_tool.return_value = {"success": True, "valid": True, "xml": "<mxGraphModel/>"}
    
    with patch("os.path.exists", return_value=False):
        conversation_manager = ConversationManager(settings)
        
        orchestrator = AgentOrchestrator(
            settings=settings,
            llm_service=llm_service,
            mcp_bridge=mcp_bridge,
            conversation_manager=conversation_manager
        )
        
        events = []
        async for event in orchestrator.run(
            session_id="session-schema-test",
            prompt="Draw an invalid diagram",
            diagram_xml=None
        ):
            events.append(event)
            
        history = conversation_manager.get_conversation("session-schema-test")
        
        # Verify schema validation errors were caught and fed back
        system_msgs = [m for m in history if m["role"] == "system"]
        # System messages include index 0 (the base prompt) plus any feedback messages
        assert len(system_msgs) >= 2, "Should have added at least one schema error system feedback message"
        
        schema_feedback = system_msgs[-1]["content"]
        assert "schema validation errors" in schema_feedback.lower()
        assert "super_duper_invalid_type" in schema_feedback.lower()
        
        # Verify MCP call_tool was NOT called for the first invalid spec, but WAS called for the second (retry bypass)
        # 1 call for init_diagram, plus 1 call for the bypassed second compile_json_spec, plus 1 call for finalization
        assert mcp_bridge.call_tool.call_count == 3
        mcp_bridge.call_tool.assert_any_call("init_diagram", {})
