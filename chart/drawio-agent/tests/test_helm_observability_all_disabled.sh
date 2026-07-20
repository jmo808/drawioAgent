#!/bin/bash
set -e

CHART_DIR="$(dirname "$0")/.."
echo "Testing Helm chart rendering with all observability & hardening settings disabled..."

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

# Run helm template with metrics, alerting, dashboards, tracing, networkPolicy, PDB, HPA disabled
OUTPUT=$(helm template drawio-agent "$CHART_DIR" \
  --set metrics.enabled=false \
  --set metrics.serviceMonitor.enabled=false \
  --set alerting.enabled=false \
  --set grafana.dashboards.enabled=false \
  --set tracing.enabled=false \
  --set networkPolicy.enabled=false \
  --set pdb.enabled=false \
  --set agent.hpa.enabled=false)

# Assertions: No ServiceMonitor
assert_not_contains "$OUTPUT" "kind: ServiceMonitor" "ServiceMonitor generated when metrics.serviceMonitor.enabled=false"

# Assertions: No PrometheusRule
assert_not_contains "$OUTPUT" "kind: PrometheusRule" "PrometheusRule generated when alerting.enabled=false"

# Assertions: No HPA
assert_not_contains "$OUTPUT" "kind: HorizontalPodAutoscaler" "HPA generated when agent.hpa.enabled=false"

# Assertions: No NetworkPolicy
assert_not_contains "$OUTPUT" "kind: NetworkPolicy" "NetworkPolicy generated when networkPolicy.enabled=false"

# Assertions: No PDB
assert_not_contains "$OUTPUT" "kind: PodDisruptionBudget" "PDB generated when pdb.enabled=false"

# Assertions: No Grafana Dashboard ConfigMaps
assert_not_contains "$OUTPUT" "grafana_dashboard: \"1\"" "Grafana dashboards generated when grafana.dashboards.enabled=false"

echo "All Helm observability disabled validation tests passed!"
