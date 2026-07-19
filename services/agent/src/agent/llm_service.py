import asyncio
import logging
import random
import os
import json
import re

import litellm
from typing import AsyncGenerator, Any
from agent.config import Settings

logger = logging.getLogger(__name__)

class MockFunction:
    def __init__(self, name: str, arguments: str):
        self.name = name
        self.arguments = arguments

class MockToolCall:
    def __init__(self, id: str, name: str, arguments: str):
        self.id = id
        self.type = "function"
        self.function = MockFunction(name, arguments)

class MockMessage:
    def __init__(self, content: str | None, tool_calls: list[MockToolCall] | None = None):
        self.content = content
        self.tool_calls = tool_calls
        self.role = "assistant"

def format_mcp_tool(mcp_tool: dict[str, Any]) -> dict[str, Any]:
    """
    Formats a Model Context Protocol (MCP) tool definition
    into the format expected by LiteLLM / OpenAI function calling.
    """
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
    """
    Service class wrapping LiteLLM for LLM interaction.
    """
    def __init__(self, config: Settings):
        self.config = config
        self.model_string = f"{config.llm_provider}/{config.llm_model}"
        self.temperature = config.llm_temperature
        if config.llm_api_key:
            os.environ["GEMINI_API_KEY"] = config.llm_api_key
            os.environ["GOOGLE_API_KEY"] = config.llm_api_key

        self.fixtures = []
        if self.config.mock_llm:
            fixtures_path = os.path.join(os.path.dirname(__file__), "fixtures")
            if os.path.exists(fixtures_path):
                for filename in os.listdir(fixtures_path):
                    if filename.endswith(".json"):
                        try:
                            with open(os.path.join(fixtures_path, filename), "r") as f:
                                self.fixtures.append(json.load(f))
                        except Exception as e:
                            logger.error(f"Failed to load mock fixture {filename}: {e}")

    async def generate(self, prompt: str, tools: list[dict[str, Any]] | None = None) -> str:
        """
        Sends a prompt to the LLM and returns the text response.
        """
        if self.config.mock_llm:
            return "I have created the requested diagram."

        kwargs: dict[str, Any] = {
            "model": self.model_string,
            "messages": [{"role": "user", "content": prompt}]
        }
        
        if self.config.llm_api_key:
            kwargs["api_key"] = self.config.llm_api_key
            
        if tools:
            kwargs["tools"] = [format_mcp_tool(t) for t in tools]

        response = await litellm.acompletion(**kwargs)
        
        choice = response.choices[0]
        if hasattr(choice.message, "content") and choice.message.content is not None:
            return choice.message.content
        return ""

    async def stream(self, prompt: str, tools: list[dict[str, Any]] | None = None) -> AsyncGenerator[str, None]:
        """
        Sends a prompt to the LLM and streams the response text chunks.
        """
        if self.config.mock_llm:
            yield "I have created the requested diagram."
            return

        kwargs: dict[str, Any] = {
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
            if hasattr(choice, "delta") and hasattr(choice.delta, "content") and choice.delta.content is not None:
                yield choice.delta.content

    async def generate_chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> Any:
        """
        Sends conversation messages to the LLM and returns the response message object.
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
                return MockMessage(content="I can help with diagrams. Try asking me to create a 3-tier app or select a template.")
            
            if messages and messages[-1].get("role") == "tool":
                return MockMessage(content=matched_fixture.get("finalResponse"))
            else:
                tool_calls_data = matched_fixture.get("toolCalls")
                if tool_calls_data:
                    mock_tool_calls = []
                    for idx, tc in enumerate(tool_calls_data):
                        args_str = json.dumps(tc.get("arguments", {}))
                        mock_tool_calls.append(MockToolCall(
                            id=f"call_mock_{idx}_{random.randint(1000, 9999)}",
                            name=tc.get("name"),
                            arguments=args_str
                        ))
                    return MockMessage(content=None, tool_calls=mock_tool_calls)
                else:
                    return MockMessage(content=matched_fixture.get("finalResponse"))

        kwargs: dict[str, Any] = {
            "model": self.model_string,
            "messages": messages,
            "temperature": self.temperature,
        }
        
        if self.config.llm_api_key:
            kwargs["api_key"] = self.config.llm_api_key
            
        if tools:
            kwargs["tools"] = [format_mcp_tool(t) for t in tools]

        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                response = await litellm.acompletion(**kwargs)
                return response.choices[0].message
            except Exception as e:
                if attempt == max_retries - 1:
                    raise  # Re-raise on final attempt
                delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(f"LLM call failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {delay:.1f}s...")
                await asyncio.sleep(delay)
