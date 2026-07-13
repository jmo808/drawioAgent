# Specification - Track 6: Decoupled Domain Expert Architecture

## Context & Objectives
The core diagram layout compiler (`diagram-builder.js`) currently mixes generic graph positioning mathematics with domain-specific icon styles (base64 SVG data URIs) and layout correction rules for AWS, GCP, ERD, and PFD topologies. 

This specification decouples these responsibilities into:
1.  **Core Layout Engine:** Resolves parent-child coordinates, grid layouts, swimlanes, and generic node spacing.
2.  **Domain Profiles (`profile.json`):** Declarative styles, sizing metadata, and label-to-type normalization keywords for each architecture domain.
3.  **Domain Correctors (`corrector.js`):** Extensible layout modifier hooks matching the domain's architecture rules.

## Core Lifecycle Hooks
The `DiagramBuilder` layout lifecycle triggers hooks registered by domain correctors:
*   `beforeLayout(builder)`: Invoked before sizing and grid coordinates are calculated. Allows correctors to inject/remove nodes or change their hierarchy.
*   `afterLayout(builder)`: Invoked after grid layouts and sibling offsets are calculated. Allows correctors to redirect edge connections, compute custom edge waypoints, or modify styles.

## Directory Structure
```
drawio_plugin/scripts/domains/
├── registry.js (Registry loader)
├── aws/
│   ├── profile.json
│   └── corrector.js
├── gcp/
│   ├── profile.json
│   └── corrector.js
├── erd/
│   ├── profile.json
│   └── corrector.js
└── pfd/
    ├── profile.json
    └── corrector.js
```
