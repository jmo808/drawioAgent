# Specification: Universal JSON Diagram Compilation & Domain Expert Expansion

## Overview

This track standardizes **all** diagram generation on the declarative `compile_json_spec` tool path — eliminating raw XML generation entirely — and expands the platform's domain expertise from three verticals (AWS, GCP, PFD) to **seven** by adding Kubernetes Topology, ER Diagrams, Network Topology, and significantly deepening the existing PFD expert. Each new domain receives a dedicated reference guide, a validation engine, and domain-specific layout rules in `diagram-builder.js`.

## Functional Requirements

### FR-1: Universal JSON Spec Compilation

The `compile_json_spec` tool must accept a `type` field supporting all of the following diagram types. Each type maps to a dedicated layout strategy in `diagram-builder.js`:

| Type Value | Description | Layout Strategy |
|---|---|---|
| `architecture` | Cloud infrastructure (AWS, GCP, Azure) | Existing region → VPC → AZ/subnet nesting |
| `flowchart` | Process flows, decision trees | Top-to-bottom or left-to-right with auto-spacing. Nodes: `process`, `decision`, `start`, `end`, `io`, `subroutine` |
| `sequence` | UML sequence diagrams | Left-to-right participant lanes, vertical message arrows, activation bars |
| `erd` | Entity-Relationship diagrams | Grid layout of table cards with crow's-foot connectors |
| `kubernetes` | K8s cluster topology | Cluster → Namespace → Deployment/Service/Pod nesting |
| `mindmap` | Hierarchical mind maps | Radial or tree layout from central node |
| `swimlane` | Cross-functional process flows | Horizontal swim lanes with process nodes per lane |
| `network` | Network topology diagrams | Core → Distribution → Access tier nesting |
| `pfd` | Process Flow Diagrams | Left-to-right flow with physics-based port routing |
| `pid` | Piping & Instrumentation Diagrams | Left-to-right flow with instrument signal routing |

### FR-2: PFD Domain Expert Expansion

#### FR-2.1: Equipment Shape Library

Add the following equipment classes to `diagram-builder.js` with correct draw.io shape styles, standard port definitions, and sizing:

| Equipment Class | Subtypes | Ports |
|---|---|---|
| **Separator** | 2-phase, 3-phase | Inlet: side-upper. Gas: top-center. Liquid: bottom. Mid-phase: side-mid (3-phase only) |
| **Heat Exchanger** | Shell-and-tube, Plate | Tube-side inlet/outlet: left/right. Shell-side inlet/outlet: top/bottom |
| **Pump** | Centrifugal, Positive Displacement | Inlet: side/center. Discharge: top |
| **Compressor** | Centrifugal, Reciprocating | Inlet: side. Discharge: top |
| **Reactor** | CSTR, PFR | Feed: left/top. Product: right/bottom. Utility: bottom (jacket) |
| **Distillation Column** | Tray, Packed | Feed: side-mid. Overhead: top. Bottoms: bottom. Reflux: top-side. Reboiler: bottom-side |
| **Tank/Vessel** | Storage, Surge, Accumulator | Inlet: top/side. Outlet: bottom/side |

#### FR-2.2: PFD Validator Enhancement

Expand `validators/pfd.js` with the following validation rules:

- **PHASE_PORT_VIOLATION**: Gas/light phase must exit from top ports; heavy/liquid phase from bottom ports
- **DEAD_END_STREAM**: Every process line must have both a source and destination equipment
- **OPPOSING_FLOW**: No two edges on the same stream segment may have opposing directions
- **GRAVITY_VIOLATION**: Heavy-phase outlet elevation must be lower than light-phase outlet on the same vessel
- **INSTRUMENT_IN_PROCESS_LINE**: Instrument bubbles must not appear inline in process piping — they must be connected via dashed signal lines to vessel shells
- **COMPRESSOR_INLET_AT_BOTTOM**: Gas inlet to compressors must be side or center, never bottom

#### FR-2.3: PFD Reference Guide Update

Update `pfd-engineering-expert.md` with:
- Complete equipment class catalog with port maps
- Stream routing conventions (process solid, utility dashed, instrument dotted)
- Standard P&ID symbol cross-reference table
- Feed-left / product-right layout convention documentation

### FR-3: Kubernetes Topology Expert (New)

#### FR-3.1: Container/Node Types

| Container Type | Layout |
|---|---|
| `cluster` | Outermost boundary (like `region` in architecture) |
| `namespace` | Nested within cluster (like `vpc`) |
| `deployment` | Group within namespace containing pod replicas |

| Node Type | Description |
|---|---|
| `pod` | Individual pod (with optional replica count badge) |
| `service` | ClusterIP / NodePort / LoadBalancer service |
| `ingress` | Ingress controller / resource |
| `configmap` | ConfigMap resource |
| `secret` | Secret resource |
| `pv` | PersistentVolume |
| `pvc` | PersistentVolumeClaim |
| `hpa` | HorizontalPodAutoscaler |

#### FR-3.2: K8s Validator

Create `validators/kubernetes.js` with rules:
- **ORPHAN_POD**: Pods must be inside a Deployment or StatefulSet container
- **SERVICE_WITHOUT_TARGET**: Services must connect to at least one Deployment/Pod
- **INGRESS_BYPASS**: Ingress must connect to a Service, not directly to Pods
- **PVC_WITHOUT_PV**: PVC must reference a PV
- **NAMESPACE_LEAK**: Resources must not connect across namespace boundaries without explicit annotation

#### FR-3.3: K8s Reference Guide

Create `kubernetes-topology-expert.md` with:
- Standard K8s resource hierarchy and nesting rules
- Service discovery and networking patterns
- Common architecture patterns (sidecar, ambassador, adapter)

