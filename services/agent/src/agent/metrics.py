from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

llm_call_duration_seconds = Histogram(
    'llm_call_duration_seconds',
    'Duration of LLM calls in seconds',
    ['provider', 'model'],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0]
)

llm_tokens_total = Counter(
    'llm_tokens_total',
    'Total number of tokens used',
    ['provider', 'model', 'token_type'] # token_type: 'prompt' | 'completion'
)

mcp_tool_duration_seconds = Histogram(
    'mcp_tool_duration_seconds',
    'Duration of MCP tool execution in seconds',
    ['tool_name'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

mcp_tool_calls_total = Counter(
    'mcp_tool_calls_total',
    'Total number of MCP tool calls',
    ['tool_name', 'status'] # status: 'success' | 'error'
)

diagram_generation_duration_seconds = Histogram(
    'diagram_generation_duration_seconds',
    'End-to-end duration of diagram generation in seconds',
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0]
)

def get_metrics_exposition() -> tuple[bytes, str]:
    """Returns the Prometheus metrics exposition format and content type."""
    return generate_latest(), CONTENT_TYPE_LATEST
