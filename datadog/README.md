# Datadog Observability Configuration

Pre-built dashboards, monitors, and SLOs for enterprise-grade LLM observability.

## 📁 Files

| File | Description |
|------|-------------|
| `dashboard.json` | Executive dashboard with real-time LLM metrics |
| `monitors.json` | 6 pre-configured alerting monitors |
| `slos.json` | Service Level Objectives for reliability |
| `deploy_datadog.py` | Automated deployment script |

## 🚀 Quick Deploy

```bash
# Set credentials
export DD_API_KEY=your_api_key
export DD_APP_KEY=your_app_key  # Create at: Organization Settings > Application Keys

# Install dependency
pip install datadog-api-client

# Deploy everything
python datadog/deploy_datadog.py
```

## 📊 Dashboard Widgets

| Widget | Purpose |
|--------|---------|
| Request Volume | Total LLM API calls |
| Success Rate | % of non-error responses |
| p95 Latency | 95th percentile response time |
| Error Rate | % of failed requests |
| Token Usage | Input/output token trends |
| Cost Analytics | Spend tracking and budgeting |
| SAFE Mode | Security guardrail metrics |
| Service Map | Distributed tracing visualization |

## 🔔 Monitors

| Monitor | Threshold | Severity |
|---------|-----------|----------|
| High Latency | p95 > 5s | Critical |
| Error Rate | > 5% | High |
| Cost Anomaly | > $1/hour | Warning |
| Service Down | 0 requests/10min | Critical |
| SAFE Mode Spikes | > 10 refusals/15min | Medium |
| Token Anomaly | ML-detected | Low |

## 🎯 SLOs

| SLO | Target | Timeframe |
|-----|--------|-----------|
| Availability | 99.9% | 90 days |
| Latency (p95 < 5s) | 95% | 30 days |
| Cost Efficiency | 99% | 30 days |

## 🔧 Manual Import

If you prefer manual import:

1. **Dashboard**: Dashboards → New Dashboard → Import from JSON
2. **Monitors**: Monitors → New Monitor → Import from JSON
3. **SLOs**: Service Management → SLOs → New SLO → Import

## 📈 Metrics Reference

All metrics are prefixed with `llm.`:

```
llm.chat.request      # Total requests (counter)
llm.chat.ok           # Successful requests (counter)
llm.chat.error        # Failed requests (counter)
llm.chat.refusal      # SAFE mode blocks (counter)
llm.chat.latency_ms   # Response time (histogram)
llm.tokens.prompt     # Input tokens (gauge)
llm.tokens.completion # Output tokens (gauge)
llm.tokens.total      # Total tokens (gauge)
llm.cost.total_usd    # Cost in micro-dollars (gauge)
```

## 🏷️ Tags

All metrics include these tags:
- `service:llm-observability-copilot`
- `env:dev|staging|prod`
- `model:gemini-2.5-pro`
- `safe_mode:true|false`

