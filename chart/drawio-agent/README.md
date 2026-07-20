# Draw.io Agent Helm Chart

Deploy a self-hosted diagramming suite with AI-powered conversational assistance onto a Kubernetes cluster.

This chart bootstraps:
*   **Draw.io Frontend:** Tomcat-based open-source Draw.io editor preloaded with the Antigravity sidebar plugin.
*   **Fastify API Gateway:** Secure WebSocket proxy and endpoint hub.
*   **Python AI Agent:** LiteLLM-integrated backend executing prompt compilation and rendering via the Draw.io MCP layout server.
*   **Gateway API Resources:** Gateway API `Gateway` and `HTTPRoute` definitions for modern traffic routing.

---

## 📋 Prerequisites

*   Kubernetes cluster v1.24+
*   Helm v3.0.0+
*   **Gateway API CRDs** and an implementation controller (e.g., **Cilium** with Gateway API enabled or Contour).
    *   *Note:* Ensure a `GatewayClass` (defaulting to `cilium`) is available on your cluster before installing this chart with Gateway routing enabled.

---

## 🚀 Installation & Deployment

### 1. Basic Installation
Install the chart into a dedicated namespace (`drawio-agent`):
```bash
# Create namespace
kubectl create namespace drawio-agent

# Install chart
helm install drawio-agent ./chart/drawio-agent \
  --namespace drawio-agent \
  --set global.apiKey="my-secret-agent-api-key"
```

### 2. Upgrading or Configuring LLM Provider
To configure the agent to run with a cloud LLM provider like Gemini:
```bash
helm upgrade drawio-agent ./chart/drawio-agent \
  --namespace drawio-agent \
  --set agent.llm.provider="gemini" \
  --set agent.llm.model="gemini/gemini-2.5-pro" \
  --set agent.llm.apiKey="AIzaSyYourGeminiApiKey"
```

---

## 🛠️ Configuration Values (`values.yaml`)

| Parameter | Description | Type | Default |
| :--- | :--- | :--- | :--- |
| **Global Settings** | | | |
| `global.apiKey` | Shared secret API token for frontend/API authentication. | String | `test-api-key` |
| **Frontend settings** | | | |
| `frontend.replicaCount` | Number of Draw.io frontend Tomcat replicas. | Integer | `1` |
| `frontend.image.repository` | Docker image registry path for the frontend editor. | String | `ghcr.io/jmo808/drawio-frontend` |
| `frontend.image.tag` | Overrides the Tomcat/plugin image tag (defaults to `Chart.appVersion`). | String | `""` |
| `frontend.resources` | Compute limits and requests for frontend. | Object | `limits: 500m/512Mi, requests: 100m/256Mi` |
| **API Gateway settings** | | | |
| `api.replicaCount` | Number of Fastify API server replicas. | Integer | `1` |
| `api.image.repository` | Docker image path for API Gateway. | String | `ghcr.io/jmo808/drawio-api` |
| `api.resources` | Compute limits and requests for API Gateway. | Object | `limits: 500m/512Mi, requests: 100m/256Mi` |
| **AI Agent settings** | | | |
| `agent.replicaCount` | Number of Python Agent replicas. | Integer | `1` |
| `agent.image.repository` | Docker image path for Agent Service. | String | `ghcr.io/jmo808/drawio-agent` |
| `agent.resources` | Compute limits and requests for Agent Service. | Object | `limits: 1000m/1Gi, requests: 250m/512Mi` |
| `agent.llm.provider` | Provider engine key (e.g. `ollama`, `openai`, `gemini`). | String | `ollama` |
| `agent.llm.model` | Model name formatted for LiteLLM. | String | `llama3` |
| `agent.llm.apiKey` | Optional API token for external LLM hosts. | String | `""` |
| **Gateway Routing** | | | |
| `gateway.enabled` | Whether to create K8s Gateway API `Gateway` resource. | Boolean | `true` |
| `gateway.name` | Name of the Gateway API `Gateway`. | String | `drawio-gateway` |
| `gateway.gatewayClassName`| Cluster GatewayClass. | String | `cilium` |
| `httproute.hostnames` | Matching domain names for client traffic routing. | Array | `[]` (Wildcard route match) |
| **Collaboration** | | | |
| `collaboration.enabled` | Enable real-time multi-user collaboration sessions. | Boolean | `false` |
| `collaboration.valkey.enabled` | Deploy internal Valkey instance (set false to use external Valkey). | Boolean | `true` |
| `collaboration.valkey.host` | Hostname of the external Valkey server (if enabled=false). | String | `valkey-external` |
| `collaboration.valkey.port` | Port of the external Valkey server (if enabled=false). | Integer | `6379` |
| `collaboration.valkey.password` | Plain text password for the external Valkey server. | String | `""` |
| `collaboration.valkey.existingSecret` | Name of an existing K8s Secret containing Valkey password. | String | `""` |
| `collaboration.valkey.existingSecretKey` | Key within the existing secret containing the password. | String | `password` |
| `collaboration.persistence.enabled` | Enable persistence/snapshots for Valkey data. | Boolean | `true` |
| `collaboration.persistence.saveIntervals` | Valkey snapshot interval rules (`save <sec> <changes>`). | String | `"900 1 300 10"` |
| `collaboration.persistence.size` | PVC size for the internal Valkey storage volume. | String | `"1Gi"` |
| `collaboration.persistence.storageClass` | Custom StorageClass name for Valkey data volume. | String | `""` (default Class) |
| `collaboration.persistence.accessMode` | Persistent Volume Access Mode. | String | `ReadWriteOnce` |
| **Observability & Hardening** | | | |
| `metrics.enabled` | Enable Prometheus metric scraping endpoints on API/Agent pods. | Boolean | `true` |
| `metrics.serviceMonitor.enabled` | Deploy Prometheus Operator `ServiceMonitor` resource. | Boolean | `true` |
| `alerting.enabled` | Deploy Prometheus Operator `PrometheusRule` alerting rules. | Boolean | `false` |
| `grafana.dashboards.enabled` | Export operational Grafana dashboards as labeled ConfigMaps. | Boolean | `false` |
| `tracing.enabled` | Enable OpenTelemetry tracing context propagation. | Boolean | `false` |
| `tracing.otlpEndpoint` | Target OTLP trace collector/tempo HTTP endpoint. | String | `http://tempo.monitoring.svc:4318` |
| `networkPolicy.enabled` | Deploy NetworkPolicies restricting communications. | Boolean | `false` |
| `pdb.enabled` | Deploy PodDisruptionBudgets for high availability. | Boolean | `false` |
| `agent.hpa.enabled` | Deploy HorizontalPodAutoscaler for the Agent service. | Boolean | `false` |

