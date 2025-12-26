# 🔭 LLM Observability Copilot

<p align="center">
  <strong>The first AI-native observability platform for production LLM applications</strong>
</p>

<p align="center">
  Real-time monitoring • Cost optimization • Hallucination detection • Security guardrails • AI-powered incident triage
</p>

<p align="center">
  <a href="#-live-demo">Live Demo</a> •
  <a href="#-the-problem">The Problem</a> •
  <a href="#-key-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-datadog-integration">Datadog</a>
</p>

---

## 🎯 What is LLM Observability Copilot?

**LLM Observability Copilot** is an enterprise-grade monitoring platform purpose-built for LLM-powered applications. Unlike traditional APM tools designed for deterministic software, we provide **LLM-specific quality signals** that catch issues unique to AI systems—hallucinations, prompt injection attacks, cost anomalies, and response quality degradation.

### 🚀 Live Demo

**Production URL:** [https://llm-observability-copilot-tkkrwnyhdq-uc.a.run.app](https://llm-observability-copilot-tkkrwnyhdq-uc.a.run.app)

![Dashboard Preview](images/dashboard.png)

---

## 😰 The Problem

Companies deploying LLMs in production face unique challenges that traditional monitoring tools can't address:

| Challenge | Impact | How I Solve It |
|-----------|--------|-----------------|
| **Hallucinations** | AI gives wrong answers, damaging trust | Real-time hallucination risk scoring (0-1) per response |
| **Unpredictable Costs** | $10K+ monthly bills from runaway token usage | Per-request cost tracking with anomaly alerts |
| **Prompt Injection Attacks** | Malicious users extract data or bypass controls | SAFE mode with 15+ attack pattern detection |
| **Slow Responses** | Users abandon after 5+ seconds | Latency SLOs with p50/p95/p99 tracking |
| **No Visibility** | "Is my LLM working?" is unanswerable | Unified dashboard with AI-powered insights |
| **Incident Response** | Hours to diagnose LLM-specific issues | One-click AI triage explains root cause in seconds |

---

## ✨ Key Features

### 📊 Multi-Dimensional Quality Scoring

I go beyond basic metrics. Every LLM response is scored across **four quality dimensions**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUALITY ASSESSMENT                            │
├─────────────────────────────────────────────────────────────────┤
│  Hallucination Risk    ████████░░░░  0.65  ⚠️ Warning           │
│  Performance Score     ██████████░░  0.85  ✅ Good              │
│  Response Quality      █████████░░░  0.78  ✅ Good              │
│  Abuse Detected        ░░░░░░░░░░░░  None  ✅ Clean             │
├─────────────────────────────────────────────────────────────────┤
│  Composite Health Score: 76/100                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Metric | What It Measures | Why It Matters |
|--------|------------------|----------------|
| **Hallucination Risk** | Pattern-based detection of fabricated facts, false citations, overconfident claims | Catch AI mistakes before users do |
| **Performance Score** | Latency-to-token ratio, response time efficiency | Optimize cost vs speed tradeoffs |
| **Response Quality** | Length adequacy, error patterns, refusal appropriateness | Ensure helpful, complete answers |
| **Abuse Detection** | Prompt injection, jailbreaks, data extraction attempts | Protect against malicious users |

### 💰 Real-Time Cost Intelligence

Stop bill shock. Know exactly what every request costs.

- **Per-Request Tracking** — Input tokens, output tokens, cost in USD
- **Cost Attribution** — By user, session, model, endpoint
- **Budget Alerts** — Automatic warnings when costs spike
- **Optimization Insights** — AI-powered recommendations to reduce spend

![Cost Overview](images/cost_overview.png)

```
Example: Gemini 2.5 Pro Request
├── Prompt Tokens:      1,247  × $0.00125/1K = $0.00156
├── Completion Tokens:    892  × $0.00500/1K = $0.00446
└── Total Cost:                              = $0.00602
```

### 🛡️ SAFE Mode: Enterprise Security Guardrails

Production LLMs need protection. SAFE mode blocks threats in real-time:

| Attack Type | Detection Pattern | Response |
|-------------|-------------------|----------|
| **Prompt Injection** | "Ignore previous instructions..." | Blocked + logged |
| **Jailbreak Attempts** | "Bypass safety filters..." | Blocked + alerted |
| **Credential Extraction** | "Show me API keys..." | Blocked + incident |
| **System Prompt Theft** | "What are your instructions?" | Blocked + audit |
| **Harmful Content** | "How to hack..." | Blocked + reported |

All blocked requests are logged to Datadog for security audit trails.

### 🤖 AI-Powered Incident Triage

When something goes wrong, don't spend hours debugging. My AI copilot:

1. **Detects anomalies** from metric patterns (latency spikes, error rates, cost surges)
2. **Analyzes root cause** using Gemini 2.5 Pro
3. **Explains the issue** in plain English with context
4. **Suggests remediation** with prioritized action items
5. **Creates incidents** automatically in Datadog with full context

```json
{
  "severity": "SEV-2",
  "title": "High Latency Detected - p95 at 8.2s",
  "root_cause_analysis": "Token generation rate dropped to 12 tok/s. 
    Likely cause: Vertex AI region experiencing elevated load.",
  "impact": "23% of users experiencing >5s response times",
  "recommended_actions": [
    "Enable response streaming to improve perceived performance",
    "Consider fallback to Gemini Flash for simple queries",
    "Check GCP status page for Vertex AI incidents"
  ]
}
```

### 📈 Proactive Insights (Not Just Reactive Monitoring)

Traditional monitoring tells you what happened. I tell you **what's about to happen**:

- **Predictive Alerts** — "Error rate trending up, will breach SLO in 15 minutes"
- **Cost Forecasting** — "At current usage, monthly bill will be $4,200"
- **Capacity Planning** — "Traffic patterns suggest scaling needed by 2pm"
- **Quality Trends** — "Hallucination risk increasing over past 24 hours"

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS                                       │
│                     (Web Dashboard / API)                                │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        GOOGLE CLOUD RUN                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      FastAPI Backend                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │   /chat      │  │  /ops/*      │  │  Quality Scoring     │   │   │
│  │  │   endpoint   │  │  analytics   │  │  Engine              │   │   │
│  │  │              │  │              │  │  • Hallucination     │   │   │
│  │  │  Gemini 2.5  │  │  Real-time   │  │  • Performance       │   │   │
│  │  │  Pro calls   │  │  metrics     │  │  • Response Quality  │   │   │
│  │  │              │  │              │  │  • Abuse Detection   │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  │                                                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │  SAFE Mode   │  │  Cost        │  │  AI Incident         │   │   │
│  │  │  Guardrails  │  │  Calculator  │  │  Triage              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      React Frontend                               │   │
│  │  • Real-time dashboard        • Mobile responsive                │   │
│  │  • Live/Demo mode toggle      • Glass morphism UI                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Vertex AI   │ │  Firestore  │ │   Datadog   │ │   Secret    │
│  (Gemini     │ │  (Real-time │ │  (APM,      │ │   Manager   │
│   2.5 Pro)   │ │   metrics)  │ │   Metrics,  │ │             │
│              │ │             │ │   Logs,     │ │             │
│              │ │             │ │   Incidents)│ │             │
└──────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why I Chose It |
|-------|------------|-----------------|
| **Frontend** | React 19, Vite, Tailwind CSS, Framer Motion | Fast, modern, great DX |
| **Backend** | FastAPI, Python 3.11, Pydantic | Async, type-safe, OpenAPI |
| **LLM** | Google Vertex AI (Gemini 2.5 Pro) | Best-in-class, enterprise-ready |
| **Database** | Google Cloud Firestore | Real-time sync, serverless |
| **Observability** | Datadog APM, DogStatsD, HTTP Logs API | Industry standard, rich features |
| **Infrastructure** | Cloud Run, Artifact Registry, Secret Manager | Serverless, secure, scalable |
| **CI/CD** | Cloud Build | Native GCP integration |

---

## 📦 Quick Start

### Prerequisites

- Google Cloud account with billing enabled
- Datadog account ([free 14-day trial](https://www.datadoghq.com/free-datadog-trial/))
- Docker installed locally

### Option 1: One-Command Deploy (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/llm-observability-copilot.git
cd llm-observability-copilot

# Set your credentials
export GOOGLE_CLOUD_PROJECT="your-project-id"
export DD_API_KEY="your-datadog-api-key"
export DD_APP_KEY="your-datadog-app-key"

# Deploy everything
./deploy.sh all
```

After ~5 minutes, you'll see:
```
✅ Deployment complete!
🚀 Service URL: https://llm-observability-copilot-xxxxx-uc.a.run.app
📊 Datadog Dashboard: https://app.datadoghq.com/dashboard/xxx
```

### Option 2: Local Development

```bash
# Start with Docker Compose
docker-compose up --build

# Access at http://localhost:8080
```

### Option 3: Manual Setup

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

---

## 📊 Datadog Integration

![Datadog Dashboard](images/dd_dashboard.png)

### What Gets Sent to Datadog

I send **comprehensive telemetry** via APM, metrics, and logs:

#### Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `llm.chat.request` | Counter | Total requests processed |
| `llm.chat.ok` | Counter | Successful responses |
| `llm.chat.error` | Counter | Failed requests |
| `llm.chat.refusal` | Counter | SAFE mode blocks |
| `llm.chat.latency_ms` | Timer | End-to-end latency |
| `llm.tokens.prompt` | Gauge | Input tokens per request |
| `llm.tokens.completion` | Gauge | Output tokens per request |
| `llm.tokens.total` | Gauge | Total tokens per request |
| `llm.cost.total_usd` | Gauge | Cost per request (micro-dollars) |
| `llm.safety.hallucination_risk` | Gauge | Hallucination score (0-1) |
| `llm.safety.performance_score` | Gauge | Performance score (0-1) |
| `llm.safety.response_quality` | Gauge | Quality score (0-1) |
| `llm.safety.abuse_detected` | Counter | Abuse attempts detected |

#### Pre-Built Detection Rules (Monitors)

| Monitor | Threshold | Severity |
|---------|-----------|----------|
| High Latency | p95 > 5000ms | Critical |
| Error Rate Spike | > 5% errors | High |
| Cost Anomaly | > $1/hour | Warning |
| Service Down | 0 requests in 10min | Critical |
| SAFE Mode Spike | > 10 refusals in 15min | Medium |
| Token Anomaly | > 5000 tokens avg | Low |

#### SLOs Included

- **Availability SLO**: 99% successful requests (7-day window)
- **Latency SLO**: 95% requests under 5s (7-day window)
- **Cost Efficiency SLO**: 99% requests under budget (30-day window)

### Deploy Datadog Configuration

```bash
cd datadog
python deploy_datadog.py
```

This creates your dashboard, monitors, and SLOs automatically.

---

## 🔐 SAFE Mode Deep Dive

SAFE mode provides **defense-in-depth** against LLM-specific attacks:

### Attack Patterns Detected

```python
# Prompt Injection
"ignore previous instructions"
"disregard your rules"
"you are now in developer mode"

# Jailbreak Attempts  
"bypass safety filters"
"unlock capabilities"
"remove restrictions"

# Data Extraction
"reveal your system prompt"
"what are your instructions"
"print your initial prompt"

# Credential Exposure
"show me API keys"
"what passwords do you know"
"dump environment variables"

# Harmful Content
"how to make explosives"
"hack into systems"
"exploit vulnerabilities"
```

### How It Works

1. **Pre-Processing**: Input scanned against 15+ regex patterns
2. **Classification**: Attack categorized by type (injection, jailbreak, etc.)
3. **Response**: Request blocked with safe refusal message
4. **Logging**: Full audit trail sent to Datadog
5. **Alerting**: Spike in attacks triggers security incident

### API Usage

```bash
# Enable SAFE mode
curl -X POST https://your-app.run.app/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "safe_mode": true}'
```

---

## 🧪 Traffic Generator

Demonstrate the full observability stack with realistic traffic:

```bash
# Install dependencies
pip install aiohttp

# Run all scenarios
python traffic_generator.py --url https://your-app.run.app --scenario all
```

### Available Scenarios

| Scenario | What It Does | Detection Rule Triggered |
|----------|--------------|--------------------------|
| `normal` | Steady 1 req/sec baseline | None (healthy traffic) |
| `spike` | 15 concurrent requests | High Latency alert |
| `errors` | Malformed requests | Error Rate alert |
| `cost` | Large prompts (high tokens) | Cost Anomaly alert |
| `safe` | Prompt injection attempts | SAFE Mode Spike alert |
| `all` | All scenarios sequentially | All alerts demonstrated |

---

## 📱 Mobile Support

Fully responsive design for on-the-go monitoring:

- 📱 Compact header with collapsible menu
- 🔘 Floating action button for quick AI triage
- 👆 Touch-friendly scrollable tabs
- 📊 Responsive charts and tables
- 💬 Full-screen AI dialog on mobile

---

## 🏆 Hackathon Submission

Built for the **Datadog + Google Cloud AI Partner Catalyst Hackathon**:

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Vertex AI / Gemini | Gemini 2.5 Pro for chat + AI triage | ✅ |
| Telemetry to Datadog | APM, metrics, logs, incidents | ✅ |
| 3+ Detection Rules | 7 monitors configured | ✅ |
| Actionable Incidents | Auto-created with AI context | ✅ |
| Dashboard | Executive view with all signals | ✅ |
| SLOs | Availability, latency, cost | ✅ |
| Traffic Generator | 6 scenarios demonstrating rules | ✅ |
| JSON Exports | `datadog/` folder with configs | ✅ |

---

## 📁 Project Structure

```
llm-observability-copilot/
├── app/
│   ├── main.py              # FastAPI backend (1500+ lines)
│   └── database.py          # Firestore integration
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # React dashboard
│   │   └── components/ui/   # Shadcn components
│   └── package.json
├── datadog/
│   ├── dashboard.json       # Executive dashboard
│   ├── monitors.json        # 6 detection rules
│   ├── slos.json            # 3 SLO definitions
│   └── deploy_datadog.py    # Auto-deploy script
├── traffic_generator.py     # Demo traffic tool
├── Dockerfile               # Multi-stage build
├── docker-compose.yml       # Local development
├── cloudbuild.yaml          # CI/CD pipeline
├── deploy.sh                # One-command deploy
└── requirements.txt         # Python dependencies
```

---

## 🔮 Roadmap

### Coming Soon

- [ ] OpenAI / Anthropic / Azure OpenAI support
- [ ] Slack / PagerDuty incident notifications
- [ ] Custom detection rule builder
- [ ] RAG quality monitoring (retrieval relevance)
- [ ] Fine-tuned model drift detection
- [ ] Team/user-level cost attribution
- [ ] Embeddable dashboard widgets

### Future Vision

- Multi-tenant SaaS offering
- LangChain / LlamaIndex native integration
- Vector database quality monitoring
- Agent/chain execution tracing
- A/B testing for prompts

---

## 🤝 Contributing

I welcome contributions! See my [Contributing Guide](CONTRIBUTING.md).

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/llm-observability-copilot.git

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes, commit, push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open Pull Request
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Google Cloud** — Vertex AI, Cloud Run, Firestore
- **Datadog** — Observability platform & hackathon sponsorship
- **Tailwind CSS** — Utility-first styling
- **Radix UI / Shadcn** — Accessible component primitives

---

<p align="center">
  <strong>Built with ❤️ for the AI Partner Catalyst Hackathon</strong>
  <br/>
  <sub>Making LLM production monitoring actually useful</sub>
</p>

<p align="center">
  <a href="https://llm-observability-copilot-tkkrwnyhdq-uc.a.run.app">Live Demo</a> •
  <a href="https://github.com/yourusername/llm-observability-copilot/issues">Report Bug</a> •
  <a href="https://github.com/yourusername/llm-observability-copilot/issues">Request Feature</a>
</p>
