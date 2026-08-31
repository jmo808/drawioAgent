import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.orchestrator import AgentOrchestrator
from agent.config import Settings

@pytest.fixture
def otel_mocks():
    mock_span = MagicMock()
    mock_span.__enter__.return_value = mock_span
    
    mock_tracer = MagicMock()
    mock_tracer.start_as_current_span.return_value = mock_span
    
    with patch("opentelemetry.trace.get_tracer", return_value=mock_tracer):
        yield mock_tracer, mock_span

@pytest.mark.asyncio
async def test_llm_service_generate_tracing(otel_mocks):
    mock_tracer, mock_span = otel_mocks
    settings = Settings(mock_llm=False, llm_provider="test-provider", llm_model="test-model")
    llm_service = LLMService(settings)
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "mocked reply"
    mock_response.choices = [mock_choice]
    mock_response.usage.prompt_tokens = 10
    mock_response.usage.completion_tokens = 20
    mock_response.usage.total_tokens = 30
    
    with patch("litellm.acompletion", return_value=mock_response):
        res = await llm_service.generate("hello")
        assert res == "mocked reply"
        
    mock_tracer.start_as_current_span.assert_called_with("llm.generate")
    mock_span.set_attribute.assert_any_call("provider", "test-provider")
    mock_span.set_attribute.assert_any_call("model", "test-model")
    mock_span.set_attribute.assert_any_call("prompt_tokens", 10)
    mock_span.set_attribute.assert_any_call("completion_tokens", 20)
    mock_span.set_attribute.assert_any_call("total_tokens", 30)

@pytest.mark.asyncio
async def test_mcp_bridge_tool_call_tracing(otel_mocks):
    mock_tracer, mock_span = otel_mocks
    settings = Settings()
    bridge = MCPBridge(settings)
    
    mock_response = {"result": {"success": True}}
    
    # Use allowlisted tool name "init_diagram"
    with patch.object(bridge, "_send_request", return_value=mock_response), \
         patch.object(bridge, "is_healthy", return_value=True):
        res = await bridge.call_tool("init_diagram", {})
        assert res == {"success": True}
        
    mock_tracer.start_as_current_span.assert_called_with("mcp.tool_call")
    mock_span.set_attribute.assert_called_with("tool_name", "init_diagram")

@pytest.mark.asyncio
async def test_orchestrator_init_tracing(otel_mocks):
    mock_tracer, mock_span = otel_mocks
    settings = Settings(mock_llm=True)
    
    llm_service = MagicMock()
    
    # Mock generate_chat to return a coroutine
    async def mock_gen_chat(*args, **kwargs):
        return MagicMock(content="hello")
    llm_service.generate_chat = mock_gen_chat
    
    mcp_bridge = MagicMock()
    mcp_bridge.call_tool = AsyncMock(return_value={})
    conversation_manager = MagicMock()
    
    orchestrator = AgentOrchestrator(settings, llm_service, mcp_bridge, conversation_manager)
    
    events = []
    async for event in orchestrator.run("session-123", "hello", diagram_xml=None):
        events.append(event)
        
    mock_tracer.start_as_current_span.assert_any_call("mcp.init")
