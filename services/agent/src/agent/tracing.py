"""Tracing initialization for drawio-agent using OpenTelemetry."""

import os
from typing import Optional
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter,
)
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


def init_tracing(app: Optional[FastAPI] = None) -> None:
    """Initialize OpenTelemetry tracer provider and instrumentations."""
    otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not otel_endpoint:
        return

    provider = TracerProvider()
    endpoint = f"{otel_endpoint.rstrip('/')}/v1/traces"
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    HTTPXClientInstrumentor().instrument()

    if app:
        FastAPIInstrumentor.instrument_app(app)
