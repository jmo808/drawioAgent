import os
from pydantic import BaseModel, Field

def _get_default_skills_dir() -> str:
    env_val = os.getenv("SKILLS_DIR")
    if env_val:
        return env_val
    
    # Check Docker container path
    docker_path = "/app/mcp-server/skills/drawio"
    if os.path.exists(docker_path):
        return docker_path
        
    # Check local workspace relative path
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../drawio_plugin/skills/drawio"))

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
    skills_dir: str = Field(default_factory=_get_default_skills_dir)
    llm_temperature: float = Field(default_factory=lambda: float(os.getenv("LLM_TEMPERATURE", "0.2")))


settings = Settings()
