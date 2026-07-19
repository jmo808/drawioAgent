# Multi-stage Dockerfile for Python AI Agent (multi-runtime Node + Python)

# Stage 1: Build MCP Server (Node.js dependencies)
FROM docker.io/node:22-slim AS mcp-builder
WORKDIR /app/mcp-server

# Copy drawio_plugin files from build context
COPY drawio_plugin/package*.json ./
RUN npm ci --ignore-scripts

COPY drawio_plugin/ ./

# Stage 2: Install Python dependencies
FROM docker.io/python:3.12-slim AS python-builder
WORKDIR /app/agent

# Copy Python requirements
COPY drawioAgent/services/agent/requirements.txt ./

# Setup virtual environment and install requirements
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2.5: Generate SBOM (F-04)
FROM docker.io/aquasec/trivy:0.53.0 AS sbom-generator
WORKDIR /app
COPY --from=mcp-builder /app/mcp-server /app/mcp-server
# Generate SBOM file
RUN trivy fs --format github --output /app/sbom.json /app/mcp-server

# Stage 3: Final runtime environment (Python 3.12-slim based on Debian)
FROM docker.io/python:3.12-slim
WORKDIR /app

# Install system dependencies needed for Python, Node, and MCP server
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Node.js runtime from standard Node image
COPY --from=docker.io/node:22-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=docker.io/node:22-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Copy the virtualenv containing python dependencies
COPY --from=python-builder /opt/venv /opt/venv

# Configure PATH to use the virtual environment binaries first
ENV PATH="/opt/venv/bin:$PATH"

# Copy built MCP server files
COPY --from=mcp-builder /app/mcp-server /app/mcp-server

# Copy generated SBOM
COPY --from=sbom-generator /app/sbom.json /app/sbom.json

# Copy Python Agent code
COPY drawioAgent/services/agent/src /app/agent/src
COPY drawioAgent/services/agent/pyproject.toml /app/agent/

# Set environment variables defaults
ENV PORT=8000
ENV HOST=0.0.0.0
ENV PYTHONPATH=/app/agent/src
ENV MCP_SERVER_PATH=/app/mcp-server/scripts/mcp-wrapper.js

# Expose agent port
EXPOSE 8000

# Create non-root user and group
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser -m -s /bin/bash appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Healthcheck to verify the Python FastAPI app responds to /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/health || exit 1

# Start the uvicorn server
CMD ["uvicorn", "agent.server:app", "--host", "0.0.0.0", "--port", "8000"]
