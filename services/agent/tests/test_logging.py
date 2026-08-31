import pytest
from fastapi.testclient import TestClient
from agent.server import app
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from structlog.testing import capture_logs

@pytest.fixture
def client():
    return TestClient(app)

def test_request_id_middleware(client):
    req_id = "test-req-id-12345"
    with capture_logs():
        response = client.get("/health", headers={"X-Request-ID": req_id})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == req_id

def test_llm_service_logging(monkeypatch):
    from unittest.mock import AsyncMock
    # mock litellm.acompletion
    import litellm
    monkeypatch.setattr(litellm, "acompletion", AsyncMock(return_value=type('Response', (), {
        'choices': [type('Choice', (), {'message': type('Message', (), {'content': 'test', 'tool_calls': []})})],
        'usage': type('Usage', (), {'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30})
    })))
    
    with capture_logs() as cap_logs:
        from agent.config import Settings
        service = LLMService(Settings())
        import asyncio
        asyncio.run(service.generate(prompt="hello"))
        
    llm_logs = [log for log in cap_logs if log.get('event') == 'LLM call completed']
    assert len(llm_logs) > 0
    log = llm_logs[0]
    assert log['provider'] == 'ollama'
    assert log['model'] == 'llama3'
    assert 'duration_ms' in log
    assert log['token_count'] == 30

def test_mcp_bridge_logging(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    monkeypatch.setattr("agent.mcp_bridge.MCPBridge._send_request", AsyncMock(return_value={"content": [{"text": '{"status": "success"}'}]}))
    monkeypatch.setattr("agent.mcp_bridge.MCPBridge.is_healthy", MagicMock(return_value=True))
    
    with capture_logs() as cap_logs:
        from agent.config import Settings
        bridge = MCPBridge(Settings())
        bridge.tools = [{"name": "add_node"}]
        import asyncio
        asyncio.run(bridge.call_tool("add_node", {"id": "1"}))
        
    mcp_logs = [log for log in cap_logs if log.get('event') == 'MCP tool call completed']
    assert len(mcp_logs) > 0
    log = mcp_logs[0]
    assert log['tool_name'] == 'add_node'
    assert 'duration_ms' in log
