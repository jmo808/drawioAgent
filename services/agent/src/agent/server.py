"""FastAPI Server exposing Archimedes AI Agent endpoints."""

import json
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, List, Optional, Callable, Awaitable
from fastapi import FastAPI, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import structlog

from agent.config import Settings, settings as global_settings
from agent.conversation import ConversationManager
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.orchestrator import AgentOrchestrator

logger = structlog.get_logger(__name__)

# Instantiate global dependencies
llm_service = LLMService(global_settings)
mcp_bridge = MCPBridge(global_settings)
conversation_manager = ConversationManager(global_settings)
orchestrator = AgentOrchestrator(
    global_settings,
    llm_service,
    mcp_bridge,
    conversation_manager
)


def get_orchestrator() -> AgentOrchestrator:
    """Dependency helper to get orchestrator instance."""
    return orchestrator


class ChatRequest(BaseModel):
    """Pydantic model for the /api/v1/chat request body."""

    message: str
    sessionId: str
    diagramXml: Optional[str] = None
    classification: Optional[str] = None


def create_app(app_settings: Settings) -> FastAPI:
    """Create and configure the FastAPI application."""
    global llm_service, mcp_bridge, conversation_manager, orchestrator
    
    from agent.logging_config import setup_logging, request_id_middleware
    setup_logging()
    
    llm_service = LLMService(app_settings)
    mcp_bridge = MCPBridge(app_settings)
    conversation_manager = ConversationManager(app_settings)
    orchestrator = AgentOrchestrator(
        app_settings,
        llm_service,
        mcp_bridge,
        conversation_manager
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """Lifecycle context manager starting/stopping MCP bridge."""
        await mcp_bridge.start()
        yield
        await mcp_bridge.stop()

    app = FastAPI(lifespan=lifespan)
    from agent.tracing import init_tracing
    init_tracing(app)
    app.middleware("http")(request_id_middleware)

    @app.middleware("http")
    async def add_api_version_header(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Inject API version header in all HTTP responses."""
        response = await call_next(request)
        response.headers["X-API-Version"] = "1.0.0"
        return response

    @app.get("/health")
    def health() -> Dict[str, str]:
        """Return service health status."""
        logger.info("Health check")
        return {"status": "ok"}

    @app.get("/api/v1/providers")
    def providers() -> Dict[str, List[Dict[str, str]]]:
        """Return configured LLM providers."""
        return {
            "providers": [
                {
                    "provider": app_settings.llm_provider,
                    "model": app_settings.llm_model
                }
            ]
        }

    @app.post("/api/v1/chat")
    async def chat(
        req: ChatRequest,
        request: Request,
        orch: AgentOrchestrator = Depends(get_orchestrator)
    ) -> StreamingResponse:
        """Stream chat responses from the agent."""
        request_id = request.headers.get("x-request-id")
        user_identity = request.headers.get("x-user-identity")

        async def event_generator() -> AsyncGenerator[str, None]:
            try:
                async for event in orch.run(
                    session_id=req.sessionId,
                    prompt=req.message,
                    diagram_xml=req.diagramXml,
                    classification=req.classification,
                    request_id=request_id,
                    user_identity=user_identity
                ):
                    event_name = event['event']
                    event_data = json.dumps(event['data'])
                    yield f"event: {event_name}\ndata: {event_data}\n\n"
            except Exception as e:
                logger.error(
                    "Error in chat stream: %s",
                    e,
                    exc_info=True,
                )
                err_data = {
                    "message": "An internal error occurred."
                }
                yield f"event: error\ndata: {json.dumps(err_data)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    @app.get("/metrics")
    async def metrics() -> Response:
        """Expose Prometheus metrics."""
        from agent.metrics import get_metrics_exposition
        content, content_type = get_metrics_exposition()
        return Response(content=content, media_type=content_type)

    return app


app = create_app(global_settings)
