# Multi-stage Dockerfile for Fastify API server
FROM docker.io/node:22-slim AS builder
WORKDIR /app

# Copy root config, tsconfig, and package manifests
COPY package*.json tsconfig.json ./
COPY packages/shared/package*.json packages/shared/
COPY services/api/package*.json services/api/

# Install dependencies
RUN npm ci

# Copy source code files
COPY packages/shared packages/shared
COPY services/api services/api

# Build typescript packages
RUN cd packages/shared && npx tsc -b --clean
RUN cd services/api && npx tsc -b --clean
RUN npm run build -w @drawio-agent/shared
RUN npm run build -w drawio-agent-api

# Create lightweight production runtime image
FROM docker.io/node:22-slim
WORKDIR /app

# Set default production env variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy root config and package manifests for runtime install
COPY package*.json ./
COPY packages/shared/package*.json packages/shared/
COPY services/api/package*.json services/api/

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled JS files from builder stage
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /app/services/api/dist /app/services/api/dist

# Set folder ownership to standard node non-root user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Healthcheck to verify Fastify is responding to GET /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "services/api/dist/server.js"]
