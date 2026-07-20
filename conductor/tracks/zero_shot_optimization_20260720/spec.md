# Spec: Zero-Shot Diagram Compilation Optimization

## Overview
The AI agent's diagram compilation pipeline currently suffers from a high first-attempt failure rate (~60-80%) due to the LLM's inability to reliably compute precise spatial coordinates, satisfy complex topological routing rules, and produce perfectly structured JSON specs on the first try. This results in multiple retry loops (up to 15 turns), increased latency, and degraded user experience.

This track implements three complementary optimization techniques to dramatically improve zero-shot compilation success rates:
1. **Server-side Auto-Layout via ELK** — offload all coordinate computation to a deterministic layout engine
2. **Dynamic Few-Shot RAG** — inject similar valid diagram templates as in-context examples
3. **Structured Outputs (JSON Schema)** — enforce strict schema compliance on LLM responses

---

## Design Decisions

The following decisions were resolved via interactive design review on 2026-07-20.

| # | Decision | Resolution |
|---|----------|------------|
| 1 | ELK package | `elkjs` (pure JS bundled), no JVM dependency |
| 2 | Layout algorithm | Layered (Sugiyama) for architecture diagrams |
| 3 | Layout direction | Top-to-Bottom (`DOWN`) |
| 4 | Container nesting | ELK compound nodes with per-type padding |
| 5 | Hybrid activation | Auto-detect: ELK runs on `compile_json_spec` path and when coordinates are absent |
| 6 | ELK → XML mapping | Write positions into DiagramBuilder cell map, then `toXml()` as usual |
| 7 | Edge routing | ELK orthogonal routing → mxGraph `<mxPoint>` waypoints |
| 8 | Embedding strategy | TF-IDF + cosine similarity (zero dependencies) |
| 9 | RAG integration point | Python agent (`conversation.py`) |
| 10 | Injection format | Full JSON spec of matched template |
| 11 | RAG fallback | Similarity threshold (cosine > 0.3), skip if no match |
| 12 | Schema enforcement | Pydantic validation (pre-MCP, all providers) |
| 13 | Schema strictness | Strict enums for all type fields |
| 14 | Schema error handling | Feed Pydantic errors to LLM, max 1 retry |
| 15 | Pipeline order | RAG → Structured Output → ELK (sequential) |
| 16 | Post-ELK validation | Spatial checks → warnings; topological checks → hard errors |
| 17 | Testing | Unit tests per module + existing E2E + benchmark script |

---

## Functional Requirements

### FR-1: ELK Auto-Layout Engine Integration
- Integrate `elkjs` (pure JS bundled variant) into the MCP wrapper Node.js process (co-located with `diagram-builder.js`). No JVM dependency.
- Use the **Layered (Sugiyama)** algorithm with **Top-to-Bottom (`DOWN`)** direction as the default for architecture diagrams.
- Implement a **hybrid** integration model:
  - The LLM outputs a **logical specification only** — nodes, containers, edges, containment relationships, and types — with **no coordinate values**.
  - ELK computes optimal positions (x, y, width, height) using its layered algorithm with compound node support.
  - The `DiagramBuilder` receives ELK-computed positions via an `applyElkLayout(elkResult)` method that writes positions directly into `this.cells` and `this.edges` maps, then `toXml()` serializes as usual.
- **Container nesting** uses ELK compound nodes: each container (Region, VPC, AZ, Subnet) is modeled as an ELK compound node with children nested inside. Padding per container type matches existing `CONTAINER_PADDING` constants. ELK auto-sizes parent bounds.
- **Edge routing**: Use ELK's orthogonal edge routing. Map ELK-computed bend points to mxGraph `<mxPoint>` entries in edge geometry for deterministic, server-side edge routing.
- **Hybrid activation**: ELK auto-activates on the `compile_json_spec` path (where the full graph is known upfront) and when coordinates are absent on nodes. The incremental builder path (`add_node` one-by-one) retains existing `addNode()` position logic for backwards compatibility.
- **Post-ELK validation**: After ELK computes positions, all validators still run. Spatial checks (overlap, bounds, spacing) are downgraded to **warnings** when ELK computed the layout (since spatial violations indicate a config issue, not an LLM error). Topological checks (routing, bypass rules) remain **hard errors**.

