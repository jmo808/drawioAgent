# Product Guidelines: DrawIO Agent

## Brand Identity
- **Product Name:** DrawIO Agent
- **Tagline:** "Diagram smarter, not harder."
- **Personality:** Friendly, helpful, and technically confident. Think of a knowledgeable colleague who makes complex architecture feel approachable.

## Prose & Copy Style
- **Tone:** Friendly and approachable — conversational, encouraging, uses casual language
- **Voice:** Second person ("you") for instructions, first person plural ("we") for features
- **Avoid:** Overly formal language, passive voice, unnecessary jargon
- **Prefer:** Short paragraphs, bullet points, action-oriented verbs
- **Error messages:** Helpful and specific — tell the user what happened, why, and what to do next. Never show raw stack traces.
- **AI chat personality:** The agent should be concise but friendly. It explains what it's doing ("Adding an RDS instance to AZ-b...") and confirms when done. It asks clarifying questions rather than guessing.

## Visual Design

### Theme Strategy
- **Adaptive theming** — support both light and dark themes, respecting system/browser preference via `prefers-color-scheme`
- Dark theme should use draw.io's native dark mode palette as a base
- Light theme should use clean whites and light grays
- The sidebar chat panel should seamlessly match whichever theme is active

### Color Palette
- **Primary accent:** `#2196F3` (Material Blue) — used for interactive elements, links, send button
- **Success:** `#4CAF50` — diagram generation complete, successful operations
- **Warning:** `#FF9800` — validation warnings, partial results
- **Error:** `#F44336` — failures, connection errors
- **Neutral surfaces:** Inherit from draw.io's active theme

### Typography
- Use the system font stack for the chat sidebar to match native OS feel
- Monospace font for code blocks and XML snippets in chat responses
- Font sizes: 14px base for chat, 12px for metadata/timestamps

## UX Principles

### 1. Zero-Config Defaults
The application works out of the box with sensible defaults. Every configuration option is overridable, but none are required. A user should be able to `helm install` and immediately start chatting with the AI agent to generate diagrams.

### 2. Progressive Disclosure
Simple by default, advanced features revealed on demand:
- **Level 1 (default):** Chat input + diagram canvas. That's it.
- **Level 2 (on demand):** Provider selector, template library, diagram state inspector
- **Level 3 (advanced):** MCP tool logs, raw XML view, WebSocket debug panel

### 3. Non-Disruptive AI
The AI agent should never block the user's workflow:
- Diagram generation happens asynchronously — the user can continue editing while the AI works
- AI suggestions appear as proposals, not forced changes
- Undo/redo works seamlessly with AI-generated changes

## Accessibility
- All interactive elements must have ARIA labels
- Chat messages must be screen-reader friendly
- Color is never the sole indicator of state (use icons + text alongside)
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text

## Internationalization
- All UI strings externalized for future i18n support
- No hardcoded English strings in component code
- RTL layout support not required for MVP, but string externalization enables it later

## Supply Chain Security & Dependency Pinning
- **Immutable Action Pinning**: All GitHub Actions must be pinned to 40-character commit SHAs (mutable tags forbidden).
- **Scanner Engine Locking**: Security scanners (Trivy, Cosign) must explicitly lock their binary/engine versions in action configs.
- **Security Dashboard Integration**: All automated vulnerability and static analysis scans must publish SARIF reports directly to GitHub Security tab.
- **Reproducible Builds**: Strict lockfile integrity enforced across npm (`package-lock.json`) and python (`requirements.txt`).
