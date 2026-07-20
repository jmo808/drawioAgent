#!/bin/bash
set -e

CHART_DIR="$(dirname "$0")/.."
echo "Testing Helm chart rendering for OpenTelemetry Tracing..."

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

# 1. Test Tracing disabled by default
echo "Testing Tracing disabled by default..."
OUTPUT_DEFAULT=$(helm template drawio-agent "$CHART_DIR")
assert_not_contains "$OUTPUT_DEFAULT" "OTEL_EXPORTER_OTLP_ENDPOINT" "OTel env vars found when disabled by default"

# 2. Test Tracing enabled
echo "Testing Tracing enabled..."
OUTPUT_ENABLED=$(helm template drawio-agent "$CHART_DIR" --set tracing.enabled=true --set tracing.otlpEndpoint="http://tempo-test:4318")

assert_contains "$OUTPUT_ENABLED" "name: OTEL_EXPORTER_OTLP_ENDPOINT" "OTEL_EXPORTER_OTLP_ENDPOINT env var missing"
assert_contains "$OUTPUT_ENABLED" "value: \"http://tempo-test:4318\"" "OTEL_EXPORTER_OTLP_ENDPOINT endpoint value incorrect"
assert_contains "$OUTPUT_ENABLED" "value: \"drawio-agent-api\"" "OTEL_SERVICE_NAME for api incorrect"
assert_contains "$OUTPUT_ENABLED" "value: \"drawio-agent-agent\"" "OTEL_SERVICE_NAME for agent incorrect"

echo "All Helm tracing tests passed!"
