# Implementation Plan: Zero-Shot Diagram Compilation Optimization

## Phase 1: ELK Auto-Layout Engine Integration

- [x] Task: Install elkjs dependency and verify runtime [1ca47c0]
    - [ ] Add `elkjs` to the drawio_plugin's package.json
    - [ ] Install and verify the module loads correctly in Node.js (`require('elkjs')`)
    - [ ] Verify ELK's layered algorithm runs a trivial graph in < 10ms

- [ ] Task: Define ELK layout configuration module
    - [ ] Write failing tests for ELK layout config: layout algorithm presets per diagram type (architecture → layered/DOWN, flowchart → layered/DOWN, network → layered/RIGHT), node spacing, layer spacing, container padding per type
    - [ ] Implement `elk-layout.js` module in `scripts/` with:
      - `getElkOptions(diagramType)` returning ELK algorithm config
      - Container padding map matching existing `CONTAINER_PADDING` constants
      - Default node size map matching existing `NODE_SIZES`
    - [ ] Verify tests pass

- [ ] Task: Implement ELK graph builder (`toElkGraph()`)
    - [ ] Write failing tests for converting DiagramBuilder internal state to ELK graph input:
      - Containers become compound nodes with children nested
      - Nodes become leaf nodes with declared sizes
      - Edges become ELK edges with source/target IDs
      - Deep nesting (Region → VPC → AZ → Subnet → Node) is preserved
    - [ ] Implement `toElkGraph()` method on DiagramBuilder that reads from `this.cells` and `this.edges` and outputs an ELK-compatible JSON graph
    - [ ] Verify tests pass

- [ ] Task: Implement ELK position applicator (`applyElkLayout()`)
    - [ ] Write failing tests for applying ELK-computed positions:
      - Container x, y, width, height written back to `this.cells` entries
      - Node x, y written back (width/height preserved from original)
      - Edge bend points converted to mxGraph `<mxPoint>` waypoint arrays
    - [ ] Implement `applyElkLayout(elkResult)` method on DiagramBuilder
    - [ ] Verify tests pass

- [ ] Task: Integrate ELK into compile_json_spec and finalize pipeline
    - [ ] Write failing tests for hybrid activation:
      - `compile_json_spec` path: ELK runs automatically after compilation
      - Incremental builder path (`add_node`): existing `addNode()` position logic is preserved
      - `finalize()` detects ELK-computed layout and downgrades spatial validation errors to warnings
    - [ ] Modify `compile_json_spec` handler in `mcp-wrapper.js` to invoke ELK after `compileSpecToBuilder()`
    - [ ] Modify `finalize()` to tag diagrams as `elkLayoutApplied` and pass flag to validators
    - [ ] Update validators to accept a `spatialAsWarnings` flag
    - [ ] Verify tests pass and all 10 existing E2E tests still pass

- [ ] Task: Conductor - User Manual Verification 'Phase 1: ELK Auto-Layout Engine Integration' (Protocol in workflow.md)

## Phase 2: Dynamic Few-Shot RAG

- [ ] Task: Curate template library (15-20 validated JSON specs)
    - [ ] Write failing tests that verify:
      - Template library loads from `references/templates/`
      - Each template is valid against the compile_json_spec schema
      - At least 15 templates exist covering required categories (multi-AZ VPC, serverless API, K8s cluster, 3-tier web app, data pipeline, etc.)
      - Each template has metadata (description, tags, category) in `index.json`
    - [ ] Create `references/templates/` directory with 15-20 hand-crafted JSON diagram specifications
    - [ ] Create `references/templates/index.json` manifest with metadata
    - [ ] Verify tests pass

