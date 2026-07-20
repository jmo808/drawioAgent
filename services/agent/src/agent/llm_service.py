"""LLM Service utilizing litellm with circuit breakers and retry logic."""

import asyncio
import json
import os
import random
import re
import time
from typing import AsyncGenerator, Any, Dict, List, Optional
import litellm
import pybreaker
import structlog
from opentelemetry import trace

from agent.circuit_breaker import circuit_breaker_manager
from agent.config import Settings
from agent.metrics import llm_call_duration_seconds, llm_tokens_total

logger = structlog.get_logger(__name__)


class MockFunction:
    """Mock for function metadata in mock responses."""

    def __init__(self, name: str, arguments: str) -> None:
        """Initialize mock function."""
        self.name = name
        self.arguments = arguments


class MockToolCall:
    """Mock for tool calls in mock responses."""

    def __init__(self, id_val: str, name: str, arguments: str) -> None:
        """Initialize mock tool call."""
        self.id = id_val
        self.type = "function"
        self.function = MockFunction(name, arguments)


class MockMessage:
    """Mock for assistant message response."""

    def __init__(
        self,
        content: Optional[str],
        tool_calls: Optional[List[MockToolCall]] = None
    ) -> None:
        """Initialize mock message."""
        self.content = content
        self.tool_calls = tool_calls
        self.role = "assistant"


def format_mcp_tool(mcp_tool: Dict[str, Any]) -> Dict[str, Any]:
    """Formats an MCP tool definition for LiteLLM / OpenAI style."""
    return {
        "type": "function",
        "function": {
            "name": mcp_tool["name"],
            "description": mcp_tool.get("description", ""),
            "parameters": mcp_tool.get("inputSchema", {
                "type": "object",
                "properties": {},
                "required": []
            })
        }
    }


