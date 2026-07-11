# Specification: Multi-User Collaboration & Shared Sessions

## Overview
Extend the DrawIO Agent MVP with real-time multi-user collaboration. Multiple team members can join a shared diagram session, see AI-generated diagrams update live, and contribute to the same diagram simultaneously.

## Prerequisites
- Track 1 (MVP) must be complete
- Valkey (BSD-licensed Redis fork) becomes a required dependency when `collaboration.enabled=true`

## Architectural Decisions Record

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| CD-1 | User identity | Anonymous with display name (random or user-chosen) | Lowest friction; no auth changes needed; matches Excalidraw/Figma casual collab |
| CD-2 | Session sharing | URL (UUID) + 6-char alphanumeric short code fallback | URL for async sharing (Slack/email); short code for verbal sharing (voice call) |
| CD-3 | AI trigger permissions | Any member can trigger; requests serialized per session | Egalitarian; mirrors shared whiteboard; serialization prevents conflicting AI requests |
| CD-4 | Conflict resolution | Last-write-wins with 500ms debounced broadcast | Simple, effective for diagramming (edits are spatially distributed); no CRDT/OT complexity |
| CD-5 | Broadcast payload | Full XML snapshot (consistent with MVP snapshot-before-request) | Self-healing (missed broadcasts auto-corrected by next one); 5-50KB is trivial for WebSocket |
| CD-6 | Canvas sync UX | Silent replacement + viewport preservation + toast notification | Save zoom/scroll → setGraphXml → restore viewport; toast: "Diagram updated by Alice" |
| CD-7 | Chat model | Shared chat with sender attribution; full history for new joiners | Complete audit trail of who asked what; new joiners understand diagram's evolution |
| CD-8 | Valkey data model | Key-per-concern with `session:{id}:*` prefix | Leverages native data structures (Hash, List, String, pub/sub); clean TTL management |
| CD-9 | Session lifecycle | 24h TTL (activity-refreshed); max 10 members; 500 messages; survives creator leaving | Session belongs to the group; configurable via `values.yaml` under `collaboration.*` |
| CD-10 | Presence indicators | Name badges with connection status + pulse on AI trigger | Compact, informative at-a-glance; no cursor tracking complexity |
| CD-11 | Reconnection | Full state resync (diagram XML + members + chat history) | Consistent with full-XML-snapshot approach; self-healing regardless of disconnect duration |
| CD-12 | API statefulness | Stateless API servers; all session state in Valkey | Horizontal scaling with zero sticky sessions; any pod serves any user |
| CD-13 | Key-value store | Valkey via inline Helm template; external Valkey/Redis option for production | No subchart dependency; `valkey/valkey` official image; ioredis is wire-compatible |
| CD-14 | WebSocket protocol | Extend existing `{type, payload, id, timestamp}` with 10 new message types | Backward compatible; MVP client ignores unknown types; no new endpoints |
| CD-15 | Graceful degradation | `collaboration.enabled=false` → MVP behavior, no Valkey, no session UI | Zero impact on users who don't need collaboration; strict opt-in |
| CD-16 | Collaboration snapshot | Triggering user's canvas XML → AI operates on it → result broadcast to all | "AI modifies what I'm looking at"; consistent with MVP snapshot-before-request |
| CD-17 | Session security | Link/code only, no browsing; UUID v4 (unguessable) + short code (2.1B combinations) | Matches Google Docs "anyone with the link" privacy model |
| CD-18 | Heartbeat | WebSocket native ping/pong (30s interval, 10s timeout); server-side member cleanup | No application-level heartbeat messages; WebSocket protocol handles it natively |

## Architecture

### System Changes from MVP

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster (Cilium + Gateway API)          │
│                                                                       │
│  ┌──────────────────────┐   ┌────────────────────────────────┐       │
│  │  draw.io Frontend    │   │  Fastify API Server (stateless)│       │
│  │  (unchanged)         │   │  (MODIFIED)                    │       │
│  │                      │   │                                │       │
│  │                      │   │  + SessionManager              │       │
│  │                      │   │  + Valkey pub/sub subscriber   │       │
│  │                      │   │  + Broadcast WebSocket handler │       │
│  │                      │   │  + WS ping/pong heartbeat      │       │
│  └──────────────────────┘   └──────────────┬─────────────────┘       │
│                                             │                         │
│                              ┌──────────────┴─────────────────┐      │
│                              │                                │      │
│                              ▼                                ▼      │
│                   ┌──────────────────┐          ┌──────────────────┐ │
│                   │  Python AI Agent │          │  Valkey          │ │
│                   │  (unchanged)     │          │  (NEW, optional) │ │
│                   │                  │          │                  │ │
│                   │                  │          │  session:{id}:*  │ │
│                   │                  │          │  shortcode:{code}│ │
│                   │                  │          │  pub/sub channels│ │
│                   └──────────────────┘          └──────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Components Modified
- **Fastify API Server** — `SessionManager` class, Valkey pub/sub, broadcast handler, heartbeat
- **React Sidebar Plugin** — Session controls, presence indicators, broadcast handlers, display name prompt
- **Helm Chart** — Inline Valkey template (gated by `collaboration.enabled`), collaboration values

