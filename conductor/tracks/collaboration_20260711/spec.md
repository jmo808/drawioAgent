# Specification: Multi-User Collaboration & Shared Sessions

## Overview
Extend the DrawIO Agent MVP with real-time multi-user collaboration. Multiple team members can join a shared diagram session, see AI-generated diagrams update live, and contribute to the same diagram simultaneously.

## Prerequisites
- Track 1 (MVP) must be complete
- Redis becomes a required dependency (promoted from optional stub)

## Architecture

### Session Model
- Each diagram session has a unique session ID
- Users join a session by navigating to a session URL or entering a session code
- All users in a session share:
  - The same diagram canvas (real-time sync)
  - The same chat history (all AI interactions visible to all)
  - Presence information (who's connected)

### State Synchronization
- **Redis pub/sub** for broadcasting diagram updates and chat messages across API server instances
- **Last-write-wins** conflict resolution for initial collaboration (no CRDT/OT)
- When any user (or the AI) updates the diagram, the new XML is broadcast to all session members
- Each user's manual edits are captured and broadcast via the existing snapshot mechanism

### Components Modified
- **Fastify API Server**: Add session room management, Redis pub/sub integration, broadcast WebSocket handler
- **React Sidebar Plugin**: Add session join/create UI, presence indicators, shared chat history display
- **Helm Chart**: Promote Redis from optional stub to conditionally required when `collaboration.enabled=true`
- **Python Agent**: No changes (stateless per-request; sessions managed by API server)

### New Features
1. Session creation and joining (URL-based or code-based)
2. Real-time diagram sync across connected clients
3. Shared chat history visible to all session members
4. User presence indicators (avatars/names of connected users)
5. Session management (create, join, leave, close)
