#!/bin/bash
set -e

CHART_DIR="$(dirname "$0")/.."
echo "Testing Helm chart rendering for metrics..."

# 1. Test metrics enabled (default)
echo "Testing metrics enabled (default)..."
OUTPUT=$(helm template drawio-agent "$CHART_DIR")

# Check for annotations
SCRAPE_COUNT=$(echo "$OUTPUT" | grep -c "prometheus.io/scrape: \"true\"" || true)
if [ "$SCRAPE_COUNT" -ne 2 ]; then
    echo "FAILED: expected 2 prometheus.io/scrape annotations, found $SCRAPE_COUNT"
    exit 1
fi
echo "PASSED: Pod scrape annotations present"

# 2. Test metrics disabled
echo "Testing metrics disabled..."
OUTPUT_DISABLED=$(helm template drawio-agent "$CHART_DIR" --set metrics.enabled=false)

if echo "$OUTPUT_DISABLED" | grep -q "prometheus.io/scrape: \"true\""; then
    echo "FAILED: prometheus annotations found when metrics.enabled=false"
    exit 1
fi
echo "PASSED: Pod scrape annotations absent when disabled"

# 3. Test ServiceMonitor enabled
echo "Testing ServiceMonitor enabled..."
OUTPUT_SM=$(helm template drawio-agent "$CHART_DIR" --set metrics.serviceMonitor.enabled=true)

if ! echo "$OUTPUT_SM" | grep -q "kind: ServiceMonitor"; then
    echo "FAILED: ServiceMonitor CRD missing when enabled"
    exit 1
fi
if ! echo "$OUTPUT_SM" | grep -q "name: drawio-agent-api"; then
    echo "FAILED: ServiceMonitor for API missing"
    exit 1
fi
if ! echo "$OUTPUT_SM" | grep -q "name: drawio-agent-agent"; then
    echo "FAILED: ServiceMonitor for Agent missing"
    exit 1
fi
echo "PASSED: ServiceMonitor resources present"

# 4. Test ServiceMonitor disabled
echo "Testing ServiceMonitor disabled..."
OUTPUT_NO_SM=$(helm template drawio-agent "$CHART_DIR" --set metrics.serviceMonitor.enabled=false)

if echo "$OUTPUT_NO_SM" | grep -q "kind: ServiceMonitor"; then
    echo "FAILED: ServiceMonitor CRD found when disabled"
    exit 1
fi
echo "PASSED: ServiceMonitor resources absent when disabled"

echo "All Helm metrics tests passed!"