- [ ] Task: Implement TF-IDF + cosine similarity template matcher
    - [ ] Write failing tests for template matching:
      - Given a query string, returns top-K matching template IDs with scores
      - Similarity threshold (cosine > 0.3) filters out weak matches
      - Returns empty when no template exceeds threshold
      - TF-IDF index loads from pre-computed JSON file
    - [ ] Implement `template_matcher.py` module in the Python agent service with:
      - `TemplateMatcher` class that loads TF-IDF index at init
      - `match(query: str, threshold: float = 0.3) -> Optional[TemplateMatch]` method
      - Zero external dependencies (use Python stdlib `collections.Counter` for TF-IDF)
    - [ ] Create `scripts/build_tfidf_index.py` to pre-compute TF-IDF vectors and write to JSON
    - [ ] Generate initial TF-IDF index
    - [ ] Verify tests pass

- [ ] Task: Integrate RAG into the Python agent's prompt pipeline
    - [ ] Write failing tests for prompt augmentation:
      - When a template matches (score > 0.3), its full JSON spec is injected into the system prompt
      - When no template matches, system prompt is unchanged
      - Injected template appears after reference guides and before user context
    - [ ] Modify `conversation.py` to:
      - Initialize `TemplateMatcher` at startup
      - Call `matcher.match(user_prompt)` before building system prompt
      - Inject matched template JSON as a few-shot example block
    - [ ] Verify tests pass

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Dynamic Few-Shot RAG' (Protocol in workflow.md)

## Phase 3: Structured Outputs (JSON Schema Enforcement)

- [ ] Task: Define Pydantic models for the diagram spec schema
    - [ ] Write failing tests for schema validation:
      - Valid specs pass validation
      - Invalid node type is rejected with error listing valid types
      - Invalid container type is rejected
      - Invalid tier value is rejected
      - Invalid edge style is rejected
      - Missing required fields are rejected
      - Extra/unknown fields are rejected
    - [ ] Create `models/diagram_spec.py` with Pydantic models:
      - `NodeType` enum (~40 values: ec2, ecs, lambda, rds, etc.)
      - `ContainerType` enum (region, vpc, az, subnet, group, etc.)
      - `TierType` enum (public, web, app, data)
      - `EdgeStyle` enum (solid, dashed)
      - `Container` model (id, label, type, parentId, tier)
      - `Node` model (id, label, type, parentId, variant)
      - `Edge` model (sourceId, targetId, label, style, color)
      - `DiagramSpec` model (title, type, theme, containers[], nodes[], edges[])
    - [ ] Verify tests pass

- [ ] Task: Integrate schema enforcement into the orchestrator
    - [ ] Write failing tests for the orchestrator's validation step:
      - LLM output with valid spec passes through to MCP wrapper
      - LLM output with invalid spec triggers Pydantic validation error
      - Validation error is fed back to LLM as a system message
      - Max 1 retry is allowed for schema correction
      - After 1 failed retry, spec is forwarded as best-effort (ELK will handle layout)
    - [ ] Modify `orchestrator.py` to:
      - Intercept `compile_json_spec` tool call arguments
      - Parse through `DiagramSpec.model_validate()`
      - On `ValidationError`, format errors and inject as system message, allow 1 retry
      - On success or after retry exhaustion, forward to MCP bridge
    - [ ] Verify tests pass

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Structured Outputs' (Protocol in workflow.md)

## Phase 4: Integration Testing & Validation

- [ ] Task: Run full E2E test suite and verify no regressions
    - [ ] Execute all 10 Playwright E2E tests against the test stack
    - [ ] Verify all pass with no modifications required

- [ ] Task: Benchmark zero-shot success rate
    - [ ] Create a benchmark script (`scripts/benchmark_zeroshot.py`) that:
      - Runs 10 representative prompts through the full pipeline
      - Records first-attempt compilation success/failure for each
      - Outputs success rate percentage
    - [ ] Measure and record first-attempt compilation success rate
    - [ ] Verify target > 90% is achieved

- [ ] Task: Verify latency NFR
    - [ ] Measure ELK layout computation time for diagrams with 50 and 100 nodes
    - [ ] Verify < 50ms threshold
    - [ ] Measure end-to-end diagram generation latency and verify < 15% regression vs. baseline

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Integration Testing & Validation' (Protocol in workflow.md)
