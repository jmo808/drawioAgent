import os
from agent.config import Settings

def test_settings_default():
    # Test that default values are parsed correctly
    settings = Settings()
    assert settings.llm_provider == "ollama"
    assert settings.llm_model == "llama3"
    assert settings.mcp_server_path == "scripts/mcp-wrapper.js"

def test_settings_env_override(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "gpt-4")
    monkeypatch.setenv("MCP_SERVER_PATH", "/usr/local/bin/mcp-wrapper.js")
    
    settings = Settings()
    assert settings.llm_provider == "openai"
    assert settings.llm_model == "gpt-4"
    assert settings.mcp_server_path == "/usr/local/bin/mcp-wrapper.js"