---

## 🛜 Gateway API & Traffic Routing

By default, the chart establishes routing via the **Gateway API**.

If you'd like to assign dedicated external domain hostnames to match your HTTPRoute rules:
```yaml
gateway:
  enabled: true
  gatewayClassName: "cilium"

httproute:
  hostnames:
    - "drawio.internal.company.com"
```

To deploy with Gateway API disabled (e.g. if you prefer standard Ingress controllers or NodePorts):
```bash
helm install drawio-agent ./chart/drawio-agent \
  --set gateway.enabled=false
```

---

## 🔐 Security & Encryption (TLS/mTLS)

### 1. Ingress TLS (HTTPS/WSS)
To secure client traffic into the cluster (enforcing HTTPS and WSS connections), configure the Gateway with TLS termination:
```yaml
gateway:
  enabled: true
  tls:
    enabled: true
    secretName: "drawio-gateway-tls" # Secret containing tls.crt and tls.key
```
Once TLS is enabled, client-side WebSocket connections must use the secure protocol (`wss://`).

### 2. Valkey (State Store) TLS
To encrypt session state and collaboration cache traffic to Valkey, enable Valkey TLS:
```yaml
collaboration:
  enabled: true
  tls:
    enabled: true
    secretName: "valkey-tls-certs" # Contains ca.crt, valkey.crt, valkey.key
```

### 3. API-to-Agent mTLS
For zero-trust environments requiring mutual authentication between the API Gateway and the Agent, deploy with mTLS configurations:
```yaml
# 1. API gateway client cert credentials
api:
  tls:
    enabled: true
    clientCertSecret: "api-client-tls" # Contains client cert & private key

# 2. Agent server credentials and client authentication config
agent:
  tls:
    enabled: true
    serverCertSecret: "agent-server-tls" # Contains agent server cert & private key
    clientCASecret: "agent-client-ca"    # Contains CA certificate used to verify the API Gateway client cert
```

---

## 🧼 Uninstalling
To cleanly remove all chart components and release resources:
```bash
helm uninstall drawio-agent --namespace drawio-agent
```
