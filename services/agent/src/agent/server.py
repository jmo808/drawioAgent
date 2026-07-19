import os
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any

from agent.config import Settings, settings as global_settings
from agent.llm_service import LLMService
from agent.mcp_bridge import MCPBridge
from agent.conversation import ConversationManager
from agent.orchestrator import AgentOrchestrator

logger = logging.getLogger(__name__)

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

def get_orchestrator():
    """Dependency helper to get orchestrator instance (allows easy mocking in tests)."""
    return orchestrator

class ChatRequest(BaseModel):
    message: str
    sessionId: str
    diagramXml: str | None = None
    classification: str | None = None

def create_app(app_settings: Settings) -> FastAPI:
    global llm_service, mcp_bridge, conversation_manager, orchestrator
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
    async def lifespan(app: FastAPI):
        await mcp_bridge.start()
        yield
        await mcp_bridge.stop()

    app = FastAPI(lifespan=lifespan)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/providers")
    def providers():
        return {
            "providers": [
                {
                    "provider": app_settings.llm_provider,
                    "model": app_settings.llm_model
                }
            ]
        }

    @app.post("/api/chat")
    async def chat(
        req: ChatRequest,
        request: Request,
        orch: AgentOrchestrator = Depends(get_orchestrator)
    ):
        request_id = request.headers.get("x-request-id")
        user_identity = request.headers.get("x-user-identity")
        
        async def event_generator():
            try:
                async for event in orch.run(
                    session_id=req.sessionId,
                    prompt=req.message,
                    diagram_xml=req.diagramXml,
                    classification=req.classification,
                    request_id=request_id,
                    user_identity=user_identity
                ):
                    yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
            except Exception as e:
                logger.error(f"Error in chat stream: {e}")
                err_data = {"message": f"Stream error: {str(e)}"}
                yield f"event: error\ndata: {json.dumps(err_data)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    return app

app = create_app(global_settings)
