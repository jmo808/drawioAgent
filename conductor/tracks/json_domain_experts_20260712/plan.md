# Implementation Plan: Universal JSON Diagram Compilation & Domain Expert Expansion

## Phase 1: Universal JSON Engine & All Domain Experts

### 1.1 — Universal JSON Spec Engine (diagram-builder.js) [checkpoint: 4b40802]

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



- [x] Task: Extend `connect` with new edge/connector styles (fa36680)
    - [x] Add crow's-foot notation styles for ERD: `1:1`, `1:N`, `N:M`
    - [x] Add sequence diagram message arrow styles (sync, async, return)
    - [x] Add PFD stream styles (solid process, dashed utility, dotted instrument)
    - [x] Write unit tests for connector style resolution



- [x] Task: Add diagram-type-aware layout strategies to `compileSpecToBuilder` (4b40802)
    - [x] Flowchart: top-to-bottom node spacing with decision branching
    - [x] Sequence: left-to-right participant lanes, vertical message stacking
    - [x] Mind map: radial/tree layout from central node
    - [x] Swimlane: reuse existing `lane` container with cross-lane edge support
    - [x] ERD: grid layout of table cards
    - [x] K8s: cluster → namespace → deployment nesting
    - [x] Network: WAN → DMZ → LAN → VLAN tiered nesting
    - [x] PFD: left-to-right flow with port-aware node placement
    - [x] Write unit tests for each layout strategy



- [x] Task: Conductor - User Manual Verification 'Universal JSON Engine' (Protocol in workflow.md)

### 1.2 — PFD Domain Expert Expansion [checkpoint: b0a31ed]

- [x] Task: Add PFD equipment shape library to `diagram-builder.js` (e5c1142)
    - [x] Add styles/sizes/ports for Separator (2-phase, 3-phase)
    - [x] Add styles/sizes/ports for Heat Exchanger (shell-and-tube, plate)
    - [x] Add styles/sizes/ports for Pump (centrifugal, positive displacement)
    - [x] Add styles/sizes/ports for Compressor (centrifugal, reciprocating)
    - [x] Add styles/sizes/ports for Reactor (CSTR, PFR)
    - [x] Add styles/sizes/ports for Distillation Column (tray, packed)
    - [x] Add styles/sizes/ports for Tank/Vessel (storage, surge, accumulator)
    - [x] Write unit tests for equipment shape resolution and port definitions

- [x] Task: Expand PFD validator (`validators/pfd.js`) (d02aae2)
    - [x] Write failing tests for each new rule
    - [x] Implement PHASE_PORT_VIOLATION rule
    - [x] Implement DEAD_END_STREAM rule
    - [x] Implement OPPOSING_FLOW rule
    - [x] Implement GRAVITY_VIOLATION rule
    - [x] Implement INSTRUMENT_IN_PROCESS_LINE rule
    - [x] Implement COMPRESSOR_INLET_AT_BOTTOM rule
    - [x] Verify all tests pass

- [x] Task: Update PFD reference guide (`pfd-engineering-expert.md`) (b0a31ed)
    - [x] Add complete equipment class catalog with port maps
    - [x] Add stream routing conventions (solid/dashed/dotted)
    - [x] Add standard P&ID symbol cross-reference table
    - [x] Add feed-left / product-right layout convention documentation

- [x] Task: Conductor - User Manual Verification 'PFD Expansion' (Protocol in workflow.md)

### 1.3 — Kubernetes Topology Expert (New) [checkpoint: 47c10be]

- [x] Task: Create K8s reference guide (`kubernetes-topology-expert.md`) (d990dca)
    - [x] Document K8s resource hierarchy and nesting rules
    - [x] Document service discovery and networking patterns
    - [x] Document common architecture patterns (sidecar, ambassador, adapter)

- [x] Task: Create K8s validator (`validators/kubernetes.js`) (47c10be)
    - [x] Write failing tests for each rule
    - [x] Implement ORPHAN_POD rule
    - [x] Implement SERVICE_WITHOUT_TARGET rule
    - [x] Implement INGRESS_BYPASS rule
    - [x] Implement PVC_WITHOUT_PV rule
    - [x] Implement NAMESPACE_LEAK rule
    - [x] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [x] Verify all tests pass

- [x] Task: Register K8s keyword triggers in `conversation.py` (08a46c9)
    - [x] Add kubernetes/k8s/pod/namespace/deployment keyword scan flags
    - [x] Mount `kubernetes-topology-expert.md` when keywords detected

- [x] Task: Conductor - User Manual Verification 'K8s Expert' (Protocol in workflow.md)

### 1.4 — ER Diagram Expert (New) [checkpoint: 52af02b]

- [x] Task: Create ERD reference guide (`erd-database-expert.md`) (4640b69)
    - [x] Document notation conventions (crow's-foot, chen)
    - [x] Document normalization guidance (1NF–3NF)
    - [x] Document common schema patterns (junction tables, polymorphic associations)

- [x] Task: Create ERD validator (`validators/erd.js`) (46dde5b)
    - [x] Write failing tests for each rule
    - [x] Implement FK_WITHOUT_TARGET rule
    - [x] Implement ORPHAN_TABLE rule (warning)
    - [x] Implement DUPLICATE_PK rule
    - [x] Implement SELF_REFERENCE_MISSING rule
    - [x] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [x] Verify all tests pass

- [x] Task: Implement ERD table card rendering in `diagram-builder.js` (52af02b)
    - [x] Parse `columns` array from JSON spec into multi-line cell labels
    - [x] Render PK/FK badges, type annotations, and nullable indicators
    - [x] Write unit tests for table card rendering

- [x] Task: Register ERD keyword triggers in `conversation.py` (3e20d9b)
    - [x] Add erd/database/schema/table/entity keyword scan flags
    - [x] Mount `erd-database-expert.md` when keywords detected

- [x] Task: Conductor - User Manual Verification 'ERD Expert' (Protocol in workflow.md)

### 1.5 — Network Topology Expert (New) [checkpoint: b072d34]

- [x] Task: Create Network reference guide (`network-topology-expert.md`) (b8c7461)
    - [x] Document three-tier architecture (Core → Distribution → Access)
    - [x] Document segmentation best practices
    - [x] Document standard network device icons and conventions

- [x] Task: Create Network validator (`validators/network.js`) (b072d34)
    - [x] Write failing tests for each rule
    - [x] Implement DIRECT_WAN_TO_LAN rule
    - [x] Implement ORPHAN_DEVICE rule
    - [x] Implement VLAN_LEAK rule
    - [x] Implement REDUNDANCY_WARNING rule
    - [x] Register in `validate.js` VALIDATOR_TYPE_MAP
    - [x] Verify all tests pass

- [x] Task: Register Network keyword triggers in `conversation.py` (01b2e86)
    - [x] Add network/topology/switch/router/firewall/vlan keyword scan flags
    - [x] Mount `network-topology-expert.md` when keywords detected

- [x] Task: Conductor - User Manual Verification 'Network Expert' (Protocol in workflow.md)

### 1.6 — Tool Descriptions, SKILL.md & Integration

- [~] Task: Update tool descriptions in `mcp-wrapper.js`
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
