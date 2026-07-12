# Implementation Plan: Universal JSON Diagram Compilation & Domain Expert Expansion

## Phase 1: Universal JSON Engine & All Domain Experts

### 1.1 — Universal JSON Spec Engine (diagram-builder.js)

- [x] Task: Extend `_layoutContainer` with new container type mappings (30d26e4)
    - [x] Add layout rules for `cluster`, `namespace`, `deployment` (K8s)
    - [x] Add layout rules for `wan`, `dmz`, `lan`, `vlan` (Network)
    - [x] Add layout rules for flowchart `group` containers
    - [x] Write unit tests for each new container layout calculation


- [x] Task: Extend `addNode` with new node type mappings (d86631a)
    - [x] Add node styles/sizes for flowchart types: `process`, `decision`, `start`, `end`, `io`, `subroutine`
    - [x] Add node styles/sizes for K8s types: `pod`, `service`, `ingress`, `configmap`, `secret`, `pv`, `pvc`, `hpa`
    - [x] Add node styles/sizes for network types: `router`, `switch`, `firewall`, `server`, `workstation`, `wireless_ap`, `load_balancer`, `storage`
    - [x] Add node styles/sizes for ERD types: `table`, `view` (card rendering with columns list)
    - [x] Add node styles/sizes for sequence types: `participant`, `activation`, `note`
    - [x] Add node styles/sizes for mind map types: `central`, `branch`, `leaf`
    - [x] Write unit tests for each new node type's style and size



- [ ] Task: Extend `connect` with new edge/connector styles
    - [ ] Add crow's-foot notation styles for ERD: `1:1`, `1:N`, `N:M`
    - [ ] Add sequence diagram message arrow styles (sync, async, return)
    - [ ] Add PFD stream styles (solid process, dashed utility, dotted instrument)
    - [ ] Write unit tests for connector style resolution

- [ ] Task: Add diagram-type-aware layout strategies to `compileSpecToBuilder`
    - [ ] Flowchart: top-to-bottom node spacing with decision branching
    - [ ] Sequence: left-to-right participant lanes, vertical message stacking
    - [ ] Mind map: radial/tree layout from central node
    - [ ] Swimlane: reuse existing `lane` container with cross-lane edge support
    - [ ] ERD: grid layout of table cards
    - [ ] K8s: cluster → namespace → deployment nesting
    - [ ] Network: WAN → DMZ → LAN → VLAN tiered nesting
    - [ ] PFD: left-to-right flow with port-aware node placement
    - [ ] Write unit tests for each layout strategy

- [ ] Task: Conductor - User Manual Verification 'Universal JSON Engine' (Protocol in workflow.md)

### 1.2 — PFD Domain Expert Expansion

- [ ] Task: Add PFD equipment shape library to `diagram-builder.js`
    - [ ] Add styles/sizes/ports for Separator (2-phase, 3-phase)
    - [ ] Add styles/sizes/ports for Heat Exchanger (shell-and-tube, plate)
    - [ ] Add styles/sizes/ports for Pump (centrifugal, positive displacement)
    - [ ] Add styles/sizes/ports for Compressor (centrifugal, reciprocating)
    - [ ] Add styles/sizes/ports for Reactor (CSTR, PFR)
    - [ ] Add styles/sizes/ports for Distillation Column (tray, packed)
    - [ ] Add styles/sizes/ports for Tank/Vessel (storage, surge, accumulator)
    - [ ] Write unit tests for equipment shape resolution and port definitions

- [ ] Task: Expand PFD validator (`validators/pfd.js`)
    - [ ] Write failing tests for each new rule
    - [ ] Implement PHASE_PORT_VIOLATION rule
    - [ ] Implement DEAD_END_STREAM rule
    - [ ] Implement OPPOSING_FLOW rule
    - [ ] Implement GRAVITY_VIOLATION rule
    - [ ] Implement INSTRUMENT_IN_PROCESS_LINE rule
    - [ ] Implement COMPRESSOR_INLET_AT_BOTTOM rule
    - [ ] Verify all tests pass

- [ ] Task: Update PFD reference guide (`pfd-engineering-expert.md`)
    - [ ] Add complete equipment class catalog with port maps
    - [ ] Add stream routing conventions (solid/dashed/dotted)
    - [ ] Add standard P&ID symbol cross-reference table
    - [ ] Add feed-left / product-right layout convention documentation

- [ ] Task: Conductor - User Manual Verification 'PFD Expansion' (Protocol in workflow.md)

### 1.3 — Kubernetes Topology Expert (New)

