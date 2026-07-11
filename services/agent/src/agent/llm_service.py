import litellm
from typing import AsyncGenerator, Any
from agent.config import Settings

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

    async def generate(self, prompt: str, tools: list[dict[str, Any]] | None = None) -> str:
        """
        Sends a prompt to the LLM and returns the text response.
        """
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
