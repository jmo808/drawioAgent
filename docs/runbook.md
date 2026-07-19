# Operational Recovery Runbook

## Business Continuity Objectives
* **Recovery Time Objective (RTO):** 1 Hour (Maximum allowed time to restore services after a critical outage).
* **Recovery Point Objective (RPO):** 24 Hours (Maximum age of data that can be lost in the event of an outage).

## Data Backup and Replication Procedures
1. **Valkey Session State:**
   - Saved dynamically using RDB snapshots (refreshed at regular intervals).
   - Data stored in Valkey is transient session data, allowing for fast, low-overhead restores.
2. **Kubernetes Configurations:**
   - GitOps repository serves as the primary backup. All deployment states, ingress, and configmaps are tracked in source control.

## Disaster Recovery Execution steps
1. Check Kubernetes cluster status and namespace:
   ```bash
   kubectl get namespaces | grep drawio-agent
   ```
2. Redeploy the latest stable release via Helm:
   ```bash
   helm upgrade --install drawio-agent ./chart/drawio-agent --namespace drawio-agent
   ```
3. Verify all pods are running and ready within 5 minutes:
   ```bash
   kubectl get pods -n drawio-agent -w
   ```
