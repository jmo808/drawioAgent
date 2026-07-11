import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agent.llm_service import LLMService, format_mcp_tool
from agent.config import Settings
import litellm

def test_format_mcp_tool():
    mcp_tool = {
        "name": "add_node",
        "description": "Add a new node to the diagram",
        "inputSchema": {
            "type": "object",
            "properties": {
                "label": {"type": "string"}
            },
            "required": ["label"]
        }
    }
    
    formatted = format_mcp_tool(mcp_tool)
    assert formatted["type"] == "function"
    assert formatted["function"]["name"] == "add_node"
    assert formatted["function"]["description"] == "Add a new node to the diagram"
    assert formatted["function"]["parameters"] == mcp_tool["inputSchema"]

@pytest.mark.asyncio
async def test_llm_service_generate():
    settings = Settings(
        llm_provider="openai",
        llm_model="gpt-4",
        llm_api_key="test-key"
    )
    service = LLMService(settings)
    
    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content="Hello!"))
    ]
    
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.return_value = mock_response
        
        result = await service.generate("Hello agent")
        
        assert result == "Hello!"
        mock_acompletion.assert_called_once_with(
            model="openai/gpt-4",
            messages=[{"role": "user", "content": "Hello agent"}],
            api_key="test-key"
        )

@pytest.mark.asyncio
async def test_llm_service_stream():
    settings = Settings(
        llm_provider="gemini",
        llm_model="gemini-pro",
        llm_api_key="test-gemini-key"
    )
    service = LLMService(settings)
    
    # Mocking async generator return value for stream
    async def mock_async_generator():
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content="Hi"))])
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content=" there"))])
        
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.return_value = mock_async_generator()
        
        chunks = []
        async for chunk in service.stream("Hello agent"):
            chunks.append(chunk)
            
        assert chunks == ["Hi", " there"]
        mock_acompletion.assert_called_once_with(
            model="gemini/gemini-pro",
            messages=[{"role": "user", "content": "Hello agent"}],
            api_key="test-gemini-key",
            stream=True
        )

@pytest.mark.asyncio
async def test_llm_service_generate_error():
    settings = Settings(
        llm_provider="openai",
        llm_model="gpt-4",
        llm_api_key="invalid-key"
    )
    service = LLMService(settings)
    
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.side_effect = Exception("Invalid API Key")
        
        with pytest.raises(Exception) as exc_info:
            await service.generate("hello")
        assert "Invalid API Key" in str(exc_info.value)