### FR-4: ER Diagram Expert (New)

#### FR-4.1: Container/Node Types

| Node Type | Description |
|---|---|
| `table` | Database table rendered as a card with columns list |
| `view` | Database view (dashed border variant) |

Table nodes must support a `columns` array in the JSON spec where each column has `name`, `type`, and optional flags (`pk`, `fk`, `nullable`, `unique`).

#### FR-4.2: ERD Connector Styles

Support crow's-foot notation for relationship cardinality:
- `1:1` — Single line with perpendicular bar on both ends
- `1:N` — Bar on "1" side, crow's foot on "N" side
- `N:M` — Crow's foot on both sides

#### FR-4.3: ERD Validator

Create `validators/erd.js` with rules:
- **FK_WITHOUT_TARGET**: Foreign key columns must reference an existing table
- **ORPHAN_TABLE**: Tables with no relationships should generate a warning
- **DUPLICATE_PK**: Tables must not have multiple primary keys unless composite
- **SELF_REFERENCE_MISSING**: Self-referencing FK must have an edge back to the same table

#### FR-4.4: ERD Reference Guide

Create `erd-database-expert.md` with:
- Standard notation conventions
- Crow's-foot and Chen notation
- Normalization guidance (1NF–3NF)
- Common schema patterns (polymorphic associations, junction tables)

### FR-5: Network Topology Expert (New)

#### FR-5.1: Container/Node Types

| Container Type | Layout |
|---|---|
| `wan` | External network boundary |
| `dmz` | DMZ/perimeter zone |
| `lan` | Internal LAN segment |
| `vlan` | VLAN segment within LAN |

| Node Type | Description |
|---|---|
| `router` | Layer 3 router |
| `switch` | Layer 2/3 switch |
| `firewall` | Firewall appliance |
| `server` | Physical/virtual server |
| `workstation` | End-user workstation |
| `wireless_ap` | Wireless access point |
| `load_balancer` | Network load balancer |
| `storage` | NAS/SAN storage device |

#### FR-5.2: Network Validator

Create `validators/network.js` with rules:
- **DIRECT_WAN_TO_LAN**: Traffic from WAN must pass through a firewall or DMZ
- **ORPHAN_DEVICE**: Every device must have at least one connection
- **VLAN_LEAK**: Devices in different VLANs must connect via a router/L3 switch
- **REDUNDANCY_WARNING**: Core switches/routers without redundant peers generate a warning

#### FR-5.3: Network Reference Guide

Create `network-topology-expert.md` with:
- Three-tier architecture patterns (Core → Distribution → Access)
- Segmentation best practices
- Standard network device icons and conventions

### FR-6: Generic Diagram Types (Flowchart, Sequence, Mind Map, Swimlane)

#### FR-6.1: Flowchart

Node types: `process` (rectangle), `decision` (diamond), `start`/`end` (rounded rect/ellipse), `io` (parallelogram), `subroutine` (double-bordered rect). Layout: top-to-bottom with configurable direction.

#### FR-6.2: Sequence Diagram

Elements: `participant` (vertical lifeline), `message` (horizontal arrow), `activation` (narrow rect on lifeline), `note` (annotation). Layout: participants spaced left-to-right, messages stacked top-to-bottom.

#### FR-6.3: Mind Map

Elements: `central` (root topic), `branch` (child topic), `leaf` (terminal topic). Layout: radial or horizontal tree from central node.

#### FR-6.4: Swimlane

Reuse existing `lane` container type in `diagram-builder.js`. Nodes within lanes follow grid placement. Edges cross lane boundaries freely.

### FR-7: Tool Description Updates

- `compile_json_spec`: Description must state it is **MANDATORY for all new diagram generation**
- `open_drawio_xml`: Description must state it is **only for loading existing diagrams** from files, not for generation
- Individual builder tools (`add_node`, `add_container`, `connect`): Descriptions must state they are for **incremental modifications only**, not for new diagram creation

### FR-8: SKILL.md Updates

The drawio plugin `SKILL.md` must be updated to:
- List all supported diagram types with example JSON spec snippets
- Reference all domain expert guides
- Mandate `compile_json_spec` for all new diagram generation regardless of type

## Non-Functional Requirements

- **Backwards Compatibility**: Existing AWS/GCP architecture JSON specs must continue to work without modification
- **Validation Performance**: All validators must complete in < 500ms for diagrams with up to 200 nodes
- **Extensibility**: New domain experts should be addable by creating a reference `.md` + validator `.js` + registering in `validate.js` and `conversation.py`

## Acceptance Criteria

1. ✅ `compile_json_spec` accepts all 10 diagram `type` values and produces valid draw.io XML
2. ✅ PFD diagrams with full equipment suite pass the expanded `pfd.js` validator
3. ✅ K8s topology diagrams pass `kubernetes.js` validator
4. ✅ ER diagrams render table cards with column lists and crow's-foot connectors
5. ✅ Network topology diagrams enforce firewall-before-LAN rules via `network.js` validator
6. ✅ Flowcharts, sequence diagrams, mind maps, and swimlane diagrams render correctly with appropriate layout strategies
7. ✅ The agent defaults to `compile_json_spec` for every new diagram request (no raw XML generation)
8. ✅ All existing AWS/GCP architecture specs continue to compile and validate without changes
9. ✅ All domain expert references are registered in `conversation.py` keyword triggers

## Out of Scope

- Visual theme customization (colors/fonts) — handled by existing `theme` field
- Real-time collaborative editing of diagrams
- Export to image formats (PNG/SVG) — already handled by draw.io native export
- Azure cloud architecture expert (can be added as a follow-up track)
- P&ID (Piping & Instrumentation) validator expansion beyond existing `HOSTILE_PID_ROUTING` rule (separate track)
