"""Tests for the agent FastAPI server endpoints."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from agent.server import create_app
from agent.config import Settings
from agent.orchestrator import AgentOrchestrator

@pytest.fixture
def client():
    """Create a test client configured with openai provider settings."""
    settings = Settings(llm_provider="openai", llm_model="gpt-4")
    app = create_app(settings)
    return TestClient(app)

def test_get_health(client):
    """Verify health endpoint returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_get_providers(client):
    """Verify providers endpoint returns configured LLM provider and version header."""
    response = client.get("/api/v1/providers")
    assert response.status_code == 200
    assert response.headers["X-API-Version"] == "1.0.0"
    assert "providers" in response.json()
    assert response.json()["providers"] == [{"provider": "openai", "model": "gpt-4"}]

def test_post_chat_validation(client):
    """Verify that required fields message and sessionId are validated."""
    # Missing message
    response = client.post("/api/v1/chat", json={"sessionId": "session-1"})
    assert response.status_code == 422
    assert response.headers["X-API-Version"] == "1.0.0"
    
    # Missing sessionId
    response = client.post("/api/v1/chat", json={"message": "hello"})
    assert response.status_code == 422
    assert response.headers["X-API-Version"] == "1.0.0"

def test_post_chat_stream(client):
    """Verify that chat responses can be streamed as server-sent events."""
    mock_orchestrator = MagicMock(spec=AgentOrchestrator)
    
    async def mock_run(session_id, prompt, diagram_xml=None, classification=None, **kwargs):
        yield {"event": "tool_progress", "data": {"toolName": "init_diagram", "step": 1, "totalSteps": 1}}
        yield {"event": "chat_message", "data": {"text": "Done!"}}
        
    mock_orchestrator.run = mock_run
    
    from agent.server import get_orchestrator
    client.app.dependency_overrides[get_orchestrator] = lambda: mock_orchestrator
    
    try:
        response = client.post(
            "/api/v1/chat",
            json={"message": "draw line", "sessionId": "session-123"}
        )
        assert response.status_code == 200
        assert response.headers["X-API-Version"] == "1.0.0"
        assert "text/event-stream" in response.headers["content-type"]
        
        content = response.content.decode("utf-8")
        assert "event: tool_progress" in content
        assert 'data: {"toolName": "init_diagram"' in content
        assert "event: chat_message" in content
        assert 'data: {"text": "Done!"}' in content
    finally:
        client.app.dependency_overrides.clear()


def test_post_chat_stream_with_classification(client):
    """Verify that stream endpoint accepts and forwards classifications."""
    mock_orchestrator = MagicMock(spec=AgentOrchestrator)
    received_classification = []
    
    async def mock_run(session_id, prompt, diagram_xml=None, classification=None, **kwargs):
        received_classification.append(classification)
        yield {"event": "chat_message", "data": {"text": f"Classification is {classification}"}}
        
    mock_orchestrator.run = mock_run
    
    from agent.server import get_orchestrator
    client.app.dependency_overrides[get_orchestrator] = lambda: mock_orchestrator
    
    try:
        response = client.post(
            "/api/v1/chat",
            json={
                "message": "draw line",
                "sessionId": "session-123",
                "classification": "confidential"
            }
        )
        assert response.status_code == 200
        assert response.headers["X-API-Version"] == "1.0.0"
        assert received_classification == ["confidential"]
        content = response.content.decode("utf-8")
        assert "Classification is confidential" in content
    finally:
        client.app.dependency_overrides.clear()

