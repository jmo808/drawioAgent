import pytest
from fastapi.testclient import TestClient

from agent.server import app
from agent.metrics import (
    llm_call_duration_seconds,
    llm_tokens_total,
    mcp_tool_duration_seconds,
    mcp_tool_calls_total,
    diagram_generation_duration_seconds
)

@pytest.fixture(autouse=True)
def reset_metrics():
    """Reset metric state between tests."""
    pass

def test_metrics_endpoint():
    """Test that the /metrics endpoint returns Prometheus exposition format."""
    client = TestClient(app)
    
    # Record some mock data
    llm_call_duration_seconds.labels(provider="mock", model="mock").observe(0.5)
    llm_tokens_total.labels(provider="mock", model="mock", token_type="prompt").inc(10)
    mcp_tool_duration_seconds.labels(tool_name="init_diagram").observe(1.2)
    mcp_tool_calls_total.labels(tool_name="init_diagram", status="success").inc()
    diagram_generation_duration_seconds.observe(5.0)
    
    response = client.get("/metrics")
    
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "charset=utf-8" in response.headers["content-type"]
    
    text = response.text
    assert 'llm_call_duration_seconds' in text
    assert 'llm_tokens_total' in text
    assert 'mcp_tool_calls_total' in text
    assert 'diagram_generation_duration_seconds' in text
