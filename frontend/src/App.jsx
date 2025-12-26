import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Clock,
  Cloud,
  DollarSign,
  ExternalLink,
  Flame,
  Gauge,
  LineChart,
  ListChecks,
  LogIn,
  Menu,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  SquareArrowOutUpRight,
  Terminal,
  Timer,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as ReLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * LLM Observability Copilot — Ops Console
 *
 * Features:
 * - Executive scorecards with real-time metrics
 * - Live requests table with Datadog trace links
 * - Incident triage with AI-powered analysis
 * - Model health monitoring
 * - Cost & risk analytics
 *
 * Backend (FastAPI):
 * - POST /chat -> { request_id, answer, safe_mode, tokens, cost }
 * - GET  /health
 * - (Optional) GET /ops/summary, /ops/requests, /ops/incidents
 */

// -----------------------------
// Small utilities
// -----------------------------
const cn = (...xs) => xs.filter(Boolean).join(" ");



function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtPct(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmtMoney(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(x);
}

function fmtCost(x, precision = 4) {
  if (x == null || Number.isNaN(x) || x === 0) return "—";
  // Consistent precision for all cost displays
  return `$${x.toFixed(precision)}`;
}

function fmtTokens(tokens) {
  if (!tokens) return "—";
  const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = tokens;
  return `${total_tokens.toLocaleString()} (${prompt_tokens}→${completion_tokens})`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function nowIso() {
  return new Date().toISOString();
}

function shortId(id) {
  if (!id) return "—";
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function latencyBadge(ms) {
  if (ms == null) return { label: "—", tone: "secondary" };
  if (ms < 1200) return { label: "Healthy", tone: "success" };
  if (ms < 3500) return { label: "Degraded", tone: "warning" };
  return { label: "High", tone: "destructive" };
}

function statusBadge(ok) {
  return ok
    ? { label: "OK", tone: "success" }
    : { label: "Error", tone: "destructive" };
}

function toneToBadgeClass(tone) {
  switch (tone) {
    case "success":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20";
    case "destructive":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20";
    default:
      return "bg-muted text-foreground/80";
  }
}

// -----------------------------
// API layer (safe fallbacks)
// -----------------------------
const DEFAULTS = {
  service: "llm-observability-copilot",
  env: (typeof window !== "undefined" && window.__DD_ENV__) || "dev",
  model: (typeof window !== "undefined" && window.__MODEL_NAME__) || "gemini-2.5-pro",
};

async function apiGet(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// Optional ops endpoints; if missing, we use client-side simulation.
async function tryGet(path) {
  try {
    return await apiGet(path);
  } catch {
    return null;
  }
}

// -----------------------------
// Demo data generator
// -----------------------------
function makeSeedSeries() {
  const pts = [];
  const start = Date.now() - 60 * 60 * 1000;
  for (let i = 0; i <= 60; i++) {
    const t = new Date(start + i * 60 * 1000);
    const jitter = (Math.sin(i / 6) + 1) * 0.5;
    const p95 = 1200 + jitter * 900 + (i > 46 ? (i - 46) * 90 : 0);
    const err = clamp(0.01 + (i > 50 ? (i - 50) * 0.006 : 0), 0.005, 0.12);
    const rps = 0.6 + jitter * 1.1;
    pts.push({
      t: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      p95,
      err,
      rps,
    });
  }
  return pts;
}

function mkReq(overrides = {}) {
  const id = crypto?.randomUUID?.() || Math.random().toString(16).slice(2);
  const ms = Math.round(600 + Math.random() * 4500);
  const ok = Math.random() > 0.12;
  const safe = Math.random() > 0.7;
  const promptTokens = Math.floor(50 + Math.random() * 200);
  const completionTokens = ok ? Math.floor(100 + Math.random() * 500) : 0;
  const totalTokens = promptTokens + completionTokens;
  // Demo cost estimate based on Gemini pricing
  const inputCost = (promptTokens / 1000) * 0.00125;
  const outputCost = (completionTokens / 1000) * 0.005;
  return {
    request_id: id,
    ts: new Date(Date.now() - Math.random() * 10 * 60 * 1000).toISOString(),
    route: "POST /chat",
    model: DEFAULTS.model,
    latency_ms: ms,
    ok,
    safe_mode: safe,
    trace_id: ok ? Math.floor(Math.random() * 1e12).toString() : null,
    span_id: ok ? Math.floor(Math.random() * 1e12).toString() : null,
    session_id: Math.random() > 0.5 ? "demo-session" : null,
    message_len: Math.floor(10 + Math.random() * 220),
    answer_len: ok ? Math.floor(80 + Math.random() * 600) : 0,
    error_type: ok ? null : "TimeoutError",
    // LLM Observability fields (demo data)
    tokens: ok ? {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    } : null,
    cost: ok ? {
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      total_cost_usd: inputCost + outputCost,
    } : null,
  };
}

function mkIncident(kind, severity = "high") {
  const id = crypto?.randomUUID?.() || Math.random().toString(16).slice(2);
  const base = {
    id,
    created_at: nowIso(),
    status: "open",
    service: DEFAULTS.service,
    env: DEFAULTS.env,
    severity,
  };
  if (kind === "latency") {
    return {
      ...base,
      title: "p95 latency breach",
      signal: "p95_latency_ms",
      threshold: 3500,
      current: 4920,
      description:
        "p95 latency exceeded threshold for 3 minutes. Impact: slower responses, possible timeouts.",
      suggested_action:
        "Check VertexAI/Gemini dependency spans; verify auth token latency; consider reducing max output tokens for hot path.",
    };
  }
  if (kind === "errors") {
    return {
      ...base,
      title: "Error rate spike",
      signal: "error_rate",
      threshold: 0.05,
      current: 0.093,
      description:
        "Error rate rose above 5%. Impact: failed chats and degraded UX.",
      suggested_action:
        "Inspect recent error traces; validate credentials; check network connectivity to Datadog and Vertex endpoints.",
    };
  }
  return {
    ...base,
    title: "Cost anomaly",
    signal: "cost_per_request_usd",
    threshold: 0.012,
    current: 0.028,
    description:
      "Estimated cost per request is elevated. Impact: budget burn and quota risk.",
    suggested_action:
      "Enable caching for repeated prompts; enforce max_tokens; add guardrails to refuse large prompts in SAFE mode.",
  };
}

// -----------------------------
// UI building blocks
// -----------------------------
function MetricCard({ icon: Icon, title, value, sub, trend, tone }) {
  // Glass morphism with gradient accent based on tone
  const glassAccent = {
    success: "from-emerald-500/10 via-transparent to-transparent border-emerald-500/20",
    warning: "from-amber-500/10 via-transparent to-transparent border-amber-500/20",
    destructive: "from-rose-500/10 via-transparent to-transparent border-rose-500/20",
    secondary: "from-violet-500/5 via-transparent to-transparent border-border",
  };
  
  const iconBg = {
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    destructive: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    secondary: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Card className={cn(
        "rounded-xl md:rounded-2xl border backdrop-blur-md bg-gradient-to-br",
        "bg-card/80 dark:bg-card/60",
        "shadow-lg shadow-black/5 dark:shadow-black/20",
        "hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/30",
        "transition-shadow duration-300",
        glassAccent[tone] || glassAccent.secondary
      )}>
        <CardHeader className="p-3 md:p-4 pb-2">
          <div className="flex items-start justify-between gap-1 md:gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xs md:text-sm font-medium text-foreground/60 truncate">
                {title}
              </CardTitle>
              <div className="mt-1 md:mt-2 flex items-end gap-1 md:gap-2 flex-wrap">
                <div className="text-lg md:text-2xl font-bold tracking-tight font-mono">{value}</div>
                {trend && (
                  <Badge
                    variant="outline"
                    className={cn("rounded-full text-[10px] md:text-xs px-1.5 md:px-2", toneToBadgeClass(tone))}
                  >
                    {trend}
                  </Badge>
                )}
              </div>
              {sub && (
                <CardDescription className="mt-1 md:mt-2 text-[10px] md:text-xs text-foreground/50 truncate">{sub}</CardDescription>
              )}
            </div>
            <div className={cn(
              "rounded-xl md:rounded-2xl p-1.5 md:p-2.5 ring-1 ring-inset ring-white/10 flex-shrink-0",
              iconBg[tone] || iconBg.secondary
            )}>
              <Icon className="h-4 w-4 md:h-5 md:w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 p-0" />
      </Card>
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-muted p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

function Pill({ tone = "secondary", children }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full", toneToBadgeClass(tone))}
    >
      {children}
    </Badge>
  );
}

function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-10 text-center">
      <div className="rounded-2xl bg-muted p-3">
        <Icon className="h-6 w-6 text-foreground/70" />
      </div>
      <div className="mt-4 text-lg font-semibold">{title}</div>
      <div className="mt-1 max-w-xl text-sm text-foreground/70">{desc}</div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function FancyShell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-violet-950/10 dark:to-violet-950/20">
      {/* Subtle grid pattern */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utb3BhY2l0eT0iMC4wMyIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50 pointer-events-none" />
      <div className="relative w-full px-4 py-6 md:px-6 md:py-8">
        {children}
      </div>
    </div>
  );
}

// -----------------------------
// Main Component
// -----------------------------
export default function LlmObservabilityOpsConsole() {
  const [darkBg, setDarkBg] = useState(false);
  const [dataMode, setDataMode] = useState("live");
  useEffect(() => {
    const root = document.documentElement;
    if (darkBg) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [darkBg]);

  

  const [env, setEnv] = useState(DEFAULTS.env);
  const [service, setService] = useState(DEFAULTS.service);
  const [model, setModel] = useState(DEFAULTS.model);

  const [liveMode, setLiveMode] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Clear live summary when switching to demo mode and trigger refresh
  const handleModeChange = (isDemo) => {
    const newLiveMode = !isDemo;
    setLiveMode(newLiveMode);
    if (!newLiveMode) {
      // Switching to demo mode - clear live data
      setLiveSummary(null);
    }
  };
  
  const [refreshEvery, setRefreshEvery] = useState("10");
  
  // Separate series for demo and live modes
  const [demoSeries, setDemoSeries] = useState(() => makeSeedSeries());
  const [liveSeries, setLiveSeries] = useState([]);
  
  // Use the appropriate series based on mode
  const series = liveMode ? liveSeries : demoSeries;
  const setSeries = liveMode ? setLiveSeries : setDemoSeries;
  
  // Chart data - only show data if we have real data points
  const chartData = series.filter(d => d.p95 != null || d.rps != null || d.err != null);
  
  // Persistent storage for live requests (survives refresh)
  const STORAGE_KEY = "llm-copilot-live-requests";
  
  // Load persisted requests from localStorage
  const loadPersistedRequests = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load persisted requests:", e);
    }
    return [];
  };
  
  // Keep SEPARATE state for live vs demo requests
  const [liveRequests, setLiveRequests] = useState(() => loadPersistedRequests());
  const [demoRequests, setDemoRequests] = useState(() => Array.from({ length: 18 }, () => mkReq()));
  
  // Use ref to always get latest liveMode in async callbacks
  const liveModeRef = useRef(liveMode);
  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);
  
  // The displayed requests depend on mode
  const requests = liveMode ? liveRequests : demoRequests;
  
  // Wrapper to update the correct state based on mode (uses ref for async safety)
  const setRequests = (updaterOrValue) => {
    const isLive = liveModeRef.current;
    if (isLive) {
      setLiveRequests(updaterOrValue);
    } else {
      setDemoRequests(updaterOrValue);
    }
  };
  
  // Incidents are dynamically generated based on request patterns
  const [incidents, setIncidents] = useState([]);
  
  // Live summary from backend (used in LIVE mode for accurate metrics)
  const [liveSummary, setLiveSummary] = useState(null);
  
  // AI Insights - proactive analysis from the LLM
  const [aiInsights, setAIInsights] = useState(null);
  const [aiInsightsLoading, setAIInsightsLoading] = useState(false);
  
  // Fetch AI insights from the backend
  const fetchAIInsights = async () => {
    if (!liveMode) return;
    setAIInsightsLoading(true);
    try {
      const data = await apiGet("/ops/ai-insights?window=60");
      if (data) {
        setAIInsights(data);
      }
    } catch (err) {
      console.error("Failed to fetch AI insights:", err);
    } finally {
      setAIInsightsLoading(false);
    }
  };
  
  // Auto-refresh AI insights every 30 seconds when in live mode
  const aiInsightsTimerRef = useRef(null);
  useEffect(() => {
    if (liveMode && autoRefresh) {
      // Initial fetch
      if (!aiInsights) {
        fetchAIInsights();
      }
      // Set up 30-second interval
      aiInsightsTimerRef.current = setInterval(() => {
        fetchAIInsights();
      }, 30000);
    }
    return () => {
      if (aiInsightsTimerRef.current) {
        clearInterval(aiInsightsTimerRef.current);
      }
    };
  }, [liveMode, autoRefresh]);

  // Generate incidents dynamically from request patterns
  // In LIVE mode, incidents come from the backend (Firestore) via /ops/incidents
  // In DEMO mode, we generate sample incidents for visualization
  useEffect(() => {
    if (!liveMode) {
      // In demo mode, generate sample incidents for visualization
      setIncidents([
        mkIncident("latency", "high"),
        mkIncident("errors", "medium"),
      ]);
      return;
    }

    // In LIVE mode, incidents are fetched from /ops/incidents endpoint
    // The backend handles incident detection based on real Firestore data
    // Only fall back to client-side detection if no backend incidents and we have local requests
    if (incidents.length === 0 && requests.length > 0 && !liveSummary) {
      const reqs = requests.slice(0, 20);
      const newIncidents = [];
      
      // Check for high latency (p95 > 5000ms)
      const latencies = reqs.filter(r => r.latency_ms).map(r => r.latency_ms);
      if (latencies.length > 0) {
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
        if (p95 > 5000) {
          newIncidents.push({
            id: "latency-live",
            kind: "latency",
            severity: p95 > 8000 ? "high" : "medium",
            status: "open",
            created_at: new Date().toISOString(),
            title: `High latency detected (p95: ${Math.round(p95)}ms)`,
            signal: "p95 latency",
            current: `${Math.round(p95)}ms`,
            threshold: "5000ms",
            description: "LLM response latency exceeds acceptable threshold. Check VertexAI/Gemini spans.",
            suggested_action: "Consider reducing max_tokens or implementing response streaming.",
          });
        }
      }

      // Check for errors
      const errors = reqs.filter(r => !r.ok);
      const errorRate = reqs.length > 0 ? errors.length / reqs.length : 0;
      if (errorRate > 0.05) {
        newIncidents.push({
          id: "errors-live",
          kind: "errors",
          severity: errorRate > 0.2 ? "high" : "medium",
          status: "open",
          created_at: new Date().toISOString(),
          title: `Elevated error rate (${(errorRate * 100).toFixed(1)}%)`,
          signal: "error rate",
          current: `${(errorRate * 100).toFixed(1)}%`,
          threshold: "5%",
          description: "Request failure rate is above normal levels.",
          suggested_action: "Check backend logs and VertexAI quota limits.",
        });
      }

      // Check for cost anomalies
      const costs = reqs.filter(r => r.cost?.total_cost_usd).map(r => r.cost.total_cost_usd);
      if (costs.length > 0) {
        const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
        if (avgCost > 0.05) {
          newIncidents.push({
            id: "cost-live",
            kind: "cost",
            severity: avgCost > 0.1 ? "high" : "medium",
            status: "open",
            created_at: new Date().toISOString(),
            title: `High cost per request ($${avgCost.toFixed(4)}/req)`,
            signal: "avg cost",
            current: `$${avgCost.toFixed(4)}`,
            threshold: "$0.05",
            description: "Average request cost is above the expected range.",
            suggested_action: "Review prompt lengths and consider response caching.",
          });
        }
      }

      if (newIncidents.length > 0) {
        setIncidents(newIncidents);
      }
    }
  }, [liveMode, requests, liveSummary]);

  // Persist live requests to localStorage whenever they change
  useEffect(() => {
    if (liveRequests.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(liveRequests.slice(0, 100)));
      } catch (e) {
        console.warn("Failed to persist requests:", e);
      }
    }
  }, [liveRequests]);
  
  // Function to clear persisted history
  const clearRequestHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setLiveRequests([]);
  };

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatResult, setChatResult] = useState(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState(null);

  const [health, setHealth] = useState({ ok: null, checkedAt: null, error: null });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const timerRef = useRef(null);

  // --------------
  // Derived metrics - Uses live data from Firestore in LIVE mode
  // --------------
  const summary = useMemo(() => {
    // In LIVE mode with backend data, use the accurate summary from Firestore
    if (liveMode && liveSummary && liveSummary.request_count > 0) {
      return {
        p95: liveSummary.p95_latency_ms,
        err: liveSummary.error_rate,
        rps: liveSummary.requests_per_second,
        p95Avg: liveSummary.p95_latency_ms,
        errAvg: liveSummary.error_rate,
        openIncidents: liveSummary.open_incidents || incidents.filter((i) => i.status === "open").length,
        okRate: liveSummary.ok_rate,
        safeRate: liveSummary.safe_rate,
        estCostPerReq: liveSummary.avg_cost_per_request,
        totalTokens: liveSummary.total_tokens,
        promptTokens: liveSummary.prompt_tokens,
        completionTokens: liveSummary.completion_tokens,
        totalCost: liveSummary.total_cost_usd,
        avgTokensPerReq: liveSummary.avg_tokens_per_request,
        requestCount: liveSummary.request_count,
        // Additional metrics from backend
        p50Latency: liveSummary.p50_latency_ms,
        p99Latency: liveSummary.p99_latency_ms,
        avgLatency: liveSummary.avg_latency_ms,
        errorCount: liveSummary.error_count,
        okCount: liveSummary.ok_count,
        refusalCount: liveSummary.refusal_count,
        isLiveData: true,
      };
    }
    
    // In LIVE mode but no backend data yet - show empty/waiting state
    if (liveMode) {
      // Compute from live requests if we have any (local tracking)
      const r = liveRequests;  // Use all requests for accurate metrics
      if (r.length > 0) {
        const latencies = r.filter((x) => x.latency_ms).map((x) => x.latency_ms);
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : null;
        const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
        
        const reqsWithTokens = r.filter((x) => x.tokens?.total_tokens > 0);
        const totalTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.total_tokens || 0), 0);
        const promptTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.prompt_tokens || 0), 0);
        const completionTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.completion_tokens || 0), 0);
        const totalCost = r.reduce((s, x) => s + (x.cost?.total_cost_usd || 0), 0);
        const avgCostPerReq = r.length ? totalCost / r.length : 0;
        const avgTokensPerReq = reqsWithTokens.length ? totalTokens / reqsWithTokens.length : 0;
        
        const okCount = r.filter((x) => x.ok).length;
        const errorCount = r.filter((x) => !x.ok).length;
        const okRate = r.length ? okCount / r.length : 1;
        const errorRate = r.length ? errorCount / r.length : 0;
        const safeRate = r.length ? r.filter((x) => x.safe_mode).length / r.length : 0;
        
        // Calculate RPS from timestamps
        const timestamps = r.map(x => new Date(x.ts).getTime()).filter(t => !isNaN(t));
        let rps = null;
        if (timestamps.length >= 2) {
          const oldest = Math.min(...timestamps);
          const newest = Math.max(...timestamps);
          const spanSeconds = (newest - oldest) / 1000;
          if (spanSeconds > 0) {
            rps = r.length / spanSeconds;
          }
        }
        
        return {
          p95,
          err: errorRate,
          rps,
          p95Avg: avgLatency,
          errAvg: errorRate,
          openIncidents: incidents.filter((i) => i.status === "open").length,
          okRate,
          safeRate,
          estCostPerReq: avgCostPerReq,
          totalTokens,
          promptTokens,
          completionTokens,
          totalCost,
          avgTokensPerReq,
          requestCount: r.length,
          errorCount,
          okCount,
          isLiveData: true,
        };
      }
      
      // No live data at all - return empty metrics
      return {
        p95: null,
        err: null,
        rps: null,
        p95Avg: null,
        errAvg: null,
        openIncidents: 0,
        okRate: null,
        safeRate: null,
        estCostPerReq: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0,
        avgTokensPerReq: 0,
        requestCount: 0,
        isLiveData: true,
        noData: true,
      };
    }
    
    // DEMO mode: compute from seeded demo data
    const last = series[series.length - 1] || { p95: null, err: null, rps: null };
    const last10 = series.slice(-10);
    const avg = (arr, key) =>
      arr.length
        ? arr.reduce((s, d) => s + (Number(d[key]) || 0), 0) / arr.length
        : 0;
    const p95Avg = avg(last10, "p95");
    const errAvg = avg(last10, "err");

    const openInc = incidents.filter((i) => i.status === "open");

    // Real token and cost data from requests (if available)
    const r = demoRequests;  // Use all requests for accurate metrics
    const reqsWithTokens = r.filter((x) => x.tokens?.total_tokens > 0);
    const totalTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.total_tokens || 0), 0);
    const promptTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.prompt_tokens || 0), 0);
    const completionTokens = reqsWithTokens.reduce((s, x) => s + (x.tokens?.completion_tokens || 0), 0);
    const totalCost = r.reduce((s, x) => s + (x.cost?.total_cost_usd || 0), 0);
    const avgCostPerReq = r.length ? totalCost / r.length : 0;
    const avgTokensPerReq = reqsWithTokens.length ? totalTokens / reqsWithTokens.length : 0;

    const okRate = r.length ? r.filter((x) => x.ok).length / r.length : 1;
    const safeRate = r.length ? r.filter((x) => x.safe_mode).length / r.length : 0;

    return {
      p95: last.p95,
      err: last.err,
      rps: last.rps,
      p95Avg,
      errAvg,
      openIncidents: openInc.length,
      okRate,
      safeRate,
      estCostPerReq: avgCostPerReq,
      totalTokens,
      promptTokens,
      completionTokens,
      totalCost,
      avgTokensPerReq,
      requestCount: r.length,
      isLiveData: false,
    };
  }, [series, incidents, liveRequests, demoRequests, liveMode, liveSummary]);

  // ----------------
  // Refresh loop
  // ----------------
  const refresh = async () => {
    // Health always tries live
    try {
      const h = await apiGet("/health");
      setHealth({ ok: h?.status === "ok", checkedAt: new Date(), error: null });
    } catch (e) {
      setHealth({ ok: false, checkedAt: new Date(), error: String(e?.message || e) });
    }

    if (!liveMode) {
      // demo mode: add a new point and shuffle requests
      setDemoSeries((prev) => {
        const last = prev[prev.length - 1];
        const i = prev.length;
        const jitter = (Math.sin(i / 6) + 1) * 0.5;
        const p95 = clamp((last?.p95 || 1500) + (Math.random() - 0.48) * 220, 800, 7000);
        const err = clamp((last?.err || 0.02) + (Math.random() - 0.55) * 0.01, 0.003, 0.2);
        const rps = clamp((last?.rps || 1.0) + (Math.random() - 0.5) * 0.12, 0.2, 4);
        const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const next = [...prev.slice(-60), { t, p95, err, rps }];
        return next;
      });
      setRequests((prev) => {
        const next = [mkReq(), ...prev].slice(0, 40);
        return next;
      });
      return;
    }

    // Live mode: fetch real data from Firestore via ops endpoints
    const s = await tryGet("/ops/summary?window=60");
    const r = await tryGet("/ops/requests?limit=40&since=60");
    const i = await tryGet("/ops/incidents?limit=20");
    const ts = await tryGet("/ops/timeseries?window=60&rollup=1");

    // Update time series for charts (only if we have data from backend)
    if (ts?.points?.length) {
      setLiveSeries(ts.points);
    }
    
    // Update requests table
    if (Array.isArray(r?.items)) {
      // Only update liveRequests to preserve persistence logic
      setLiveRequests(r.items);
    }
    
    // Update incidents from backend
    if (Array.isArray(i?.items)) {
      setIncidents(i.items);
    }

    // Store live summary for accurate metrics display
    if (s && s.firestore_connected) {
      setLiveSummary(s);
    }
    
    // Fetch AI insights (don't block refresh, run in background)
    // Only fetch every 30 seconds to avoid excessive LLM calls
    if (s?.request_count > 0) {
      fetchAIInsights();
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  const root = document.documentElement; // <html>
  if (darkBg) root.classList.add("dark");
  else root.classList.remove("dark");
}, [darkBg]);


  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const sec = Number(refreshEvery);
    const ms = clamp((Number.isFinite(sec) ? sec : 10) * 1000, 2000, 60000);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => refresh(), ms);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshEvery, liveMode]);

  // ----------------
  // Auto-populate chat with live data when dialog opens
  // ----------------
  useEffect(() => {
    if (chatOpen && !chatText && summary.requestCount > 0) {
      const openIncidentsList = incidents.filter(i => i.status === "open");
      const topIncident = openIncidentsList[0];
      
      let defaultPrompt = `Analyze my LLM Observability deployment and provide insights:

**Live Metrics (from ${summary.requestCount} requests):**
- Success Rate: ${(summary.okRate * 100).toFixed(1)}%
- Average Latency: ${summary.p95Avg ? Math.round(summary.p95Avg) + 'ms' : 'N/A'}
- Total Tokens Used: ${summary.totalTokens.toLocaleString()}
- Average Tokens/Request: ${Math.round(summary.avgTokensPerReq)}
- Total Cost: $${summary.totalCost.toFixed(4)}
- Average Cost/Request: $${summary.estCostPerReq.toFixed(4)}
- SAFE Mode Blocks: ${summary.safeRate > 0 ? Math.round(summary.safeRate * summary.requestCount) : 0}
- Open Incidents: ${summary.openIncidents}`;

      if (topIncident) {
        defaultPrompt += `

**Top Incident:**
- Title: ${topIncident.title}
- Severity: ${topIncident.severity}
- Description: ${topIncident.description || 'N/A'}`;
      }

      defaultPrompt += `

Please provide:
1. Overall health assessment
2. Key concerns or anomalies
3. Recommended actions
4. Cost optimization suggestions`;

      setChatText(defaultPrompt);
    }
  }, [chatOpen, chatText, summary, incidents]);

  // ----------------
  // Chat -> backend
  // ----------------
  const runChat = async () => {
    setChatBusy(true);
    setChatErr(null);
    setChatResult(null);

      // ✅ DEMO mode: do not call backend
  if (!liveMode) {
    const demoId = crypto?.randomUUID?.() ?? String(Date.now());
    setChatResult({
      request_id: demoId,
      safe_mode: safeMode,
      answer:
        "**Demo Response**\n\n" +
        "This is a simulated response (no backend call).\n\n" +
        "**To get real insights:**\n" +
        "1. Switch to LIVE mode in the header\n" +
        "2. Ensure the backend is running (`uvicorn app.main:app`)\n" +
        "3. Send a message to see real token usage and costs\n",
    });
    setChatBusy(false);
    return;
  }

    // If an incident is selected, enrich prompt
    const ctx = selected
      ? `\n\nContext: Incident\n- title: ${selected.title}\n- signal: ${selected.signal}\n- current: ${selected.current}\n- threshold: ${selected.threshold}\n- severity: ${selected.severity}\n- description: ${selected.description}`
      : "";

    const msg = `${chatText}${ctx}\n\nReturn: (1) root cause hypothesis (2) top 3 checks in Datadog (3) mitigation (4) prevention.`;

    try {
      const out = await apiPost("/chat", { message: msg, safe_mode: safeMode });
      setChatResult(out);

      // In live mode, add the real request to the requests list with actual trace IDs
      // Use liveModeRef to ensure we check the current mode (not stale closure)
      if (liveModeRef.current && out.trace_id) {
        const newReq = {
          request_id: out.request_id,
          ts: new Date().toISOString(),
          route: "POST /chat",
          model: out.model || DEFAULTS.model,
          latency_ms: out.latency_ms,
          ok: true,
          safe_mode: out.safe_mode,
          trace_id: out.trace_id,
          span_id: out.span_id,
          session_id: null,
          message_len: msg.length,
          answer_len: out.answer?.length || 0,
          error_type: null,
          // LLM Observability fields
          tokens: out.tokens || null,
          cost: out.cost || null,
        };
        // Directly update liveRequests to ensure persistence
        setLiveRequests((prev) => [newReq, ...prev].slice(0, 100));
      }
    } catch (e) {
      setChatErr(String(e?.message || e));
    } finally {
      setChatBusy(false);
    }
  };

  // ----------------
  // Filters
  // ----------------
  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => {
      return (
        r.request_id?.toLowerCase().includes(q) ||
        r.route?.toLowerCase().includes(q) ||
        r.model?.toLowerCase().includes(q) ||
        (r.error_type || "").toLowerCase().includes(q)
      );
    });
  }, [requests, query]);

  const filteredIncidents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter((i) => {
      return (
        i.title?.toLowerCase().includes(q) ||
        i.signal?.toLowerCase().includes(q) ||
        i.severity?.toLowerCase().includes(q)
      );
    });
  }, [incidents, query]);

  // ----------------
  // Datadog deep links (optional)
  // ----------------
  // Put your org base URL here. For best demo: set window.__DD_BASE__ in index.html.
  const ddBase =
    (typeof window !== "undefined" && window.__DD_BASE__) ||
    "https://app.datadoghq.com";

  const ddTraceLink = (req) => {
    if (!req?.request_id) return null;
    // Link to Live Tail filtered by request_id - this is more reliable
    // than trace_id search and allows clicking through to see the Trace tab
    const query = encodeURIComponent(`service:llm-observability-copilot @request_id:${req.request_id}`);
    return `${ddBase}/logs/livetail?query=${query}`;
  };

  // ----------------
  // UI
  // ----------------
  return (
    <FancyShell>
      {/* Gradient Header */}
      <div className="relative mb-4 md:mb-6 overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-4 md:p-6 shadow-2xl shadow-purple-500/25 animate-gradient">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -left-4 -top-4 h-32 w-32 rounded-full bg-white/10 blur-2xl float-slow" />
          <div className="absolute -bottom-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl float-medium" />
          <div className="absolute left-1/3 top-1/2 h-24 w-24 rounded-full bg-white/5 blur-2xl float-slow hidden md:block" style={{animationDelay: '1s'}} />
        </div>
        
        <div className="relative">
          {/* Mobile Header */}
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-3">
              <motion.div 
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30"
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="h-5 w-5 text-white" />
              </motion.div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">
                  LLM Copilot
                </h1>
                <div className="flex items-center gap-2 text-xs text-white/70">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
                    health.ok ? "bg-emerald-500/30" : "bg-rose-500/30"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", health.ok ? "bg-emerald-400" : "bg-rose-400")} />
                    {health.ok ? "healthy" : "offline"}
                  </span>
                  <Badge variant="outline" className={cn(
                    "rounded-md border-0 text-[10px] px-1.5 py-0",
                    liveMode ? "bg-emerald-500/80 text-white" : "bg-white/20 text-white"
                  )}>
                    {liveMode ? "LIVE" : "DEMO"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl bg-white/20 text-white hover:bg-white/30 border-0 h-9 px-3"
                onClick={() => {
                  setChatOpen(true);
                  setChatResult(null);
                  setChatErr(null);
                }}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl bg-white/20 text-white hover:bg-white/30 border-0 h-9 w-9 p-0"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden mt-4 pt-4 border-t border-white/20"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
                    <span className="text-xs text-white/70">Dark Mode</span>
                    <Switch checked={darkBg} onCheckedChange={setDarkBg} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
                    <span className="text-xs text-white/70">Demo Mode</span>
                    <Switch checked={!liveMode} onCheckedChange={handleModeChange} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-white/80">
                    <Bot className="h-3 w-3" /> {model}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-white/80">
                    <Cloud className="h-3 w-3" /> {env}
                  </span>
                </div>
                <Button
                  className="w-full mt-3 rounded-xl bg-white/20 text-white hover:bg-white/30 border-0"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setChatOpen(true);
                  }}
                >
                  <Flame className="mr-2 h-4 w-4" /> Live Triage
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop Header */}
          <div className="hidden md:flex md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <motion.div 
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 logo-glow"
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="h-7 w-7 text-white" />
              </motion.div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    LLM Observability Copilot
                  </h1>
                  <Badge className="rounded-full bg-white/20 text-white hover:bg-white/30 border-0">
                    v1.0
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/80">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                    <Bot className="h-3.5 w-3.5" /> {model}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                    <Activity className="h-3.5 w-3.5" /> {service}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                    <Cloud className="h-3.5 w-3.5" /> {env}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                    health.ok ? "bg-emerald-500/30 text-emerald-100" : "bg-rose-500/30 text-rose-100"
                  )}>
                    <Gauge className="h-3.5 w-3.5" />
                    {health.checkedAt ? (health.ok ? "healthy" : "unreachable") : "checking…"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-2 ring-1 ring-white/20">
                <span className="text-xs text-white/70">Dark</span>
                <Switch checked={darkBg} onCheckedChange={setDarkBg} />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-2 ring-1 ring-white/20">
                <Badge variant="outline" className={cn(
                  "rounded-xl border-0 transition-all",
                  liveMode ? "bg-emerald-500/80 text-white status-live" : "bg-white/20 text-white"
                )}>
                  {liveMode ? "● LIVE" : "DEMO"}
                </Badge>
                <span className="text-xs text-white/70">Demo</span>
                <Switch
                  checked={!liveMode}
                  onCheckedChange={(v) => setLiveMode(!v)}
                />
              </div>

              <Button
                variant="secondary"
                className="rounded-2xl bg-white/20 text-white hover:bg-white/30 border-0 backdrop-blur-sm"
                onClick={() => {
                  setChatOpen(true);
                  setChatResult(null);
                  setChatErr(null);
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Explain with AI
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-2xl">
                <Wrench className="mr-2 h-4 w-4" />
                Controls
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Environment</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-xs text-foreground/70">env</div>
                    <Select value={env} onValueChange={setEnv}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="env" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dev">dev</SelectItem>
                        <SelectItem value="staging">staging</SelectItem>
                        <SelectItem value="prod">prod</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-foreground/70">mode</div>
                    <Select
                      value={liveMode ? "live" : "demo"}
                      onValueChange={(v) => handleModeChange(v === "demo")}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">live</SelectItem>
                        <SelectItem value="demo">demo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-xs text-foreground/70">refresh</div>
                    <Select value={refreshEvery} onValueChange={setRefreshEvery}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5s</SelectItem>
                        <SelectItem value="10">10s</SelectItem>
                        <SelectItem value="15">15s</SelectItem>
                        <SelectItem value="30">30s</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between rounded-xl border px-3 py-2">
                    <div>
                      <div className="text-xs text-foreground/70">auto</div>
                      <div className="text-sm font-medium">
                        {autoRefresh ? "ON" : "OFF"}
                      </div>
                    </div>
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                  </div>
                </div>

                <div className="mt-3">
                  <Button
                    className="w-full rounded-xl"
                    onClick={() => refresh()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh now
                  </Button>
                </div>

                <Separator className="my-3" />
                <div className="text-xs text-foreground/70">
                  Demo mode shows simulated data. Live mode connects to
                  your backend for real-time metrics.
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 border-0"
            onClick={() => setChatOpen(true)}
          >
            <Flame className="mr-2 h-4 w-4" /> Live Triage
          </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Scorecards */}
        <div className="lg:col-span-8">
          <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Timer}
              title="p95 latency"
              value={fmtMs(summary.p95)}
              sub={liveMode ? `${summary.requestCount || 0} requests` : "rolling 60 min"}
              trend={
                summary.p95 == null 
                  ? (liveMode ? "waiting" : "—") 
                  : summary.p95 > 3500 
                    ? "breach" 
                    : "ok"
              }
              tone={
                summary.p95 == null 
                  ? "secondary" 
                  : summary.p95 > 3500 
                    ? "destructive" 
                    : "success"
              }
            />
            <MetricCard
              icon={AlertTriangle}
              title="error rate"
              value={fmtPct(summary.err)}
              sub={liveMode ? `${summary.requestCount || 0} requests` : "rolling 60 min"}
              trend={
                summary.err == null 
                  ? (liveMode ? "waiting" : "—") 
                  : summary.err > 0.05 
                    ? "spike" 
                    : "stable"
              }
              tone={
                summary.err == null 
                  ? "secondary" 
                  : summary.err > 0.05 
                    ? "warning" 
                    : "success"
              }
            />
            <MetricCard
              icon={Activity}
              title="throughput"
              value={
                summary.rps == null 
                  ? "—" 
                  : summary.rps < 0.01 
                    ? `${(summary.rps * 60).toFixed(1)} rpm`  // Show as requests per minute for very low traffic
                    : `${summary.rps.toFixed(2)} rps`
              }
              sub={
                summary.rps != null && summary.rps < 0.01 
                  ? "requests per minute" 
                  : "requests per second"
              }
              trend={
                summary.rps == null 
                  ? (liveMode ? "waiting" : "—") 
                  : summary.rps > 2 
                    ? "busy" 
                    : "normal"
              }
              tone={
                summary.rps == null 
                  ? "secondary" 
                  : summary.rps > 2 
                    ? "warning" 
                    : "success"
              }
            />
            <MetricCard
              icon={TriangleAlert}
              title="open incidents"
              value={summary.openIncidents}
              sub="auto-generated triage items"
              trend={summary.openIncidents ? "attention" : "clear"}
              tone={summary.openIncidents ? "destructive" : "success"}
            />
          </div>

          <Card className="mt-4 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader>
              <SectionTitle
                icon={LineChart}
                title="Service Health"
                right={
                  <div className="flex items-center gap-2">
                    <Pill tone={summary.okRate > 0.9 ? "success" : "warning"}>
                      <BadgeCheck className="mr-1 h-3 w-3" />
                      OK {fmtPct(summary.okRate)}
                    </Pill>
                    <Pill tone={summary.safeRate > 0.35 ? "warning" : "secondary"}>
                      <Shield className="mr-1 h-3 w-3" />
                      Safe {fmtPct(summary.safeRate)}
                    </Pill>
                    <Pill tone={summary.estCostPerReq > 0.015 ? "warning" : "secondary"}>
                      <DollarSign className="mr-1 h-3 w-3" />
                      {fmtMoney(summary.estCostPerReq)}/req
                    </Pill>
                  </div>
                }
              />
              <CardDescription className="mt-1">
                Correlated view: latency, error rate, throughput.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="p95" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="currentColor" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 0.2]}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                      }}
                      formatter={(v, name) => {
                        if (name === "p95") return [fmtMs(v), "p95 latency"];
                        if (name === "err") return [fmtPct(v), "error rate"];
                        if (name === "rps") return [`${Number(v).toFixed(2)}`, "rps"];
                        return [v, name];
                      }}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="p95"
                      stroke="currentColor"
                      fillOpacity={1}
                      fill="url(#p95)"
                      name="p95"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="err"
                      stroke="currentColor"
                      strokeDasharray="6 4"
                      dot={false}
                      name="err"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="rps"
                      stroke="currentColor"
                      dot={false}
                      name="rps"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Analytics Row - Error Distribution, Token Usage, Cost Breakdown */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Error Distribution Donut Chart */}
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Error Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.requestCount > 0 ? (
                  <>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Success", value: summary.okCount || 0, color: "#10b981" },
                              { name: "Errors", value: summary.errorCount || 0, color: "#ef4444" },
                              { name: "Refusals", value: summary.refusalCount || 0, color: "#f59e0b" },
                            ].filter(d => d.value > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {[
                              { color: "#10b981" },
                              { color: "#ef4444" },
                              { color: "#f59e0b" },
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'rgba(0,0,0,0.8)', 
                              border: 'none', 
                              borderRadius: '8px',
                              color: 'white'
                            }}
                            formatter={(value, name) => [`${value} requests`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-foreground/70">Success ({summary.okCount || 0})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-foreground/70">Errors ({summary.errorCount || 0})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-foreground/70">Refusals ({summary.refusalCount || 0})</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-48 flex items-center justify-center text-foreground/50">
                    <div className="text-center">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <div className="text-sm">No request data yet</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Token Usage Bar Chart */}
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-500" />
                  Token Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.totalTokens > 0 ? (
                  <>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { 
                              name: "Tokens", 
                              prompt: summary.promptTokens || 0,
                              completion: summary.completionTokens || 0,
                            }
                          ]}
                          layout="vertical"
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" hide />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'rgba(0,0,0,0.8)', 
                              border: 'none', 
                              borderRadius: '8px',
                              color: 'white'
                            }}
                          />
                          <Bar dataKey="prompt" stackId="a" fill="#8b5cf6" name="Prompt Tokens" radius={[4, 0, 0, 4]} />
                          <Bar dataKey="completion" stackId="a" fill="#06b6d4" name="Completion Tokens" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="text-center p-2 rounded-lg bg-violet-500/10">
                        <div className="text-lg font-bold font-mono text-violet-600 dark:text-violet-400">
                          {(summary.promptTokens || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-foreground/60">Prompt Tokens</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-cyan-500/10">
                        <div className="text-lg font-bold font-mono text-cyan-600 dark:text-cyan-400">
                          {(summary.completionTokens || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-foreground/60">Completion Tokens</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-48 flex items-center justify-center text-foreground/50">
                    <div className="text-center">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <div className="text-sm">No token data yet</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cost Breakdown */}
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  Cost Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Total Cost Big Number */}
                  <div className="text-center p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20">
                    <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {summary.totalCost > 0 ? `$${summary.totalCost.toFixed(4)}` : "—"}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">Total Spend</div>
                  </div>
                  
                  {/* Cost Metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-muted/50 text-center">
                      <div className="text-sm font-bold font-mono">
                        {summary.estCostPerReq > 0 ? `$${summary.estCostPerReq.toFixed(4)}` : "—"}
                      </div>
                      <div className="text-[10px] text-foreground/60">Per Request</div>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/50 text-center">
                      <div className="text-sm font-bold font-mono">
                        {summary.requestCount > 0 ? summary.requestCount.toLocaleString() : "—"}
                      </div>
                      <div className="text-[10px] text-foreground/60">Total Requests</div>
                    </div>
                  </div>

                  {/* Cost per 1K tokens */}
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-foreground/70">Est. $/1K tokens</span>
                      <span className="text-sm font-mono font-semibold">
                        {summary.totalTokens > 0 ? `$${((summary.totalCost / summary.totalTokens) * 1000).toFixed(4)}` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Request Volume & Model Performance Row */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Request Volume Card */}
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  Request Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div>
                    <div className="text-4xl font-bold font-mono">
                      {summary.requestCount > 0 ? summary.requestCount.toLocaleString() : "—"}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">Total Requests</div>
                  </div>
                  {chartData.length > 0 && (
                    <div className="flex-1 h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData.slice(-20)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="requestGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="rps"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fill="url(#requestGradient)"
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
                  <div className="text-center">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {summary.okCount != null ? summary.okCount : "—"}
                    </div>
                    <div className="text-[10px] text-foreground/60">Success</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono">
                      {summary.errorCount != null ? summary.errorCount : "—"}
                    </div>
                    <div className="text-[10px] text-foreground/60">Errors</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-400 font-mono">
                      {summary.refusalCount != null ? summary.refusalCount : "—"}
                    </div>
                    <div className="text-[10px] text-foreground/60">Blocked</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Latency Distribution */}
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Timer className="h-4 w-4 text-amber-500" />
                  Latency Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div>
                    <div className="text-4xl font-bold font-mono">
                      {fmtMs(summary.p95)}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">P95 Latency</div>
                  </div>
                  {chartData.length > 0 && (
                    <div className="flex-1 h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData.slice(-20)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="p95"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            fill="url(#latencyGradient)"
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono">
                      {fmtMs(summary.p50Latency)}
                    </div>
                    <div className="text-[10px] text-foreground/60">P50</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono">
                      {fmtMs(summary.p95)}
                    </div>
                    <div className="text-[10px] text-foreground/60">P95</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold font-mono">
                      {fmtMs(summary.p99Latency)}
                    </div>
                    <div className="text-[10px] text-foreground/60">P99</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-4">
          <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader>
              <SectionTitle
                icon={ListChecks}
                title="Triage Queue"
                right={
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      // add a fresh incident in demo mode
                      if (!liveMode) {
                        const types = ["latency", "errors", "cost"];
                        const t = types[Math.floor(Math.random() * types.length)];
                        setIncidents((p) => [mkIncident(t), ...p].slice(0, 20));
                      }
                    }}
                  >
                    <Terminal className="mr-2 h-4 w-4" /> Simulate
                  </Button>
                }
              />
              <CardDescription className="mt-1">
                Auto-detected incidents with recommended actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {incidents.slice(0, 6).map((inc) => (
                <motion.button
                  key={inc.id}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelected(inc);
                    setChatOpen(true);
                  }}
                  className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{inc.title}</div>
                      <div className="mt-1 text-xs text-foreground/70">
                        {inc.signal} • {inc.severity}
                      </div>
                    </div>
                    <Pill
                      tone={
                        inc.severity === "high"
                          ? "destructive"
                          : inc.severity === "medium"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {inc.status}
                    </Pill>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                    {inc.description}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
                    <ArrowRight className="h-3 w-3" />
                    <span className="line-clamp-1">{inc.suggested_action}</span>
                  </div>
                </motion.button>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-4 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader>
              <SectionTitle icon={Shield} title="Policy & Guardrails" />
              <CardDescription className="mt-1">
                SAFE mode, logging hygiene, and operational readiness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border p-3">
                <div>
                  <div className="text-sm font-semibold">SAFE mode</div>
                  <div className="text-xs text-foreground/70">
                    Refuse secrets, bypasses, and prompt extraction.
                  </div>
                </div>
                <Switch checked={safeMode} onCheckedChange={setSafeMode} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border p-3">
                  <div className="text-xs text-foreground/70">Tracing</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <BadgeCheck className="h-4 w-4" /> APM
                  </div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="text-xs text-foreground/70">Metrics</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <BadgeCheck className="h-4 w-4" /> DogStatsD
                  </div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="text-xs text-foreground/70">Logs</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <BadgeCheck className="h-4 w-4" /> JSON
                  </div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="text-xs text-foreground/70">SLO</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4" /> p95
                  </div>
                </div>
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={() => {
                  setSelected(incidents[0] || null);
                  setChatOpen(true);
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Generate incident summary
              </Button>
            </CardContent>
          </Card>

          {/* AI Insights Panel - Proactive Analysis */}
          <Card className="mt-4 rounded-2xl shadow-lg bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-violet-500/30 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  AI Insights
                  {aiInsights && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      aiInsights.risk_level === 'critical' ? 'bg-rose-500/20 text-rose-500' :
                      aiInsights.risk_level === 'high' ? 'bg-amber-500/20 text-amber-500' :
                      aiInsights.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-500' :
                      'bg-emerald-500/20 text-emerald-500'
                    }`}>
                      {aiInsights.risk_level || 'low'}
                    </span>
                  )}
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={fetchAIInsights}
                  disabled={aiInsightsLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${aiInsightsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <CardDescription className="text-xs">
                Real-time LLM analysis • Auto-refreshes every 30s
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-violet-500/20 scrollbar-track-transparent">
              {aiInsightsLoading && !aiInsights ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
                  <span className="ml-2 text-sm text-foreground/60">Analyzing metrics...</span>
                </div>
              ) : aiInsights ? (
                <>
                  {/* Health Score */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50">
                    <div className={`text-3xl font-bold font-mono ${
                      aiInsights.health_score >= 80 ? 'text-emerald-500' :
                      aiInsights.health_score >= 60 ? 'text-amber-500' :
                      'text-rose-500'
                    }`}>
                      {aiInsights.health_score}
                    </div>
                    <div>
                      <div className="text-sm font-medium">Health Score</div>
                      <div className="text-[10px] text-foreground/50">
                        Updated {aiInsights.timestamp ? new Date(aiInsights.timestamp).toLocaleTimeString() : 'now'}
                      </div>
                    </div>
                  </div>

                  {/* Safety Metrics Summary */}
                  {aiInsights.metrics_snapshot && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
                        <div className="text-lg font-bold font-mono text-rose-500">
                          {(aiInsights.metrics_snapshot.hallucination_rate * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-foreground/60">Hallucination Risk</div>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                        <div className="text-lg font-bold font-mono text-amber-500">
                          {(aiInsights.metrics_snapshot.abuse_rate * 100).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-foreground/60">Abuse Attempts</div>
                      </div>
                    </div>
                  )}

                  {/* Insights */}
                  {aiInsights.insights?.map((insight, i) => (
                    <div key={i} className={`p-2 rounded-lg text-xs ${
                      insight.severity === 'critical' ? 'bg-rose-500/10 border border-rose-500/30' :
                      insight.severity === 'warning' ? 'bg-amber-500/10 border border-amber-500/30' :
                      'bg-blue-500/10 border border-blue-500/30'
                    }`}>
                      <div className="font-semibold flex items-center gap-1">
                        {insight.severity === 'critical' ? <AlertTriangle className="h-3 w-3 text-rose-500" /> :
                         insight.severity === 'warning' ? <TriangleAlert className="h-3 w-3 text-amber-500" /> :
                         <Activity className="h-3 w-3 text-blue-500" />}
                        {insight.title}
                      </div>
                      <div className="text-foreground/70 mt-0.5">{insight.detail}</div>
                    </div>
                  ))}

                  {/* Predictions */}
                  {aiInsights.predictions?.map((pred, i) => (
                    <div key={i} className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-xs">
                      <div className="font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        Prediction
                      </div>
                      <div className="text-foreground/70 mt-0.5">{pred.issue}</div>
                      <div className="text-[10px] text-foreground/50 mt-1">
                        {pred.probability} • {pred.timeframe} • {pred.impact} impact
                      </div>
                    </div>
                  ))}

                  {/* Recommendations */}
                  {aiInsights.recommendations?.map((rec, i) => (
                    <div key={i} className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs">
                      <div className="font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        {rec.priority === 'high' ? '🔥 ' : ''}Action: {rec.action}
                      </div>
                      <div className="text-foreground/70 mt-0.5">{rec.reason}</div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center text-xs text-foreground/50 py-6">
                  <Sparkles className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  <div>AI analysis available when data is present</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 text-violet-500"
                    onClick={fetchAIInsights}
                  >
                    Analyze Now
                  </Button>
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          {/* Safety & Quality Metrics - Uses AI Insights data for consistency */}
          <Card className="mt-4 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                Safety Metrics
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time quality signals (synced with AI Insights)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(() => {
                // Use AI Insights metrics_snapshot for consistent data source
                const snapshot = aiInsights?.metrics_snapshot;
                const avgHallucination = snapshot?.hallucination_rate ?? 0;
                const avgAbuse = snapshot?.abuse_rate ?? 0;
                const avgPerformance = snapshot?.performance_score ?? 1;
                const avgQuality = snapshot?.response_quality ?? 1;
                const hasData = snapshot || requests.length > 0;
                
                if (!hasData) {
                  return (
                    <div className="text-center text-xs text-foreground/50 py-4">
                      No request data yet
                    </div>
                  );
                }
                
                return (
                  <>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${avgHallucination > 0.5 ? 'bg-rose-500' : avgHallucination > 0.2 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="text-xs">Hallucination Risk</span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${avgHallucination > 0.5 ? 'text-rose-500' : avgHallucination > 0.2 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {(avgHallucination * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${avgAbuse > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span className="text-xs">Abuse Rate</span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${avgAbuse > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {(avgAbuse * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${avgPerformance < 0.5 ? 'bg-rose-500' : avgPerformance < 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="text-xs">Performance Score</span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${avgPerformance < 0.5 ? 'text-rose-500' : avgPerformance < 0.8 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {(avgPerformance * 100).toFixed(0)}%
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${avgQuality < 0.5 ? 'bg-rose-500' : avgQuality < 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="text-xs">Response Quality</span>
                      </div>
                      <span className={`text-sm font-mono font-bold ${avgQuality < 0.5 ? 'text-rose-500' : avgQuality < 0.8 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {(avgQuality * 100).toFixed(0)}%
                      </span>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Tabs defaultValue="overview">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Mobile-optimized scrollable tabs */}
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              <TabsList className="h-10 md:h-11 rounded-xl md:rounded-2xl inline-flex w-max md:w-auto">
                <TabsTrigger value="overview" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <BarChart3 className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  <span className="hidden xs:inline">Overview</span>
                  <span className="xs:hidden">Home</span>
                </TabsTrigger>
                <TabsTrigger value="requests" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <Activity className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  <span className="hidden sm:inline">Live Requests</span>
                  <span className="sm:hidden">Requests</span>
                </TabsTrigger>
                <TabsTrigger value="incidents" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <AlertTriangle className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> Incidents
                </TabsTrigger>
                <TabsTrigger value="health" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <LineChart className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  <span className="hidden sm:inline">Model Health</span>
                  <span className="sm:hidden">Health</span>
                </TabsTrigger>
                <TabsTrigger value="cost" className="rounded-lg md:rounded-xl text-xs md:text-sm px-2.5 md:px-3 min-w-fit">
                  <DollarSign className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" /> 
                  <span className="hidden sm:inline">Cost & Risk</span>
                  <span className="sm:hidden">Cost</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex w-full items-center gap-2 md:w-auto">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 md:top-3 h-4 w-4 text-foreground/50" />
                <Input
                  className="h-10 md:h-11 rounded-xl md:rounded-2xl pl-9 text-sm"
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                className="h-10 md:h-11 rounded-xl md:rounded-2xl px-3 md:px-4 text-sm" 
                onClick={() => setQuery("")}
              >
                Clear
              </Button>
            </div>
          </div>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={Activity} title="Live request stream" />
                  <CardDescription className="mt-1">
                    The last 12 requests with status + latency.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {filteredRequests.slice(0, 12).map((r) => {
                      const lb = latencyBadge(r.latency_ms);
                      const sb = statusBadge(r.ok);
                      return (
                        <button
                          key={r.request_id}
                          onClick={() => {
                            setSelected(r);
                            setChatOpen(true);
                          }}
                          className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold">
                                {shortId(r.request_id)}
                                <span className="ml-2 text-xs font-normal text-foreground/60">
                                  {new Date(r.ts).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-foreground/70">
                                {r.route} • {r.model}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Pill tone={sb.tone}>{sb.label}</Pill>
                              <Pill tone={lb.tone}>{lb.label}</Pill>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                            <span className="inline-flex items-center gap-1">
                              <Timer className="h-3 w-3" /> {fmtMs(r.latency_ms)}
                            </span>
                            <span className="text-foreground/30">•</span>
                            <span className="inline-flex items-center gap-1">
                              <Shield className="h-3 w-3" /> {r.safe_mode ? "SAFE" : "normal"}
                            </span>
                            {r.error_type ? (
                              <>
                                <span className="text-foreground/30">•</span>
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-300">
                                  <TriangleAlert className="h-3 w-3" /> {r.error_type}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}

                    {!filteredRequests.length ? (
                      <EmptyState
                        icon={Activity}
                        title={liveMode ? "No live requests yet" : "No requests found"}
                        desc={liveMode 
                          ? "Use the 'Explain with AI' button to send a request. Real requests with valid Datadog trace IDs will appear here."
                          : "Try a different search term or switch to demo mode to generate activity."
                        }
                        action={
                          liveMode ? (
                            <Button className="rounded-2xl" onClick={() => setChatOpen(true)}>
                              <Sparkles className="mr-2 h-4 w-4" /> Send a request
                            </Button>
                          ) : (
                            <Button className="rounded-2xl" onClick={() => setLiveMode(false)}>
                              Switch to demo
                            </Button>
                          )
                        }
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={AlertTriangle} title="Top incidents" />
                  <CardDescription className="mt-1">
                    What’s hurting reliability right now.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {filteredIncidents.slice(0, 8).map((inc) => (
                      <button
                        key={inc.id}
                        onClick={() => {
                          setSelected(inc);
                          setChatOpen(true);
                        }}
                        className="w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold">{inc.title}</div>
                            <div className="mt-1 text-xs text-foreground/70">
                              {inc.signal} • threshold {String(inc.threshold)}
                            </div>
                          </div>
                          <Pill
                            tone={
                              inc.severity === "high"
                                ? "destructive"
                                : inc.severity === "medium"
                                ? "warning"
                                : "secondary"
                            }
                          >
                            {inc.severity}
                          </Pill>
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs text-foreground/70">
                          {inc.description}
                        </div>
                      </button>
                    ))}
                    {!filteredIncidents.length ? (
                      <EmptyState
                        icon={AlertTriangle}
                        title="No incidents"
                        desc="When monitors trigger, incidents will appear here for triage."
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader>
                <SectionTitle
                  icon={Activity}
                  title="Live Requests"
                  right={
                    <div className="flex items-center gap-2">
                      {liveMode && requests.length > 0 && (
                        <Pill tone="secondary">
                          💾 {requests.length} saved
                        </Pill>
                      )}
                      <Pill tone={liveMode ? "success" : "secondary"}>
                        {liveMode ? "live" : "demo"}
                      </Pill>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setChatOpen(true)}
                      >
                        <Sparkles className="mr-2 h-4 w-4" /> AI triage
                      </Button>
                    </div>
                  }
                />
                <CardDescription className="mt-1">
                  Click any row to generate a trace-aware explanation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>time</TableHead>
                        <TableHead>request_id</TableHead>
                        <TableHead>route</TableHead>
                        <TableHead>status</TableHead>
                        <TableHead>latency</TableHead>
                        <TableHead>tokens</TableHead>
                        <TableHead>cost</TableHead>
                        <TableHead>safe</TableHead>
                        <TableHead>trace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.slice(0, 40).map((r) => {
                        const sb = statusBadge(r.ok);
                        const lb = latencyBadge(r.latency_ms);
                        const link = ddTraceLink(r);
                        return (
                          <TableRow
                            key={r.request_id}
                            className="cursor-pointer"
                            onClick={() => {
                              setSelected(r);
                              setChatOpen(true);
                            }}
                          >
                            <TableCell className="text-xs text-foreground/70">
                              {new Date(r.ts).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {shortId(r.request_id)}
                            </TableCell>
                            <TableCell className="text-xs">{r.route}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("rounded-full", toneToBadgeClass(sb.tone))}
                              >
                                {sb.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn("rounded-full", toneToBadgeClass(lb.tone))}
                                >
                                  {fmtMs(r.latency_ms)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-mono">
                                {fmtTokens(r.tokens)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                                {fmtCost(r.cost?.total_cost_usd)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {r.safe_mode ? (
                                <Pill tone="warning">SAFE</Pill>
                              ) : (
                                <Pill tone="secondary">normal</Pill>
                              )}
                            </TableCell>
                            <TableCell>
                              {link ? (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-foreground/70 hover:text-foreground"
                                >
                                  View <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-xs text-foreground/40">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incidents" className="mt-4">
            <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
              <CardHeader>
                <SectionTitle
                  icon={AlertTriangle}
                  title="Incidents"
                  right={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          if (!liveMode) {
                            setIncidents((p) => [mkIncident("latency"), ...p].slice(0, 20));
                          }
                        }}
                      >
                        <Terminal className="mr-2 h-4 w-4" /> Trigger latency
                      </Button>
                      <Button
                        className="rounded-xl"
                        onClick={() => {
                          setSelected(filteredIncidents[0] || null);
                          setChatOpen(true);
                        }}
                      >
                        <Sparkles className="mr-2 h-4 w-4" /> Explain top
                      </Button>
                    </div>
                  }
                />
                <CardDescription className="mt-1">
                  Each incident is actionable: signal → root cause hypothesis → fix.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    <div className="space-y-2">
                      {filteredIncidents.map((inc) => (
                        <button
                          key={inc.id}
                          className={cn(
                            "w-full rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 text-left hover:bg-muted/60 hover:border-violet-500/30 transition-all duration-200 shadow-sm hover:shadow-md",
                            selected?.id === inc.id && "ring-2 ring-foreground/10"
                          )}
                          onClick={() => setSelected(inc)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold">{inc.title}</div>
                              <div className="mt-1 text-xs text-foreground/70">
                                {inc.signal} • current {String(inc.current)} • threshold {String(inc.threshold)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Pill
                                tone={
                                  inc.severity === "high"
                                    ? "destructive"
                                    : inc.severity === "medium"
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {inc.severity}
                              </Pill>
                              <Pill tone={inc.status === "open" ? "warning" : "success"}>
                                {inc.status}
                              </Pill>
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-foreground/80">
                            {inc.description}
                          </div>
                          <div className="mt-3 rounded-2xl bg-muted/60 p-3 text-xs text-foreground/70">
                            <div className="flex items-center gap-2 font-medium text-foreground/80">
                              <Wrench className="h-4 w-4" /> Suggested action
                            </div>
                            <div className="mt-1">{inc.suggested_action}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    {selected && selected.signal ? (
                      <Card className="rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                        <CardHeader>
                          <SectionTitle
                            icon={Sparkles}
                            title="AI Incident Brief"
                            right={
                              <Button className="rounded-xl" onClick={() => setChatOpen(true)}>
                                <Sparkles className="mr-2 h-4 w-4" /> Generate
                              </Button>
                            }
                          />
                          <CardDescription className="mt-1">
                            One-click executive + on-call summary.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="rounded-2xl border p-3">
                            <div className="text-xs text-foreground/70">Signal</div>
                            <div className="mt-1 text-sm font-semibold">{selected.signal}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border p-3">
                              <div className="text-xs text-foreground/70">Current</div>
                              <div className="mt-1 text-sm font-semibold">
                                {String(selected.current)}
                              </div>
                            </div>
                            <div className="rounded-2xl border p-3">
                              <div className="text-xs text-foreground/70">Threshold</div>
                              <div className="mt-1 text-sm font-semibold">
                                {String(selected.threshold)}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            className="w-full rounded-2xl"
                            onClick={() => {
                              setChatText(
                                `Summarize incident '${selected.title}' for an on-call engineer.`
                              );
                              setChatOpen(true);
                            }}
                          >
                            <LogIn className="mr-2 h-4 w-4" /> Draft on-call note
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <EmptyState
                        icon={AlertTriangle}
                        title="Select an incident"
                        desc="Pick an incident on the left to view details and generate an AI brief."
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={LineChartIcon} title="Model latency profile" />
                  <CardDescription className="mt-1">
                    Useful for demos: show “dependency spans” alignment with p95.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ReLineChart data={series} margin={{ left: 8, right: 12, top: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="t" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--background))",
                          }}
                          formatter={(v) => fmtMs(v)}
                        />
                        <Line type="monotone" dataKey="p95" stroke="currentColor" dot={false} />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={Cloud} title="Dependencies" />
                  <CardDescription className="mt-1">
                    What your traces will show: Vertex/Gemini + auth + Datadog.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DepRow name="Gemini / VertexAI" health="degraded" hint="High p95 spans observed" />
                  <DepRow name="OAuth Token" health="ok" hint="Occasional spikes" />
                  <DepRow name="Datadog Intake" health="warning" hint="Network timeouts seen" />

                  <Separator />
                  <div className="rounded-2xl bg-muted/60 p-4 text-sm">
                    <div className="font-semibold">Trace Analysis</div>
                    <div className="mt-1 text-foreground/70">
                      Click "View" on any request to open Datadog traces. The longest 
                      child span typically indicates the bottleneck (e.g., LLM API call).
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="cost" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-7 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={DollarSign} title="LLM Cost Analytics" />
                  <CardDescription className="mt-1">
                    Real-time cost tracking and optimization insights from {summary.requestCount} requests.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Primary Metrics */}
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border bg-emerald-500/5 p-4">
                      <div className="text-xs text-foreground/70">Total Cost</div>
                      <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {summary.totalCost > 0 ? `$${summary.totalCost.toFixed(4)}` : "$0.00"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        {summary.requestCount} requests
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs text-foreground/70">Avg Cost / Request</div>
                      <div className="mt-2 text-xl font-semibold">
                        {summary.estCostPerReq > 0 ? `$${summary.estCostPerReq.toFixed(4)}` : "$0.00"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        from token usage
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs text-foreground/70">Total Tokens</div>
                      <div className="mt-2 text-xl font-semibold">
                        {summary.totalTokens > 0 ? summary.totalTokens.toLocaleString() : "0"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        input + output
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs text-foreground/70">Avg Tokens / Request</div>
                      <div className="mt-2 text-xl font-semibold">
                        {summary.avgTokensPerReq > 0 ? Math.round(summary.avgTokensPerReq).toLocaleString() : "0"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        optimization target
                      </div>
                    </div>
                  </div>

                  {/* Cost Analysis */}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className={cn(
                      "rounded-2xl border p-4",
                      summary.estCostPerReq > 0.01 ? "border-amber-500/50 bg-amber-500/5" : ""
                    )}>
                      <div className="text-xs text-foreground/70">Cost Risk Level</div>
                      <div className={cn(
                        "mt-2 text-xl font-semibold",
                        summary.estCostPerReq > 0.02 ? "text-rose-600 dark:text-rose-400" :
                        summary.estCostPerReq > 0.01 ? "text-amber-600 dark:text-amber-400" :
                        "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {summary.estCostPerReq > 0.02 ? "High" :
                         summary.estCostPerReq > 0.01 ? "Medium" :
                         summary.estCostPerReq > 0 ? "Low" : "No Data"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        {summary.estCostPerReq > 0.02 ? "Consider prompt optimization" :
                         summary.estCostPerReq > 0.01 ? "Monitor for anomalies" :
                         "Within expected range"}
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs text-foreground/70">Projected Daily Cost</div>
                      <div className="mt-2 text-xl font-semibold">
                        {summary.estCostPerReq > 0 
                          ? `$${(summary.estCostPerReq * 1000).toFixed(2)}`
                          : "$0.00"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        @ 1,000 requests/day
                      </div>
                    </div>
                    <div className="rounded-2xl border p-4">
                      <div className="text-xs text-foreground/70">Projected Monthly</div>
                      <div className="mt-2 text-xl font-semibold">
                        {summary.estCostPerReq > 0 
                          ? `$${(summary.estCostPerReq * 30000).toFixed(2)}`
                          : "$0.00"}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">
                        @ 1,000 requests/day
                      </div>
                    </div>
                  </div>

                  {/* Smart Recommendations - Dynamic based on usage */}
                  <div className="mt-4 rounded-2xl bg-muted/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">Optimization Insights</div>
                        <div className="text-sm text-foreground/70">
                          {summary.requestCount > 0 
                            ? `Based on analysis of ${summary.requestCount} requests.`
                            : "Send requests to generate personalized insights."}
                        </div>
                      </div>
                      {summary.requestCount > 0 && (
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => {
                            setChatText(`Analyze my LLM costs and provide optimization recommendations:
- Total requests: ${summary.requestCount}
- Average tokens per request: ${Math.round(summary.avgTokensPerReq)}
- Average cost per request: $${summary.estCostPerReq.toFixed(4)}
- Total cost: $${summary.totalCost.toFixed(4)}

Provide specific recommendations to reduce costs while maintaining quality.`);
                            setChatOpen(true);
                          }}
                        >
                          <Sparkles className="mr-2 h-4 w-4" /> Analyze
                        </Button>
                      )}
                    </div>
                    {summary.requestCount > 0 ? (
                      <ul className="mt-3 space-y-2 text-sm text-foreground/80">
                        {summary.avgTokensPerReq > 500 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
                            <span><strong>High token usage ({Math.round(summary.avgTokensPerReq)} avg):</strong> Consider prompt compression or summarization</span>
                          </li>
                        )}
                        {summary.avgTokensPerReq > 0 && summary.avgTokensPerReq <= 500 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                            <span><strong>Efficient token usage ({Math.round(summary.avgTokensPerReq)} avg):</strong> Within optimal range</span>
                          </li>
                        )}
                        {summary.estCostPerReq > 0.01 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-amber-500" />
                            <span><strong>Elevated cost (${summary.estCostPerReq.toFixed(4)}/req):</strong> Consider response caching for repeated queries</span>
                          </li>
                        )}
                        {summary.estCostPerReq > 0 && summary.estCostPerReq <= 0.01 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                            <span><strong>Cost efficient (${summary.estCostPerReq.toFixed(4)}/req):</strong> Below threshold</span>
                          </li>
                        )}
                        {!safeMode && summary.requestCount >= 3 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
                            <span><strong>Security:</strong> Enable SAFE mode to prevent prompt injection attacks</span>
                          </li>
                        )}
                        {safeMode && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                            <span><strong>SAFE mode active:</strong> Prompt injection protection enabled</span>
                          </li>
                        )}
                        {summary.okRate < 0.95 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-red-500" />
                            <span><strong>Reliability concern ({((1 - summary.okRate) * 100).toFixed(1)}% errors):</strong> Check backend logs for failures</span>
                          </li>
                        )}
                        {summary.okRate >= 0.95 && (
                          <li className="flex items-start gap-2">
                            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-500" />
                            <span><strong>High reliability ({(summary.okRate * 100).toFixed(1)}% success):</strong> Service performing well</span>
                          </li>
                        )}
                      </ul>
                    ) : (
                      <div className="mt-3 text-sm text-foreground/60 italic">
                        No request data available yet. Use the AI Assistant to send requests and generate insights.
                      </div>
                    )}
                  </div>

                  {/* Datadog Monitor Configuration - Only show when data available */}
                  {summary.requestCount > 0 && (
                    <div className="mt-4 rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">Recommended Alert Thresholds</div>
                          <div className="text-xs text-foreground/70">
                            Calculated from {summary.requestCount} requests (2x baseline for alerting).
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => {
                            setChatText(`Generate Datadog monitor configurations based on my current metrics:
- Average cost: $${summary.estCostPerReq.toFixed(4)}/req → Alert at: $${(summary.estCostPerReq * 2).toFixed(4)}/req
- Average tokens: ${Math.round(summary.avgTokensPerReq)} → Alert at: ${Math.round(summary.avgTokensPerReq * 1.5)}
- Current error rate: ${((1 - summary.okRate) * 100).toFixed(1)}%
- Total requests analyzed: ${summary.requestCount}

Generate monitor YAML for cost, latency, and error rate alerts.`);
                            setChatOpen(true);
                          }}
                        >
                          <Sparkles className="mr-2 h-4 w-4" /> Generate
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-muted/40 p-2">
                          <div className="text-xs text-foreground/60">Cost Alert (2x avg)</div>
                          <div className="text-sm font-mono font-semibold">
                            &gt; ${(summary.estCostPerReq * 2).toFixed(4)}/req
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2">
                          <div className="text-xs text-foreground/60">Token Alert (1.5x avg)</div>
                          <div className="text-sm font-mono font-semibold">
                            &gt; {Math.round(summary.avgTokensPerReq * 1.5).toLocaleString()} tokens
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2">
                          <div className="text-xs text-foreground/60">Latency (p95)</div>
                          <div className="text-sm font-mono font-semibold">
                            &gt; {summary.p95Avg > 0 ? `${Math.round(summary.p95Avg * 1.5)}ms` : "5000ms"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2">
                          <div className="text-xs text-foreground/60">Error Rate</div>
                          <div className="text-sm font-mono font-semibold">
                            &gt; {summary.okRate < 1 ? `${Math.max(5, Math.round((1 - summary.okRate) * 100 * 2))}%` : "5%"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-5 rounded-2xl shadow-lg bg-card/80 dark:bg-card/60 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <SectionTitle icon={Shield} title="Enterprise Risk Controls" />
                  <CardDescription className="mt-1">
                    Security, compliance, and cost governance for production LLM deployments.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <RiskItem
                    icon={Shield}
                    title="Prompt & Secret Protection"
                    desc="SAFE mode blocks credential exposure, prompt injection, and jailbreak attempts."
                  />
                  <RiskItem
                    icon={DollarSign}
                    title="Cost Governance"
                    desc={`Real-time tracking: $${summary.totalCost.toFixed(4)} total, $${summary.estCostPerReq.toFixed(4)}/request avg.`}
                  />
                  <RiskItem
                    icon={Timer}
                    title="Latency SLOs"
                    desc="p95 latency tracking with automatic anomaly detection and alerting."
                  />
                  <RiskItem
                    icon={Activity}
                    title="Token Governance"
                    desc={`Avg ${Math.round(summary.avgTokensPerReq).toLocaleString()} tokens/request. Set limits to prevent runaway prompts.`}
                  />
                  <RiskItem
                    icon={BadgeCheck}
                    title="Audit & Compliance"
                    desc="Full request/response logging with PII-safe structured logs to Datadog."
                  />

                  <Separator className="my-3" />

                  {/* Current Session Stats */}
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-foreground/70">
                        {liveMode ? "Accumulated Statistics (Persisted)" : "Demo Statistics"}
                      </div>
                      {liveMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-foreground/50 hover:text-rose-500"
                          onClick={clearRequestHistory}
                        >
                          Clear History
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Requests: <span className="font-semibold">{summary.requestCount}</span></div>
                      <div>Success Rate: <span className="font-semibold">{fmtPct(summary.okRate)}</span></div>
                      <div>SAFE Mode: <span className="font-semibold">{fmtPct(summary.safeRate)}</span></div>
                      <div>Total Cost: <span className="font-semibold text-emerald-600">${summary.totalCost.toFixed(4)}</span></div>
                    </div>
                  </div>

                  <Button
                    className="w-full rounded-2xl"
                    onClick={() => {
                      setChatText(
                        `Generate an executive summary for our LLM Observability deployment:

**Current Metrics:**
- Total Requests: ${summary.requestCount}
- Success Rate: ${(summary.okRate * 100).toFixed(1)}%
- Average Latency: p95 ${summary.p95 ? Math.round(summary.p95) + 'ms' : 'N/A'}
- Total Tokens Used: ${summary.totalTokens.toLocaleString()}
- Average Cost/Request: $${summary.estCostPerReq.toFixed(4)}
- Total Session Cost: $${summary.totalCost.toFixed(4)}
- SAFE Mode Usage: ${(summary.safeRate * 100).toFixed(1)}%

Provide:
1. Executive summary (2-3 sentences)
2. Key reliability metrics assessment
3. Cost optimization opportunities
4. Security posture evaluation
5. Recommended next steps for production readiness`
                      );
                      setChatOpen(true);
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Generate Executive Report
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Dialog - Mobile optimized */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto rounded-2xl md:rounded-2xl p-4 md:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
              <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-violet-500" /> AI Triage Assistant
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              Powered by Gemini - get root cause analysis + recommended actions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Prompt</div>
                <div className="flex items-center gap-2">
                  <Pill tone={safeMode ? "warning" : "secondary"}>
                    {safeMode ? "SAFE" : "normal"}
                  </Pill>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setSafeMode((s) => !s)}
                  >
                    <Shield className="mr-2 h-4 w-4" /> Toggle SAFE
                  </Button>
                </div>
              </div>
              <Textarea
                className="min-h-[100px] md:min-h-[120px] rounded-xl md:rounded-2xl text-sm"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
              />
              {selected ? (
                <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-foreground/70">
                  <div className="font-medium text-foreground/80">Attached context</div>
                  <div className="mt-1">
                    {selected.title ? (
                      <>
                        <b>Incident:</b> {selected.title}
                      </>
                    ) : (
                      <>
                        <b>Request:</b> {shortId(selected.request_id)} • {selected.route}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-foreground/60">
                Tip: Select an incident → Generate analysis → View trace in Datadog.
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setChatResult(null)}>
                  Clear
                </Button>
                <Button className="rounded-xl" onClick={runChat} disabled={chatBusy}>
                  {chatBusy ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Running…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" /> Generate
                    </>
                  )}
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {chatErr ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm"
                >
                  <div className="font-semibold text-rose-700 dark:text-rose-300">
                    Chat failed
                  </div>
                  <div className="mt-1 text-foreground/80">{chatErr}</div>
                  <div className="mt-2 text-xs text-foreground/70">
                    If you’re seeing “Could not import module main”, run uvicorn from the folder
                    containing main.py (or set --app-dir).
                  </div>
                </motion.div>
              ) : null}

              {chatResult ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Response</div>
                      <div className="mt-1 text-xs text-foreground/70">
                        request_id: <span className="font-mono">{shortId(chatResult.request_id)}</span>
                      </div>
                    </div>
                    <Pill tone={chatResult.safe_mode ? "warning" : "secondary"}>
                      {chatResult.safe_mode ? "SAFE" : "normal"}
                    </Pill>
                  </div>
                  
                  {/* LLM Observability Stats */}
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                      <div className="text-[10px] md:text-xs text-foreground/60">Latency</div>
                      <div className="text-xs md:text-sm font-semibold font-mono">{fmtMs(chatResult.latency_ms)}</div>
                    </div>
                    <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                      <div className="text-[10px] md:text-xs text-foreground/60">Input</div>
                      <div className="text-xs md:text-sm font-semibold font-mono">{chatResult.tokens?.prompt_tokens?.toLocaleString() || "—"}</div>
                    </div>
                    <div className="rounded-lg md:rounded-xl border bg-muted/30 p-2 text-center">
                      <div className="text-[10px] md:text-xs text-foreground/60">Output</div>
                      <div className="text-xs md:text-sm font-semibold font-mono">{chatResult.tokens?.completion_tokens?.toLocaleString() || "—"}</div>
                    </div>
                    <div className="rounded-lg md:rounded-xl border bg-emerald-500/10 p-2 text-center">
                      <div className="text-[10px] md:text-xs text-foreground/60">Cost</div>
                      <div className="text-xs md:text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                        {fmtCost(chatResult.cost?.total_cost_usd)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 max-h-[45vh] overflow-auto rounded-xl border bg-muted/30 p-4 prose prose-sm dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-code:text-violet-400 prose-code:before:content-none prose-code:after:content-none max-w-none">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Custom code block styling
                        code: ({ node, inline, className, children, ...props }) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline ? (
                            <div className="relative group">
                              {match && (
                                <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wider text-white/40 font-mono">
                                  {match[1]}
                                </span>
                              )}
                              <pre className="!bg-black/60 !border-white/10 rounded-lg overflow-x-auto">
                                <code className={cn("text-sm font-mono", className)} {...props}>
                                  {children}
                                </code>
                              </pre>
                            </div>
                          ) : (
                            <code className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono text-sm" {...props}>
                              {children}
                            </code>
                          );
                        },
                        // Custom heading styling
                        h1: ({ children }) => (
                          <h1 className="text-xl font-bold mt-6 mb-3 text-foreground flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-violet-500" />
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-violet-400" />
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-base font-semibold mt-4 mb-2 text-foreground/90">{children}</h3>
                        ),
                        // Custom list styling
                        ul: ({ children }) => (
                          <ul className="space-y-1.5 my-3 ml-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="space-y-1.5 my-3 ml-1 list-decimal list-inside">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="flex items-start gap-2 text-foreground/80">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500/60 flex-shrink-0" />
                            <span>{children}</span>
                          </li>
                        ),
                        // Custom paragraph styling
                        p: ({ children }) => (
                          <p className="my-2 text-foreground/80 leading-relaxed">{children}</p>
                        ),
                        // Custom blockquote styling
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-violet-500/50 pl-4 my-3 text-foreground/70 italic">
                            {children}
                          </blockquote>
                        ),
                        // Custom strong/bold styling
                        strong: ({ children }) => (
                          <strong className="font-semibold text-foreground">{children}</strong>
                        ),
                        // Custom link styling
                        a: ({ href, children }) => (
                          <a 
                            href={href} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                          >
                            {children}
                          </a>
                        ),
                        // Custom table styling
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4">
                            <table className="min-w-full divide-y divide-border/50 text-sm">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left font-semibold text-foreground/90 bg-muted/50">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2 text-foreground/70 border-t border-border/30">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {chatResult.answer}
                    </ReactMarkdown>
                  </div>

                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Floating Action Button */}
      <motion.button
        className="fixed bottom-6 right-6 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/30 active:scale-95"
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          setChatOpen(true);
          setChatResult(null);
          setChatErr(null);
        }}
        style={{ 
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        <Sparkles className="h-6 w-6" />
      </motion.button>
    </FancyShell>
  );
}

// -----------------------------
// Small subcomponents
// -----------------------------
function DepRow({ name, health, hint }) {
  const tone =
    health === "ok" ? "success" : health === "degraded" ? "warning" : "destructive";
  return (
    <div className="flex items-start justify-between rounded-2xl border p-3">
      <div>
        <div className="text-sm font-semibold">{name}</div>
        <div className="mt-1 text-xs text-foreground/70">{hint}</div>
      </div>
      <Pill tone={tone}>{health}</Pill>
    </div>
  );
}

function RiskItem({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border p-3">
      <div className="rounded-xl bg-muted p-2">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-sm text-foreground/70">{desc}</div>
      </div>
    </div>
  );
}

function LineChartIcon() {
  return <LineChart className="mr-2 h-4 w-4" />;
}
