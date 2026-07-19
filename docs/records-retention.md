# Records Retention Schedule

This document outlines the data retention policy for all data types managed by the Draw.io Drafting Agent suite.

| Data Classification | Record Type | Storage Medium | Retention Period | Disposal Method |
| :--- | :--- | :--- | :--- | :--- |
| **Security Audit Logs** | Authentication attempts, WebSocket logs, MCP tool calls, and rate-limit violations. | Persistent Cloud Storage / Ingestion SIEM | 365 Days | Automatic purge / permanent deletion |
| **Session Cache** | Transient diagram canvas state, collaboration locks, and active cursor positions. | Valkey (In-Memory Cache) | 7 Days (or immediately upon session closure) | Key expiration (`EXPIRE` command) |
| **LLM Response Logs** | User queries, prompts, and model responses (anonymized). | Relational Storage / Logs | 30 Days | Truncation / database purge |
| **Configuration State** | Deployment configurations, API secrets, OIDC connection settings. | Git / Kubernetes Secrets | Indefinite (Active lifecycle) | Manual deletion upon decommissioning |
