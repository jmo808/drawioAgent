import os
from pydantic import BaseModel, Field

class Settings(BaseModel):
    """
    Configuration settings for the Python AI Agent service.
    Loads values from environment variables with sensible defaults.
    """
    llm_provider: str = Field(default_factory=lambda: os.getenv("LLM_PROVIDER", "ollama"))
    llm_model: str = Field(default_factory=lambda: os.getenv("LLM_MODEL", "llama3"))
    llm_api_key: str | None = Field(default_factory=lambda: os.getenv("LLM_API_KEY"))
    mcp_server_path: str = Field(default_factory=lambda: os.getenv("MCP_SERVER_PATH", "scripts/mcp-wrapper.js"))
    mcp_workspace_root: str = Field(default_factory=lambda: os.getenv("MCP_WORKSPACE_ROOT", "."))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8000")))

settings = Settings()