### FR-2: Dynamic Few-Shot RAG
- Maintain a curated library of **15-20 hand-crafted, validated JSON diagram specifications** covering common patterns (multi-AZ VPC, serverless API, Kubernetes cluster, 3-tier web app, data pipeline, etc.).
- Implement **TF-IDF + cosine similarity** for template matching:
  - Pre-compute TF-IDF vectors for each template's description/metadata at build time and store in a JSON file bundled with the Python agent.
  - At inference time, compute the TF-IDF vector of the user's prompt and find the closest matching template via cosine similarity.
  - Zero external dependencies, runs in < 1ms.
- **Integration point**: Python agent service (`conversation.py`). The template index loads at startup (~50KB JSON). The matched template is injected into the system prompt alongside existing reference guides.
- **Injection format**: Full `compile_json_spec` JSON of the matched template (containers, nodes, edges). Typically 2-4KB per template.
- **Fallback**: Apply a similarity threshold (cosine > 0.3). If no template exceeds the threshold, skip injection entirely. The LLM falls back to existing reference guides.
- The template library should be extensible — adding a new template requires only adding a JSON file and regenerating the TF-IDF index.

### FR-3: Structured Outputs (JSON Schema Enforcement)
- Define a **formal JSON Schema** using **Pydantic models** for the `compile_json_spec` input format:
  - `containers[]` — id, label, type (strict enum), parentId, tier (strict enum)
  - `nodes[]` — id, label, type (strict enum of all ~40 supported types), parentId, variant
  - `edges[]` — sourceId, targetId, label, style (strict enum: solid/dashed), color
  - `title`, `type`, `theme`
- **Strict enums**: Define explicit enum classes for node types, container types, tiers, and edge styles. Unknown values are rejected with clear error messages listing valid options.
- **Enforcement layer**: Pydantic validation in the Python agent (pre-MCP), works with all LLM providers (Gemini, Claude, OpenAI, Ollama).
- **Error handling**: On validation failure, feed specific Pydantic error messages back to the LLM as a system message and allow **max 1 retry**. If the retry also fails, fall through to best-effort with ELK layout.

### FR-4: End-to-End Pipeline Integration
The three techniques operate as a **sequential pipeline**:
1. **RAG**: Template matcher finds closest template, injects full JSON spec into system prompt
2. **LLM generation**: LLM generates `compile_json_spec` tool call
3. **Structured Output**: Pydantic validates the spec (1 retry if invalid)
4. **MCP**: Validated spec sent to MCP wrapper → DiagramBuilder compiles
5. **ELK**: ELK computes layout positions on the compiled graph
6. **Apply**: DiagramBuilder applies ELK positions to cell map
7. **Validate**: Validators run (spatial → warnings, topological → errors)
8. **Finalize**: `finalize()` returns diagram XML

---

## Non-Functional Requirements
- **NFR-1: Latency** — ELK layout computation must complete in < 50ms for diagrams with up to 100 nodes.
- **NFR-2: Zero-shot success rate** — Target > 90% first-attempt compilation success (up from ~20-40% baseline).
- **NFR-3: Backwards compatibility** — All 10 existing E2E tests must continue to pass without modification.
- **NFR-4: No new infrastructure** — No new databases, services, or containers. ELK and TF-IDF run in-process.

## Acceptance Criteria
- [ ] ELK produces valid, non-overlapping layouts for all supported container hierarchies (VPC/AZ/Subnet).
- [ ] ELK orthogonal edge routing maps correctly to mxGraph waypoints.
- [ ] Few-shot RAG retrieves a relevant template for at least 80% of common architecture prompts.
- [ ] RAG skips injection when similarity is below threshold (cosine < 0.3).
- [ ] Pydantic schema rejects malformed specs with actionable error messages before MCP wrapper invocation.
- [ ] Spatial validators downgrade to warnings when ELK layout is active.
- [ ] All 10 existing E2E Playwright tests pass.
- [ ] New unit tests cover ELK layout, RAG retrieval, and schema validation (>80% coverage).
- [ ] Diagram generation latency (prompt → canvas render) does not regress beyond 15%.

## Out of Scope
- Specialized Hugging Face model integration (Qwen2.5-Coder, DeepSeek-Coder) — deferred to a future track.
- Gemini Structured Outputs (`response_format`) — deferred; Pydantic provides universal coverage.
- Fine-tuning or training custom models on diagram data.
- Vector database infrastructure (PGVector, Redis vector search).
- Changes to the draw.io frontend plugin or chat sidebar UI.
