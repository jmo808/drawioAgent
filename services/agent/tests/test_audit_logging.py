import pytest
import logging
import json
from unittest.mock import AsyncMock, patch, MagicMock
from agent.orchestrator import AgentOrchestrator
from agent.config import Settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager

@pytest.fixture
def caplog_audit(caplog):
    caplog.set_level(logging.INFO)
    return caplog

@pytest.mark.asyncio
async def test_audit_logging_chat_request_and_tool_call(caplog_audit):
    settings = Settings(skills_dir="skills/drawio")
    settings.llm_provider = "ollama"
    settings.llm_model = "llama3"
    
    llm_service = AsyncMock(spec=LLMService)
    mock_msg = MagicMock()
    mock_msg.content = "Done"
    mock_msg.tool_calls = None
    llm_service.generate_chat.return_value = mock_msg
    
    mcp_bridge = AsyncMock(spec=MCPBridge)
    mcp_bridge.get_tools.return_value = []
    mcp_bridge.call_tool.side_effect = [
        None, # init_diagram
        {"xml": "<mxfile>mock-xml</mxfile>"} # finalize
    ]
    
    conversation_manager = ConversationManager(settings)
    orchestrator = AgentOrchestrator(
        settings=settings,
        llm_service=llm_service,
        mcp_bridge=mcp_bridge,
        conversation_manager=conversation_manager
    )
    
    # Run orchestrator with headers context simulating incoming API requests
    events = []
    from structlog.testing import capture_logs
    with capture_logs() as cap_logs:
        async for event in orchestrator.run(
            session_id="session-audit-123",
            prompt="hello agent",
            request_id="req-uuid-999",
            user_identity="test-user-sub"
        ):
            events.append(event)
        
    # Analyze caplog for audit events
    audit_records = [log for log in cap_logs if log.get("audit") is True]
            
    # Assertions
    assert len(audit_records) >= 1
    
    # Check chat request audit event
    chat_events = [r for r in audit_records if r.get("event_type") == "chat_request"]
    assert len(chat_events) == 1
    chat_ev = chat_events[0]
    assert chat_ev["request_id"] == "req-uuid-999"
    assert chat_ev["user_identity"] == "test-user-sub"
    assert chat_ev["details"]["provider"] == "ollama"
    assert chat_ev["details"]["model"] == "llama3"
    
    # Check init_diagram tool call audit event
    tool_events = [r for r in audit_records if r.get("event_type") == "mcp_tool_call"]
    assert len(tool_events) >= 1
    tool_ev = tool_events[0]
    assert tool_ev["request_id"] == "req-uuid-999"
    assert tool_ev["user_identity"] == "test-user-sub"
    assert tool_ev["details"]["tool_name"] in ["init_diagram", "finalize"]
