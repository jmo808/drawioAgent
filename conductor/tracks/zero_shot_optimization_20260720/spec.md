# Spec: Zero-Shot Diagram Compilation Optimization

## Overview
The AI agent's diagram compilation pipeline currently suffers from a high first-attempt failure rate (~60-80%) due to the LLM's inability to reliably compute precise spatial coordinates, satisfy complex topological routing rules, and produce perfectly structured JSON specs on the first try. This results in multiple retry loops (up to 15 turns), increased latency, and degraded user experience.

This track implements three complementary optimization techniques to dramatically improve zero-shot compilation success rates:
1. **Server-side Auto-Layout via ELK** — offload all coordinate computation to a deterministic layout engine
2. **Dynamic Few-Shot RAG** — inject similar valid diagram templates as in-context examples
3. **Structured Outputs (JSON Schema)** — enforce strict schema compliance on LLM responses

## Functional Requirements

### FR-1: ELK Auto-Layout Engine Integration
- Integrate the **ELK (Eclipse Layout Kernel)** JavaScript library (`elkjs`) into the MCP wrapper Node.js process (co-located with `diagram-builder.js`).
- Implement a **hybrid** integration model:
  - The LLM outputs a **logical specification only** — nodes, containers, edges, containment relationships, and types — with **no coordinate values**.
  - ELK computes optimal positions (x, y, width, height) using its layered/hierarchical layout algorithm.
  - The `DiagramBuilder` receives ELK-computed positions and applies them before generating the final mxGraph XML.
- **Backwards compatibility**: Existing `_computePosition()` coordinate logic is preserved. ELK layout activates only for new builder-path diagrams where the LLM omits coordinates.
- ELK layout options should be configurable per diagram type (architecture → layered, network topology → force-directed, flowchart → hierarchical).
- Container nesting (VPC → AZ → Subnet hierarchy) must be respected by ELK's compound node layout.

### FR-2: Dynamic Few-Shot RAG
- Maintain a curated library of **15-20 hand-crafted, validated JSON diagram specifications** covering common patterns (multi-AZ VPC, serverless API, Kubernetes cluster, 3-tier web app, data pipeline, etc.).
- Implement an **in-memory embedding-based similarity search**:
  - Pre-compute embeddings for each template's description/metadata and store them in a JSON file bundled with the MCP wrapper.
  - At inference time, compute the embedding of the user's prompt and find the closest matching template(s) via cosine similarity.
- Inject the **top-1 matching template** as a few-shot example into the system prompt before the LLM generates the diagram spec.
- The template library should be extensible — adding a new template requires only adding a JSON file and regenerating the embedding index.

### FR-3: Structured Outputs (JSON Schema Enforcement)
- Define a **formal JSON Schema** for the `compile_json_spec` input format, covering:
  - `containers[]` — id, label, type, parentId, tier (enum)
  - `nodes[]` — id, label, type (enum of all supported types), parentId, variant
  - `edges[]` — sourceId, targetId, label, style (enum: solid/dashed), color
  - `title`, `type`, `theme`
- Integrate schema enforcement in the **Python agent service** using Pydantic models and/or Gemini's native Structured Outputs (JSON Schema mode).
- Invalid LLM responses that violate the schema are rejected **before** reaching the MCP wrapper, with structured error messages fed back to the LLM for correction.

## Non-Functional Requirements
- **NFR-1: Latency** — ELK layout computation must complete in < 50ms for diagrams with up to 100 nodes.
- **NFR-2: Zero-shot success rate** — Target > 90% first-attempt compilation success (up from ~20-40% baseline).
- **NFR-3: Backwards compatibility** — All 10 existing E2E tests must continue to pass without modification.
- **NFR-4: No new infrastructure** — No new databases, services, or containers. ELK and embeddings run in-process.

## Acceptance Criteria
- [ ] ELK produces valid, non-overlapping layouts for all supported container hierarchies (VPC/AZ/Subnet).
- [ ] Few-shot RAG retrieves a relevant template for at least 80% of common architecture prompts.
- [ ] Structured output schema rejects malformed specs before MCP wrapper invocation.
- [ ] All 10 existing E2E Playwright tests pass.
- [ ] New unit tests cover ELK layout, RAG retrieval, and schema validation (>80% coverage).
- [ ] Diagram generation latency (prompt → canvas render) does not regress beyond 15%.

## Out of Scope
- Specialized Hugging Face model integration (Qwen2.5-Coder, DeepSeek-Coder) — deferred to a future track.
- Fine-tuning or training custom models on diagram data.
- Vector database infrastructure (PGVector, Redis vector search).
- Changes to the draw.io frontend plugin or chat sidebar UI.