- [ ] Task: Create K8s reference guide (`kubernetes-topology-expert.md`)
    - [ ] Document K8s resource hierarchy and nesting rules
    - [ ] Document service discovery and networking patterns
    - [ ] Document common architecture patterns (sidecar, ambassador, adapter)

- [ ] Task: Create K8s validator (`validators/kubernetes.js`)
    - [ ] Write failing tests for each rule
    - [ ] Implement ORPHAN_POD rule
    - [ ] Implement SERVICE_WITHOUT_TARGET rule
    - [ ] Implement INGRESS_BYPASS rule
    - [ ] Implement PVC_WITHOUT_PV rule
    - [ ] Implement NAMESPACE_LEAK rule
    - [ ] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [ ] Verify all tests pass

- [ ] Task: Register K8s keyword triggers in `conversation.py`
    - [ ] Add kubernetes/k8s/pod/namespace/deployment keyword scan flags
    - [ ] Mount `kubernetes-topology-expert.md` when keywords detected

- [ ] Task: Conductor - User Manual Verification 'K8s Expert' (Protocol in workflow.md)

### 1.4 — ER Diagram Expert (New)

- [ ] Task: Create ERD reference guide (`erd-database-expert.md`)
    - [ ] Document notation conventions (crow's-foot, chen)
    - [ ] Document normalization guidance (1NF–3NF)
    - [ ] Document common schema patterns (junction tables, polymorphic associations)

- [ ] Task: Create ERD validator (`validators/erd.js`)
    - [ ] Write failing tests for each rule
    - [ ] Implement FK_WITHOUT_TARGET rule
    - [ ] Implement ORPHAN_TABLE rule (warning)
    - [ ] Implement DUPLICATE_PK rule
    - [ ] Implement SELF_REFERENCE_MISSING rule
    - [ ] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [ ] Verify all tests pass

- [ ] Task: Implement ERD table card rendering in `diagram-builder.js`
    - [ ] Parse `columns` array from JSON spec into multi-line cell labels
    - [ ] Render PK/FK badges, type annotations, and nullable indicators
    - [ ] Write unit tests for table card rendering

- [ ] Task: Register ERD keyword triggers in `conversation.py`
    - [ ] Add erd/database/schema/table/entity keyword scan flags
    - [ ] Mount `erd-database-expert.md` when keywords detected

- [ ] Task: Conductor - User Manual Verification 'ERD Expert' (Protocol in workflow.md)

### 1.5 — Network Topology Expert (New)

- [ ] Task: Create Network reference guide (`network-topology-expert.md`)
    - [ ] Document three-tier architecture (Core → Distribution → Access)
    - [ ] Document segmentation best practices
    - [ ] Document standard network device icons and conventions

- [ ] Task: Create Network validator (`validators/network.js`)
    - [ ] Write failing tests for each rule
    - [ ] Implement DIRECT_WAN_TO_LAN rule
    - [ ] Implement ORPHAN_DEVICE rule
    - [ ] Implement VLAN_LEAK rule
    - [ ] Implement REDUNDANCY_WARNING rule
    - [ ] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [ ] Verify all tests pass

- [ ] Task: Register Network keyword triggers in `conversation.py`
    - [ ] Add network/topology/switch/router/firewall/vlan keyword scan flags
    - [ ] Mount `network-topology-expert.md` when keywords detected

- [ ] Task: Conductor - User Manual Verification 'Network Expert' (Protocol in workflow.md)

### 1.6 — Tool Descriptions, SKILL.md & Integration

- [ ] Task: Update tool descriptions in `mcp-wrapper.js`
    - [ ] `compile_json_spec`: MANDATORY for all new diagram generation
    - [ ] `open_drawio_xml`: Only for loading existing diagrams from files
    - [ ] `add_node`/`add_container`/`connect`: Incremental modifications only
    - [ ] Write tests verifying tool description interception in tools/list

- [ ] Task: Update SKILL.md with universal diagram type catalog
    - [ ] Add JSON spec examples for each of the 10 diagram types
    - [ ] Reference all 7 domain expert guides
    - [ ] Mandate `compile_json_spec` for all new diagram generation

- [ ] Task: Update `conversation.py` docs index
    - [ ] Register all new reference guides in DOCS_INDEX
    - [ ] Verify keyword triggers mount correct references

- [ ] Task: End-to-end integration smoke test
    - [ ] Run orchestrator simulation for a GCP architecture prompt
    - [ ] Run orchestrator simulation for a flowchart prompt
    - [ ] Run orchestrator simulation for a K8s topology prompt
    - [ ] Verify all three produce valid XML via `compile_json_spec` in ≤ 3 tool turns

- [ ] Task: Conductor - User Manual Verification 'Integration & SKILL.md' (Protocol in workflow.md)
