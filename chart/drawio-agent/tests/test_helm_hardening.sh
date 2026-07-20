#!/bin/bash
set -e

CHART_DIR="$(dirname "$0")/.."
echo "Testing Helm chart rendering for Kubernetes Hardening..."

# Helper function to assert a substring is present
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="$3"
    if ! echo "$haystack" | grep -q "$needle"; then
        echo "FAILED: $msg (expected: '$needle')"
        exit 1
    fi
}

# Helper function to assert a substring is absent
assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="$3"
    if echo "$haystack" | grep -q "$needle"; then
        echo "FAILED: $msg (unexpected: '$needle')"
        exit 1
    fi
}

# 1. Test resources limits & requests defaults (OB-14)
echo "Testing resources limits & requests defaults..."
OUTPUT_RESOURCES=$(helm template drawio-agent "$CHART_DIR" --set collaboration.enabled=true --set collaboration.valkey.enabled=true)

# Frontend resources
assert_contains "$OUTPUT_RESOURCES" "cpu: 200m" "Frontend CPU limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "memory: 256Mi" "Frontend Memory limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "cpu: 100m" "Frontend CPU request missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "memory: 128Mi" "Frontend Memory request missing/incorrect"

# API resources
assert_contains "$OUTPUT_RESOURCES" "cpu: 500m" "API CPU limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "memory: 512Mi" "API Memory limit missing/incorrect"

# Agent resources
assert_contains "$OUTPUT_RESOURCES" "cpu: 1000m" "Agent CPU limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "memory: 1Gi" "Agent Memory limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "cpu: 200m" "Agent CPU request missing/incorrect"

# Valkey resources (internal)
assert_contains "$OUTPUT_RESOURCES" "cpu: 200m" "Valkey CPU limit missing/incorrect"
assert_contains "$OUTPUT_RESOURCES" "memory: 256Mi" "Valkey Memory limit missing/incorrect"

# 2. Test resources overriding
echo "Testing resource overrides..."
OUTPUT_RESOURCES_OVERRIDE=$(helm template drawio-agent "$CHART_DIR" \
  --set frontend.resources.limits.cpu=99m \
  --set api.resources.limits.cpu=88m \
  --set agent.resources.limits.cpu=77m \
  --set collaboration.enabled=true \
  --set collaboration.valkey.enabled=true \
  --set collaboration.valkey.resources.limits.cpu=66m)

assert_contains "$OUTPUT_RESOURCES_OVERRIDE" "cpu: 99m" "Frontend CPU limit override failed"
assert_contains "$OUTPUT_RESOURCES_OVERRIDE" "cpu: 88m" "API CPU limit override failed"
assert_contains "$OUTPUT_RESOURCES_OVERRIDE" "cpu: 77m" "Agent CPU limit override failed"
assert_contains "$OUTPUT_RESOURCES_OVERRIDE" "cpu: 66m" "Valkey CPU limit override failed"

# 3. Test HPA (OB-9)
echo "Testing HPA enabled/disabled..."
# Disabled by default
OUTPUT_HPA_DEFAULT=$(helm template drawio-agent "$CHART_DIR")
assert_not_contains "$OUTPUT_HPA_DEFAULT" "kind: HorizontalPodAutoscaler" "HPA found when disabled by default"

# Enabled
OUTPUT_HPA_ENABLED=$(helm template drawio-agent "$CHART_DIR" --set hpa.agent.enabled=true --set hpa.agent.minReplicas=2 --set hpa.agent.maxReplicas=10 --set hpa.agent.targetCPU=80)
assert_contains "$OUTPUT_HPA_ENABLED" "kind: HorizontalPodAutoscaler" "HPA missing when enabled"
assert_contains "$OUTPUT_HPA_ENABLED" "minReplicas: 2" "HPA minReplicas incorrect"
assert_contains "$OUTPUT_HPA_ENABLED" "maxReplicas: 10" "HPA maxReplicas incorrect"
assert_contains "$OUTPUT_HPA_ENABLED" "averageUtilization: 80" "HPA targetCPU averageUtilization incorrect"

# 4. Test NetworkPolicies (OB-10)
echo "Testing NetworkPolicies enabled/disabled..."
# Enabled by default
OUTPUT_NP_DEFAULT=$(helm template drawio-agent "$CHART_DIR" --set collaboration.enabled=true --set collaboration.valkey.enabled=true)
assert_contains "$OUTPUT_NP_DEFAULT" "kind: NetworkPolicy" "NetworkPolicies missing when enabled by default"
assert_contains "$OUTPUT_NP_DEFAULT" "name: drawio-gateway" "NetworkPolicy Gateway integration missing"
assert_contains "$OUTPUT_NP_DEFAULT" "port: 8080" "Frontend Ingress port missing"
assert_contains "$OUTPUT_NP_DEFAULT" "port: 3000" "API Ingress port missing"
assert_contains "$OUTPUT_NP_DEFAULT" "port: 8000" "Agent Ingress port missing"
assert_contains "$OUTPUT_NP_DEFAULT" "port: 6379" "Valkey Ingress port missing"
assert_contains "$OUTPUT_NP_DEFAULT" "cidr: 0.0.0.0/0" "Agent HTTPS egress missing"

# Disabled
OUTPUT_NP_DISABLED=$(helm template drawio-agent "$CHART_DIR" --set networkPolicy.enabled=false)
assert_not_contains "$OUTPUT_NP_DISABLED" "kind: NetworkPolicy" "NetworkPolicy found when disabled"

# 5. Test PDB (OB-11)
echo "Testing PodDisruptionBudgets (PDB)..."
# Enabled by default, but replicaCount < 2 by default so no PDB should be rendered
OUTPUT_PDB_DEFAULT=$(helm template drawio-agent "$CHART_DIR")
assert_not_contains "$OUTPUT_PDB_DEFAULT" "kind: PodDisruptionBudget" "PDB found when replicaCount is less than 2"

# API replicaCount >= 2 -> PDB rendered
OUTPUT_PDB_API=$(helm template drawio-agent "$CHART_DIR" --set api.replicaCount=2)
assert_contains "$OUTPUT_PDB_API" "kind: PodDisruptionBudget" "PDB missing when API replicaCount is 2"
assert_contains "$OUTPUT_PDB_API" "name: drawio-agent-api" "PDB name incorrect/missing for API"

# PDB disabled explicitly
OUTPUT_PDB_DISABLED=$(helm template drawio-agent "$CHART_DIR" --set api.replicaCount=2 --set pdb.enabled=false)
assert_not_contains "$OUTPUT_PDB_DISABLED" "kind: PodDisruptionBudget" "PDB found when disabled explicitly"

echo "All Helm hardening tests passed!"
