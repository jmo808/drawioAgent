# Multi-stage Dockerfile for draw.io frontend with plugin injection
FROM node:22-slim AS builder
WORKDIR /app

# Copy root configurations, tsconfig, and workspace files
COPY package*.json tsconfig.json ./
COPY packages/shared/package*.json packages/shared/
COPY frontend/sidebar/package*.json frontend/sidebar/

# Install dependencies using legacy peer deps to resolve React 19 testing library conflicts
RUN npm ci --legacy-peer-deps

# Copy workspace source files
COPY packages/shared packages/shared
COPY frontend/sidebar frontend/sidebar

# Build shared package and sidebar plugin
RUN cd packages/shared && npx tsc -b --clean
RUN cd frontend/sidebar && npx tsc -b --clean
RUN npm run build -w @drawio-agent/shared
RUN npm run build -w sidebar

# Use jgraph/drawio base image for running the editor
FROM docker.io/jgraph/drawio:24.4.0

# Copy PreConfig override to auto-load the plugin on boot
COPY frontend/sidebar/PreConfig.js /usr/local/tomcat/webapps/draw/js/PreConfig.js

# Copy built plugin static JS bundle to tomcat assets directory
COPY --from=builder /app/frontend/sidebar/dist/drawio-agent-plugin.js /usr/local/tomcat/webapps/draw/js/drawio-agent-plugin.js