### Components Unchanged
- **Python AI Agent** — Stateless per-request; sessions managed by API server
- **draw.io Frontend** — Plugin changes only; base draw.io image unchanged
- **MCP Server** — No changes

### Communication Flow (Collaboration Mode)

1. **User A** creates session → API assigns UUID + short code, stores in Valkey
2. **User A** shares URL or short code with **User B**
3. **User B** navigates to URL → WebSocket connects → `session_join` → display name prompt
4. API stores B in `session:{id}:members`, sends `session_state` (diagram XML + chat history + members)
5. API broadcasts `member_joined` to all session members
6. **User A** edits diagram manually → 500ms debounce → full XML snapshot → broadcast to all via pub/sub
7. **User B** receives `diagram_broadcast` → saves viewport → `setGraphXml()` → restores viewport → toast
8. **User B** sends AI prompt → snapshot B's canvas → API acquires `session:{id}:lock` → forwards to agent
9. API broadcasts `ai_locked` to all members (shows "AI is working for Bob...")
10. AI tool progress events broadcast to all members as `chat_broadcast`
11. AI completes → final XML broadcast as `diagram_broadcast` → API releases lock → `ai_unlocked`

### Valkey Data Model (CD-8)

| Key | Type | Contents | TTL |
|-----|------|----------|-----|
| `session:{id}:meta` | Hash | `creator`, `created_at`, `short_code`, `title` | 24h (refreshed) |
| `session:{id}:members` | Hash | `{connId}` → `{name, joinedAt, lastSeen}` (JSON) | 24h (refreshed) |
| `session:{id}:chat` | List | Chat messages (JSON, capped at 500 via LTRIM) | 24h (refreshed) |
| `session:{id}:diagram` | String | Current diagram XML snapshot | 24h (refreshed) |
| `session:{id}:lock` | String | Connection ID of user with active AI request (or empty) | 60s auto-expire |
| `shortcode:{code}` | String | Session UUID | 24h (matches session) |
| Pub/sub channel | — | `session:{id}:events` | — |

### WebSocket Protocol Extensions (CD-14)

New message types added to the existing `{type, payload, id, timestamp}` envelope:

| Type | Direction | Payload |
|------|-----------|---------|
| `session_create` | client → server | `{displayName: string}` |
| `session_join` | client → server | `{sessionId?: string, shortCode?: string, displayName: string}` |
| `session_leave` | client → server | `{}` |
| `session_state` | server → client | `{sessionId, shortCode, members[], chatHistory[], diagramXml}` |
| `member_joined` | server → client | `{connId, displayName, joinedAt}` |
| `member_left` | server → client | `{connId, displayName}` |
| `diagram_broadcast` | server → client | `{xml, senderConnId, senderName}` |
| `chat_broadcast` | server → client | `{message, senderConnId, senderName, isAI: boolean}` |
| `ai_locked` | server → client | `{lockedBy: {connId, displayName}}` |
| `ai_unlocked` | server → client | `{}` |

Existing MVP types (`chat_message`, `tool_progress`, `diagram_update`, `error`, `provider_change`, `template_select`) remain unchanged.

### Feature Gating (CD-15)

```yaml
# values.yaml
collaboration:
  enabled: false              # Set to true to enable collaboration features
  valkey:
    enabled: true             # Deploy bundled Valkey instance (set false for external)
    image:
      repository: valkey/valkey
      tag: "8.1"
    resources:
      requests:
        memory: 128Mi
        cpu: 100m
  external:
    host: ""                  # External Valkey/Redis host (when valkey.enabled=false)
    port: 6379
    password: ""
  session:
    ttlHours: 24              # Session TTL in hours
    maxMembers: 10            # Max members per session
    maxChatHistory: 500       # Max chat messages stored per session
  heartbeat:
    intervalSeconds: 30       # WebSocket ping interval
    timeoutSeconds: 10        # Pong timeout before disconnect
```

When `collaboration.enabled=false`:
- No Valkey pods deployed
- API server doesn't attempt Valkey connection
- Sidebar plugin hides session controls (detected via WebSocket handshake metadata)
- System behaves identically to MVP

## Scope Exclusions (Future Enhancements)
- Cursor/selection tracking across users
- CRDT/OT-based conflict resolution
- Session password protection
- Session browsing/discovery
- Persistent user accounts
- Session recording/replay
- Per-element locking
