# Plan - Track 6: Decoupled Domain Expert Architecture

This plan tracks the tasks to extract domain experts out of `diagram-builder.js` into modular plugins under `scripts/domains/`.

## Tasks

- [x] **Task 1: Setup structure and AWS assets profile**
  Move AWS shapes/dimensions from `NODE_STYLES` / `NODE_SIZES` into `scripts/domains/aws/profile.json`.
  
- [x] **Task 2: Setup GCP assets profile**
  Move GCP shapes/dimensions from `NODE_STYLES` / `NODE_SIZES` into `scripts/domains/gcp/profile.json`.

- [x] **Task 3: Setup ERD/PFD assets profiles**
  Move ERD and PFD shapes/dimensions into `profile.json` files in their respective folders.

- [x] **Task 4: Build dynamic domains registry**
  Create `scripts/domains/registry.js` to scan directories, parse profile files, and load correctors.

- [x] **Task 5: Refactor layout engine core & correctors**
  Extract corrector logic out of `diagram-builder.js` into `corrector.js` for AWS, GCP, ERD, and PFD. Hook them into the core lifecycle.

- [x] **Task 6: Verification**
  Run the plugin E2E test suite to ensure zero regressions across all 47 tests.
