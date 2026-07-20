# Implementation Plan: Zero-Shot Diagram Compilation Optimization

## Phase 1: ELK Auto-Layout Engine Integration

- [ ] Task: Define ELK layout configuration module
    - [ ] Write failing tests for ELK layout config (layout options per diagram type: layered, force, hierarchical)
    - [ ] Implement `elk-layout.js` module in `scripts/` with layout option presets per diagram type
    - [ ] Verify tests pass

- [ ] Task: Implement ELK graph builder (logical spec → ELK graph)
    - [ ] Write failing tests for converting DiagramBuilder internal state to ELK graph input format (compound nodes, edges, hierarchy)
    - [ ] Implement `toElkGraph()` method on DiagramBuilder that exports containers, nodes, and edges as an ELK-compatible JSON graph with compound node nesting
    - [ ] Verify tests pass

- [ ] Task: Implement ELK position applicator (ELK output → DiagramBuilder positions)
    - [ ] Write failing tests for applying ELK-computed positions back to DiagramBuilder cells
    - [ ] Implement `applyElkLayout(elkResult)` method on DiagramBuilder that writes ELK-computed x, y, width, height back to internal cell/container maps
    - [ ] Verify tests pass

- [ ] Task: Integrate ELK into the finalize pipeline (hybrid activation)
    - [ ] Write failing tests for the hybrid detection logic (activate ELK when LLM omits coordinates, skip when manual coordinates are present)
    - [ ] Modify `finalize()` and/or `_applyTopologicalCorrections()` to invoke ELK layout when coordinates are absent
    - [ ] Preserve existing `_computePosition()` path for backwards compatibility
    - [ ] Verify tests pass

- [ ] Task: Install elkjs dependency
    - [ ] Add `elkjs` to the MCP wrapper's package.json and install
    - [ ] Verify the module loads correctly in the Node.js runtime

- [ ] Task: Conductor - User Manual Verification 'Phase 1: ELK Auto-Layout Engine Integration' (Protocol in workflow.md)

## Phase 2: Dynamic Few-Shot RAG

- [ ] Task: Curate template library (15-20 validated JSON specs)
    - [ ] Write failing tests that verify template library loads, each template is valid against the compile_json_spec schema, and covers the required pattern categories
    - [ ] Create `references/templates/` directory with 15-20 hand-crafted JSON diagram specifications (multi-AZ VPC, serverless API, K8s cluster, 3-tier web app, data pipeline, etc.)
    - [ ] Create `references/templates/index.json` manifest with metadata (description, tags, category) for each template
    - [ ] Verify tests pass

- [ ] Task: Implement embedding-based similarity search
    - [ ] Write failing tests for cosine similarity search (given a query embedding, returns top-K matching template IDs)
    - [ ] Implement `template-matcher.js` module with pre-computed embeddings stored in a JSON file and cosine similarity search
    - [ ] Generate initial embedding index by computing embeddings for all template descriptions
    - [ ] Verify tests pass

- [ ] Task: Integrate RAG into the Python agent's prompt pipeline
    - [ ] Write failing tests for the prompt augmentation (verify few-shot example is injected into system prompt when a match is found)
    - [ ] Modify `conversation.py` to call the template matcher and inject the top-1 matching template JSON as a few-shot example in the system prompt
    - [ ] Verify tests pass

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Dynamic Few-Shot RAG' (Protocol in workflow.md)

## Phase 3: Structured Outputs (JSON Schema Enforcement)

- [ ] Task: Define Pydantic models for the diagram spec schema
    - [ ] Write failing tests for schema validation (valid specs pass, malformed specs are rejected with structured errors)
    - [ ] Create `models/diagram_spec.py` with Pydantic models for Container, Node, Edge, and DiagramSpec
    - [ ] Define enum types for all supported node types, container types, tier values, and edge styles
    - [ ] Verify tests pass

- [ ] Task: Integrate schema enforcement into the orchestrator
    - [ ] Write failing tests for the orchestrator's schema validation step (LLM output is validated before being sent to MCP wrapper)
    - [ ] Modify `orchestrator.py` to parse and validate LLM tool-call arguments against the Pydantic schema before forwarding to the MCP bridge
    - [ ] On validation failure, feed structured error messages back to the LLM conversation for self-correction
    - [ ] Verify tests pass

- [ ] Task: Enable Gemini Structured Outputs (JSON Schema mode) for compile_json_spec calls
    - [ ] Write failing tests for the LiteLLM call configuration (verify response_format is set when calling compile_json_spec)
    - [ ] Modify the LiteLLM call in the orchestrator to pass `response_format` with the JSON schema when the tool is `compile_json_spec`
    - [ ] Verify tests pass

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Structured Outputs' (Protocol in workflow.md)

## Phase 4: Integration Testing & Validation

- [ ] Task: Run full E2E test suite and verify no regressions
    - [ ] Execute all 10 Playwright E2E tests against the test stack
    - [ ] Verify all pass with no modifications required

- [ ] Task: Benchmark zero-shot success rate
    - [ ] Create a benchmark script that runs 10 representative prompts through the full pipeline
    - [ ] Measure and record first-attempt compilation success rate
    - [ ] Verify target > 90% is achieved

- [ ] Task: Verify latency NFR
    - [ ] Measure ELK layout computation time for diagrams with 50 and 100 nodes
    - [ ] Verify < 50ms threshold
    - [ ] Measure end-to-end diagram generation latency and verify < 15% regression

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Integration Testing & Validation' (Protocol in workflow.md)