class LLMService:
    """Service wrapping LiteLLM for LLM interaction."""

    def __init__(self, config: Settings) -> None:
        """Initialize LLMService configurations."""
        self.config = config
        self.model_string = f"{config.llm_provider}/{config.llm_model}"
        self.temperature = config.llm_temperature
        if "gemini" in self.model_string.lower():
            self.temperature = 1.0
        if config.llm_api_key:
            os.environ["GEMINI_API_KEY"] = config.llm_api_key
            os.environ["GOOGLE_API_KEY"] = config.llm_api_key

        self.fixtures: List[Dict[str, Any]] = []
        if self.config.mock_llm:
            fixtures_path = os.path.join(
                os.path.dirname(__file__), "fixtures"
            )
            if os.path.exists(fixtures_path):
                for filename in os.listdir(fixtures_path):
                    if filename.endswith(".json"):
                        try:
                            file_path = os.path.join(fixtures_path, filename)
                            with open(file_path, "r") as f:
                                self.fixtures.append(json.load(f))
                        except Exception as e:
                            logger.error(
                                f"Failed to load mock fixture {filename}: {e}"
                            )

    async def generate(
        self,
        prompt: str,
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """Sends prompt to the LLM and returns the text response."""
        if self.config.mock_llm:
            return "I have created the requested diagram."

        kwargs: Dict[str, Any] = {
            "model": self.model_string,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        if self.config.llm_api_key:
            kwargs["api_key"] = self.config.llm_api_key
            
        if tools:
            kwargs["tools"] = [format_mcp_tool(t) for t in tools]

        start_time = time.time()
        tracer = trace.get_tracer("drawio-agent")
        with tracer.start_as_current_span("llm.generate") as otel_span:
            otel_span.set_attribute("provider", self.config.llm_provider)
            otel_span.set_attribute("model", self.config.llm_model)
            try:
                response = await circuit_breaker_manager.call_async(
                    self.config.llm_provider,
                    litellm.acompletion,
                    **kwargs
                )
                duration = time.time() - start_time
                duration_ms = int(duration * 1000)
                
                llm_call_duration_seconds.labels(
                    provider=self.config.llm_provider, 
                    model=self.config.llm_model
                ).observe(duration)
                
                token_count = 0
                if hasattr(response, "usage") and response.usage:
                    prompt_tokens = getattr(response.usage, "prompt_tokens", 0)
                    comp_tokens = getattr(response.usage, "completion_tokens", 0)
                    total_tokens = getattr(response.usage, "total_tokens", 0)
                    
                    otel_span.set_attribute("prompt_tokens", prompt_tokens)
                    otel_span.set_attribute("completion_tokens", comp_tokens)
                    otel_span.set_attribute("total_tokens", total_tokens)
                    
                    if hasattr(response.usage, "total_tokens"):
                        token_count = getattr(response.usage, "total_tokens", 0)

                    if isinstance(prompt_tokens, int) and prompt_tokens > 0:
                        llm_tokens_total.labels(
                            provider=self.config.llm_provider,
                            model=self.config.llm_model,
                            token_type="prompt"
                        ).inc(prompt_tokens)
                    
                    if isinstance(comp_tokens, int) and comp_tokens > 0:
                        llm_tokens_total.labels(
                            provider=self.config.llm_provider,
                            model=self.config.llm_model,
                            token_type="completion"
                        ).inc(comp_tokens)

                logger.info(
                    "LLM call completed",
                    provider=self.config.llm_provider,
                    model=self.config.llm_model,
                    duration_ms=duration_ms,
                    token_count=token_count
                )
                
                choice = response.choices[0]
                msg = choice.message
                if hasattr(msg, "content") and msg.content is not None:
                    return msg.content
                return ""
            except pybreaker.CircuitBreakerError as e:
                otel_span.record_exception(e)
                otel_span.set_status(trace.StatusCode.ERROR, str(e))
                duration_ms = int((time.time() - start_time) * 1000)
                logger.error(
                    "LLM call failed (circuit open)",
                    provider=self.config.llm_provider,
                    model=self.config.llm_model,
                    duration_ms=duration_ms,
                    error=str(e)
                )
                raise Exception("AI service temporarily unavailable")
            except Exception as e:
                otel_span.record_exception(e)
                otel_span.set_status(trace.StatusCode.ERROR, str(e))
                duration_ms = int((time.time() - start_time) * 1000)
                logger.error(
                    "LLM call failed",
                    provider=self.config.llm_provider,
                    model=self.config.llm_model,
                    duration_ms=duration_ms,
                    error=str(e)
                )
                raise

    async def stream(
        self,
        prompt: str,
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[str, None]:
        """Sends prompt to the LLM and streams the response text chunks."""
        if self.config.mock_llm:
            yield "I have created the requested diagram."
            return

        kwargs: Dict[str, Any] = {
            "model": self.model_string,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }
        
        if self.config.llm_api_key:
            kwargs["api_key"] = self.config.llm_api_key
            
        if tools:
            kwargs["tools"] = [format_mcp_tool(t) for t in tools]

        response_stream = await litellm.acompletion(**kwargs)
        
        async for chunk in response_stream:
            choice = chunk.choices[0]
            if (
                hasattr(choice, "delta")
                and hasattr(choice.delta, "content")
                and choice.delta.content is not None
            ):
                yield choice.delta.content

    async def generate_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> Any:
        """Sends conversation messages to the LLM.

        Includes retry logic with exponential backoff for transient failures.
        """
        if self.config.mock_llm:
            user_prompt = ""
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_prompt = msg.get("content", "")
                    break
            
            matched_fixture = None
            for fixture in self.fixtures:
                pattern = fixture.get("promptPattern", "")
                if re.search(pattern, user_prompt, re.IGNORECASE):
                    matched_fixture = fixture
                    break
            
            if not matched_fixture:
                return MockMessage(
                    content=(
                        "I can help with diagrams. Try asking me to create a "
                        "3-tier app or select a template."
                    )
                )
            
            if messages and messages[-1].get("role") == "tool":
                return MockMessage(content=matched_fixture.get("finalResponse"))
            else:
                tool_calls_data = matched_fixture.get("toolCalls")
                if tool_calls_data:
                    mock_tool_calls = []
                    for idx, tc in enumerate(tool_calls_data):
                        args_str = json.dumps(tc.get("arguments", {}))
                        mock_tool_calls.append(MockToolCall(
                            id_val=(
                                f"call_mock_{idx}_"
                                f"{random.randint(1000, 9999)}"
                            ),
                            name=tc.get("name"),
                            arguments=args_str
                        ))
                    return MockMessage(content=None, tool_calls=mock_tool_calls)
                else:
                    return MockMessage(
                        content=matched_fixture.get("finalResponse")
                    )

        kwargs: Dict[str, Any] = {
            "model": self.model_string,
            "messages": messages,
        }
        if "gemini" not in self.model_string.lower():
            kwargs["temperature"] = self.temperature
        
        if self.config.llm_api_key:
            kwargs["api_key"] = self.config.llm_api_key
            
        if tools:
            kwargs["tools"] = [format_mcp_tool(t) for t in tools]

        max_retries = 3
        base_delay = 1.0
        tracer = trace.get_tracer("drawio-agent")
        for attempt in range(max_retries):
            start_time = time.time()
            with tracer.start_as_current_span("llm.generate") as otel_span:
                otel_span.set_attribute("provider", self.config.llm_provider)
                otel_span.set_attribute("model", self.config.llm_model)
                try:
                    try:
                        response = await circuit_breaker_manager.call_async(
                            self.config.llm_provider,
                            litellm.acompletion,
                            **kwargs
                        )
                    except pybreaker.CircuitBreakerError:
                        # Circuit is open, do not retry, raise immediately
                        raise Exception("AI service temporarily unavailable")
                    
                    duration = time.time() - start_time
                    llm_call_duration_seconds.labels(
                        provider=self.config.llm_provider, 
                        model=self.config.llm_model
                    ).observe(duration)
                    
                    if hasattr(response, "usage") and response.usage:
                        p_tok = getattr(response.usage, "prompt_tokens", 0)
                        c_tok = getattr(response.usage, "completion_tokens", 0)
                        t_tok = getattr(response.usage, "total_tokens", 0)
                        
                        otel_span.set_attribute("prompt_tokens", p_tok)
                        otel_span.set_attribute("completion_tokens", c_tok)
                        otel_span.set_attribute("total_tokens", t_tok)
                        
                        if isinstance(p_tok, int) and p_tok > 0:
                            llm_tokens_total.labels(
                                provider=self.config.llm_provider,
                                model=self.config.llm_model,
                                token_type="prompt"
                            ).inc(p_tok)
                        
                        if isinstance(c_tok, int) and c_tok > 0:
                            llm_tokens_total.labels(
                                provider=self.config.llm_provider,
                                model=self.config.llm_model,
                                token_type="completion"
                            ).inc(c_tok)

                    return response.choices[0].message
                except Exception as e:
                    otel_span.record_exception(e)
                    otel_span.set_status(trace.StatusCode.ERROR, str(e))
                    if str(e) == "AI service temporarily unavailable":
                        raise
                    if attempt == max_retries - 1:
                        raise  # Re-raise on final attempt
                    delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                    logger.warning(
                        f"LLM call failed (attempt {attempt + 1}/{max_retries})"
                        f": {e}. Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)
