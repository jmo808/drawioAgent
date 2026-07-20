"""Logging configurations for drawio-agent utilizing structlog."""

import logging
import os
from typing import Callable, Awaitable
from fastapi import Request, Response
import structlog


def setup_logging() -> None:
    """Configures structured JSON logging with structlog."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        format="%(message)s",
        stream=None,
        level=getattr(logging, log_level, logging.INFO),
    )

    logger = logging.getLogger()
    logger.handlers.clear()
    handler = logging.StreamHandler()
    logger.addHandler(handler)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


async def request_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """FastAPI Middleware to propagate X-Request-ID and clear contextvars."""
    req_id = request.headers.get("X-Request-ID")
    if req_id:
        structlog.contextvars.bind_contextvars(request_id=req_id)
    
    response = await call_next(request)
    
    if req_id:
        response.headers["X-Request-ID"] = req_id
        structlog.contextvars.clear_contextvars()
        
    return response
