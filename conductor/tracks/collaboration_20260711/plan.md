# Implementation Plan: Multi-User Collaboration & Shared Sessions

## Phase 1: Redis Integration & Session Management

- [ ] Task: Integrate Redis client into Fastify API server
    - [ ] Write Tests: Test Redis connection establishment and health check
    - [ ] Write Tests: Test Redis connection failure handling (graceful degradation to single-user mode)
    - [ ] Implement: Add `ioredis` dependency to API server
    - [ ] Implement: Create Redis client plugin with connection pooling
    - [ ] Implement: Update `/ready` endpoint to check Redis connectivity when collaboration is enabled
    - [ ] Implement: Update Helm chart to wire Redis connection string env var
- [ ] Task: Implement session room management
    - [ ] Write Tests: Test session creation returns unique session ID and shareable URL
    - [ ] Write Tests: Test session join adds user to room and returns current state
    - [ ] Write Tests: Test session leave removes user, notifies remaining members
    - [ ] Write Tests: Test session close notifies all members and cleans up Redis keys
    - [ ] Write Tests: Test session TTL expiry cleans up stale sessions
    - [ ] Implement: Create `SessionManager` class with Redis-backed room state
    - [ ] Implement: Session CRUD operations (create, join, leave, close)
    - [ ] Implement: User presence tracking per session (Redis sorted set with heartbeat timestamps)
    - [ ] Implement: Session TTL with automatic cleanup
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Redis Integration & Session Management' (Protocol in workflow.md)

## Phase 2: Real-Time Broadcast

- [ ] Task: Implement Redis pub/sub for diagram updates
    - [ ] Write Tests: Test diagram update published to Redis channel reaches subscriber
    - [ ] Write Tests: Test all session members receive broadcast via WebSocket
    - [ ] Write Tests: Test publisher does not receive their own broadcast (dedup by connection ID)
    - [ ] Write Tests: Test broadcast works across multiple API server replicas
    - [ ] Implement: Create pub/sub channels per session ID (`session:{id}:updates`)
    - [ ] Implement: Subscribe to session channel on WebSocket connect
    - [ ] Implement: Broadcast diagram XML updates to all session members
    - [ ] Implement: Unsubscribe on WebSocket disconnect
- [ ] Task: Implement shared chat history
    - [ ] Write Tests: Test chat messages are stored in Redis list per session
    - [ ] Write Tests: Test new users joining a session receive full chat history
    - [ ] Write Tests: Test AI responses are broadcast to all session members
    - [ ] Write Tests: Test chat history respects maximum length limit (circular buffer)
    - [ ] Implement: Store chat messages in Redis list with session-scoped keys (`session:{id}:chat`)
    - [ ] Implement: Chat history retrieval on session join (return last N messages)
    - [ ] Implement: Broadcast AI `tool_progress` and `diagram_update` events to all members
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Real-Time Broadcast' (Protocol in workflow.md)

## Phase 3: Frontend Collaboration UI

- [ ] Task: Build session management UI
    - [ ] Write Tests: Test "Create Session" button generates session and shows shareable URL
    - [ ] Write Tests: Test "Join Session" dialog accepts session code and connects
    - [ ] Write Tests: Test presence indicator shows connected user count and names
    - [ ] Write Tests: Test "Leave Session" button disconnects and returns to single-user mode
    - [ ] Implement: Create `SessionControls` component (create/join/leave buttons)
    - [ ] Implement: Create `PresenceIndicator` component showing connected users
    - [ ] Implement: Shareable session URL generation with copy-to-clipboard
    - [ ] Implement: Session code input dialog
- [ ] Task: Integrate real-time sync into existing components
    - [ ] Write Tests: Test incoming diagram broadcast updates canvas via drawioBridge
    - [ ] Write Tests: Test incoming chat broadcast appends to message list with sender attribution
    - [ ] Write Tests: Test user's own messages are not duplicated from broadcast
    - [ ] Implement: Subscribe to broadcast events in `useWebSocket` hook
    - [ ] Implement: Update `useChatStore` to handle remote messages (add `sender` field)
    - [ ] Implement: Update `drawioBridge` to apply remote diagram updates
    - [ ] Implement: Add visual indicator when diagram is being updated by another user
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Frontend Collaboration UI' (Protocol in workflow.md)

## Phase 4: Helm Chart & Documentation Updates

- [ ] Task: Update Helm chart for collaboration
    - [ ] Write Tests: Test chart deploys with Redis when `collaboration.enabled=true`
    - [ ] Write Tests: Test chart deploys without Redis when `collaboration.enabled=false` (default)
    - [ ] Write Tests: Test Redis connection string env var is injected into API server pods
    - [ ] Implement: Promote Redis subchart from stub to wired dependency
    - [ ] Implement: Add collaboration-related values (session TTL, max users per session, chat history limit)
    - [ ] Implement: Conditionally render Redis env vars based on `collaboration.enabled`
    - [ ] Implement: Update NOTES.txt with collaboration setup instructions
- [ ] Task: Update documentation
    - [ ] Update README with collaboration feature documentation and usage guide
    - [ ] Update Helm chart README with collaboration parameters table
    - [ ] Add collaboration architecture diagram
    - [ ] Document Redis requirements and sizing guidance
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Helm Chart & Documentation Updates' (Protocol in workflow.md)
