import pytest
import os
import asyncio
import time
from unittest.mock import AsyncMock, patch, MagicMock
from agent.config import Settings
from agent.llm_service import LLMService
from agent.circuit_breaker import (
    circuit_breaker_manager, 
    CircuitBreakerManager, 
    llm_circuit_state
)
import pybreaker

@pytest.fixture(autouse=True)
def reset_breaker_manager():
    # Clear breakers to ensure clean state for each test
    circuit_breaker_manager.breakers.clear()
    circuit_breaker_manager.fail_max = 5
    circuit_breaker_manager.reset_timeout = 30.0

@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_5_failures():
    settings = Settings(
        llm_provider="openai",
        llm_model="gpt-4",
        llm_api_key="test-key"
    )
    service = LLMService(settings)
    
    # Configure breaker to open after 5 failures and reset after 30s
    circuit_breaker_manager.fail_max = 5
    
    # Mock Litellm to fail
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.side_effect = Exception("API connection error")
        
        # Trigger 5 failures
        for i in range(5):
            with pytest.raises(Exception) as excinfo:
                await service.generate("Hello")
            # The inner exception should propagate (API connection error) since circuit is still closing
            assert "API connection error" in str(excinfo.value)
            
        # The 6th request should fail immediately with open circuit message
        with pytest.raises(Exception) as excinfo:
            await service.generate("Hello")
        assert "AI service temporarily unavailable" in str(excinfo.value)
        
        # Verify litellm was only called 5 times
        assert mock_acompletion.call_count == 5
        
        # Verify metric is open (1)
        assert llm_circuit_state.labels(provider="openai")._value.get() == 1.0

@pytest.mark.asyncio
async def test_circuit_breaker_half_opens_and_closes():
    settings = Settings(
        llm_provider="openai",
        llm_model="gpt-4",
        llm_api_key="test-key"
    )
    service = LLMService(settings)
    
    # Configure breaker with very short reset timeout for testing
    breaker = circuit_breaker_manager.get_breaker("openai")
    breaker._fail_max = 2
    breaker._reset_timeout = 0.1  # 100ms reset timeout
    
    # Mock litellm to fail first
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.side_effect = Exception("Connection Failed")
        
        # 2 failures opens the circuit
        for _ in range(2):
            with pytest.raises(Exception):
                await service.generate("Hello")
                
        # Verify circuit is open
        assert llm_circuit_state.labels(provider="openai")._value.get() == 1.0
        
        # Wait for reset timeout to pass
        await asyncio.sleep(0.15)
        
        # Circuit is now half-open. We mock success.
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="Success response"))]
        mock_acompletion.side_effect = None
        mock_acompletion.return_value = mock_response
        
        # Successful request closes the circuit
        result = await service.generate("Hello")
        assert result == "Success response"
        
        # Verify circuit is closed (0)
        assert llm_circuit_state.labels(provider="openai")._value.get() == 0.0

@pytest.mark.asyncio
async def test_circuit_breaker_provider_isolation():
    settings_openai = Settings(
        llm_provider="openai",
        llm_model="gpt-4",
        llm_api_key="test-key"
    )
    settings_gemini = Settings(
        llm_provider="gemini",
        llm_model="gemini-pro",
        llm_api_key="test-key"
    )
    service_openai = LLMService(settings_openai)
    service_gemini = LLMService(settings_gemini)
    
    # Open OpenAI breaker by generating 5 failures
    circuit_breaker_manager.fail_max = 5
    with patch("agent.llm_service.litellm.acompletion", new_callable=AsyncMock) as mock_acompletion:
        mock_acompletion.side_effect = Exception("OpenAI down")
        for _ in range(5):
            with pytest.raises(Exception):
                await service_openai.generate("Hello")
                
        # OpenAI should be open
        with pytest.raises(Exception) as excinfo:
            await service_openai.generate("Hello")
        assert "AI service temporarily unavailable" in str(excinfo.value)
        assert llm_circuit_state.labels(provider="openai")._value.get() == 1.0
        
        # Gemini should still be closed (0) and make the request
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="Gemini is up"))]
        mock_acompletion.side_effect = None
        mock_acompletion.return_value = mock_response
        
        res = await service_gemini.generate("Hello")
        assert res == "Gemini is up"
        assert llm_circuit_state.labels(provider="gemini")._value.get() == 0.0

def test_circuit_breaker_manager_config():
    # Set env vars and check initialization
    os.environ["CIRCUIT_FAIL_MAX"] = "10"
    os.environ["CIRCUIT_RESET_TIMEOUT"] = "45.0"
    try:
        manager = CircuitBreakerManager()
        assert manager.fail_max == 10
        assert manager.reset_timeout == 45.0
    finally:
        del os.environ["CIRCUIT_FAIL_MAX"]
        del os.environ["CIRCUIT_RESET_TIMEOUT"]
