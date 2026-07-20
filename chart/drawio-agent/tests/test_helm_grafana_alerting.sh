#!/bin/bash
set -e

CHART_DIR="$(dirname "$0")/.."
echo "Testing Helm chart rendering for Grafana & Alerting..."

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

# 1. Test Grafana dashboards enabled (default when metrics.enabled=true)
echo "Testing Grafana dashboards enabled..."
OUTPUT_DASHBOARDS=$(helm template drawio-agent "$CHART_DIR" --set metrics.enabled=true --set grafana.dashboards.enabled=true)

assert_contains "$OUTPUT_DASHBOARDS" "kind: ConfigMap" "Grafana dashboard ConfigMaps missing"
assert_contains "$OUTPUT_DASHBOARDS" "grafana_dashboard: \"1\"" "ConfigMaps missing 'grafana_dashboard: \"1\"' sidecar label"
assert_contains "$OUTPUT_DASHBOARDS" "api-health.json" "api-health.json entry missing in ConfigMap"
assert_contains "$OUTPUT_DASHBOARDS" "agent-performance.json" "agent-performance.json entry missing in ConfigMap"
assert_contains "$OUTPUT_DASHBOARDS" "system-overview.json" "system-overview.json entry missing in ConfigMap"
assert_contains "$OUTPUT_DASHBOARDS" "llm_circuit_state" "Prometheus expression 'llm_circuit_state' not found in agent dashboard JSON"

# 2. Test Grafana dashboards disabled
echo "Testing Grafana dashboards disabled..."
OUTPUT_DASHBOARDS_DISABLED=$(helm template drawio-agent "$CHART_DIR" --set metrics.enabled=true --set grafana.dashboards.enabled=false)
assert_not_contains "$OUTPUT_DASHBOARDS_DISABLED" "grafana_dashboard: \"1\"" "Grafana dashboard sidecar labels found when dashboards disabled"

# 3. Test Alerting enabled
echo "Testing PrometheusRule alerting rules enabled..."
OUTPUT_ALERTING=$(helm template drawio-agent "$CHART_DIR" --set alerting.enabled=true)

assert_contains "$OUTPUT_ALERTING" "kind: PrometheusRule" "PrometheusRule CRD missing when alerting enabled"
assert_contains "$OUTPUT_ALERTING" "alert: DrawIOAgentDown" "DrawIOAgentDown alert rule missing"
assert_contains "$OUTPUT_ALERTING" "alert: HighLLMErrorRate" "HighLLMErrorRate alert rule missing"
assert_contains "$OUTPUT_ALERTING" "alert: LLMCircuitOpen" "LLMCircuitOpen alert rule missing"
assert_contains "$OUTPUT_ALERTING" "alert: HighAPILatency" "HighAPILatency alert rule missing"
assert_contains "$OUTPUT_ALERTING" "alert: WebSocketConnectionsDrop" "WebSocketConnectionsDrop alert rule missing"
assert_contains "$OUTPUT_ALERTING" "alert: HighMemoryUsage" "HighMemoryUsage alert rule missing"

# Check expressions
assert_contains "$OUTPUT_ALERTING" "up{job=\"drawio-agent-agent\"} == 0" "DrawIOAgentDown expression incorrect"
assert_contains "$OUTPUT_ALERTING" "llm_circuit_state > 0" "LLMCircuitOpen expression incorrect"

# 4. Test Alerting disabled (default)
echo "Testing PrometheusRule alerting rules disabled by default..."
OUTPUT_ALERTING_DEFAULT=$(helm template drawio-agent "$CHART_DIR")
assert_not_contains "$OUTPUT_ALERTING_DEFAULT" "kind: PrometheusRule" "PrometheusRule CRD found when disabled by default"

echo "All Helm Grafana & Alerting tests passed!"
