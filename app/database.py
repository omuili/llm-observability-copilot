"""
Firestore Database Integration for LLM Observability Copilot

This module provides persistent storage for:
- Chat requests and responses
- Real-time metrics calculation
- Incident detection and tracking
- Time series data for dashboards
"""

import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import logging

try:
    from google.cloud import firestore
    from google.cloud.firestore_v1 import FieldFilter
    FIRESTORE_AVAILABLE = True
except ImportError:
    FIRESTORE_AVAILABLE = False
    firestore = None

logger = logging.getLogger("llm-copilot.database")

FIRESTORE_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", os.getenv("VERTEX_PROJECT", "llm-observability-copilot"))


REQUESTS_COLLECTION = "llm_requests"
INCIDENTS_COLLECTION = "llm_incidents"
METRICS_COLLECTION = "llm_metrics"


LATENCY_THRESHOLD_MS = 5000  
ERROR_RATE_THRESHOLD = 0.05 
COST_THRESHOLD_PER_REQUEST = 0.05 


@dataclass
class RequestRecord:
    """A single LLM request record."""
    request_id: str
    timestamp: datetime
    route: str
    model: str
    latency_ms: int
    ok: bool
    safe_mode: bool
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    session_id: Optional[str] = None
    message_len: int = 0
    answer_len: int = 0
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    input_cost_usd: float = 0.0
    output_cost_usd: float = 0.0
    total_cost_usd: float = 0.0
    hallucination_risk: float = 0.0  
    abuse_detected: bool = False
    abuse_type: Optional[str] = None  
    performance_score: float = 1.0  
    response_quality: float = 1.0  
    env: str = "dev"
    service: str = "llm-observability-copilot"


@dataclass
class Incident:
    """An incident record."""
    id: str
    title: str
    signal: str
    current: Any
    threshold: Any
    severity: str 
    status: str 
    description: str
    suggested_action: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    service: str = "llm-observability-copilot"
    env: str = "dev"


@dataclass
class MetricsSummary:
    """Summary metrics for the dashboard."""
    request_count: int
    ok_count: int
    error_count: int
    refusal_count: int
    ok_rate: float
    error_rate: float
    safe_rate: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    avg_latency_ms: float
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    avg_tokens_per_request: float
    total_cost_usd: float
    avg_cost_per_request: float
    requests_per_second: float
    open_incidents: int
    time_window_minutes: int

class FirestoreDB:
    """Firestore database client for LLM Observability."""
    
    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id or FIRESTORE_PROJECT
        self._db = None
        self._initialized = False
        
    @property
    def db(self):
        """Lazy initialization of Firestore client."""
        if self._db is None and FIRESTORE_AVAILABLE:
            try:
                self._db = firestore.Client(project=self.project_id)
                self._initialized = True
                logger.info(f"Firestore initialized for project: {self.project_id}")
            except Exception as e:
                logger.warning(f"Failed to initialize Firestore: {e}")
                self._initialized = False
        return self._db
    @property
    def is_available(self) -> bool:
        """Check if Firestore is available."""
        return FIRESTORE_AVAILABLE and self.db is not None
    def store_request(self, record: RequestRecord) -> bool:
        """Store a request record in Firestore."""
        if not self.is_available:
            logger.debug("Firestore not available, skipping store")
            return False
        
        try:
            doc_ref = self.db.collection(REQUESTS_COLLECTION).document(record.request_id)
            data = asdict(record)
            data['timestamp'] = record.timestamp
            doc_ref.set(data)
            logger.debug(f"Stored request {record.request_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to store request: {e}")
            return False
    
    def get_requests(
        self, 
        limit: int = 40, 
        since_minutes: int = 60,
        env: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get recent requests from Firestore."""
        if not self.is_available:
            return []
        
        try:
            since = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
            
            query = (
                self.db.collection(REQUESTS_COLLECTION)
                .where(filter=FieldFilter("timestamp", ">=", since))
                .order_by("timestamp", direction=firestore.Query.DESCENDING)
                .limit(limit)
            )
            
            if env:
                query = query.where(filter=FieldFilter("env", "==", env))
            
            docs = query.stream()
            
            results = []
            for doc in docs:
                data = doc.to_dict()
                if 'timestamp' in data and data['timestamp']:
                    data['ts'] = data['timestamp'].isoformat() if hasattr(data['timestamp'], 'isoformat') else str(data['timestamp'])
                else:
                    data['ts'] = datetime.now(timezone.utc).isoformat()
                
                results.append({
                    'request_id': data.get('request_id'),
                    'ts': data.get('ts'),
                    'route': data.get('route', 'POST /chat'),
                    'model': data.get('model', 'gemini-2.5-pro'),
                    'latency_ms': data.get('latency_ms', 0),
                    'ok': data.get('ok', True),
                    'safe_mode': data.get('safe_mode', False),
                    'trace_id': data.get('trace_id'),
                    'span_id': data.get('span_id'),
                    'session_id': data.get('session_id'),
                    'message_len': data.get('message_len', 0),
                    'answer_len': data.get('answer_len', 0),
                    'error_type': data.get('error_type'),
                    'tokens': {
                        'prompt_tokens': data.get('prompt_tokens', 0),
                        'completion_tokens': data.get('completion_tokens', 0),
                        'total_tokens': data.get('total_tokens', 0),
                    } if data.get('total_tokens', 0) > 0 else None,
                    'cost': {
                        'input_cost_usd': data.get('input_cost_usd', 0),
                        'output_cost_usd': data.get('output_cost_usd', 0),
                        'total_cost_usd': data.get('total_cost_usd', 0),
                    } if data.get('total_cost_usd', 0) > 0 else None,
                    'hallucination_risk': data.get('hallucination_risk', 0.0),
                    'abuse_detected': data.get('abuse_detected', False),
                    'abuse_type': data.get('abuse_type'),
                    'performance_score': data.get('performance_score', 1.0),
                    'response_quality': data.get('response_quality', 1.0),
                })
            
            return results
        except Exception as e:
            logger.error(f"Failed to get requests: {e}")
            return []
    
    def calculate_metrics(self, window_minutes: int = 60) -> MetricsSummary:
        """Calculate real-time metrics from stored requests."""
        if not self.is_available:
            return self._empty_metrics(window_minutes)
        
        try:
            since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
            
            query = (
                self.db.collection(REQUESTS_COLLECTION)
                .where(filter=FieldFilter("timestamp", ">=", since))
            )
            
            docs = list(query.stream())
            
            if not docs:
                return self._empty_metrics(window_minutes)
            
            latencies = []
            tokens = []
            costs = []
            prompt_tokens_list = []
            completion_tokens_list = []
            ok_count = 0
            error_count = 0
            refusal_count = 0
            
            for doc in docs:
                data = doc.to_dict()
                
                if data.get('latency_ms'):
                    latencies.append(data['latency_ms'])
                
                if data.get('total_tokens'):
                    tokens.append(data['total_tokens'])
                
                if data.get('total_cost_usd'):
                    costs.append(data['total_cost_usd'])
                
                if data.get('prompt_tokens'):
                    prompt_tokens_list.append(data['prompt_tokens'])
                if data.get('completion_tokens'):
                    completion_tokens_list.append(data['completion_tokens'])
                
                if data.get('ok'):
                    if data.get('safe_mode') and data.get('answer_len', 0) == 0:
                        refusal_count += 1
                    else:
                        ok_count += 1
                else:
                    error_count += 1
            
            total = len(docs)
            
            sorted_latencies = sorted(latencies) if latencies else [0]
            p50 = sorted_latencies[int(len(sorted_latencies) * 0.5)] if sorted_latencies else 0
            p95 = sorted_latencies[int(len(sorted_latencies) * 0.95)] if sorted_latencies else 0
            p99 = sorted_latencies[int(len(sorted_latencies) * 0.99)] if sorted_latencies else 0
            avg_latency = sum(latencies) / len(latencies) if latencies else 0
            
            total_tokens = sum(tokens)
            total_prompt_tokens = sum(prompt_tokens_list)
            total_completion_tokens = sum(completion_tokens_list)
            avg_tokens = total_tokens / len(tokens) if tokens else 0
            total_cost = sum(costs)
            avg_cost = total_cost / total if total > 0 else 0
            
            ok_rate = ok_count / total if total > 0 else 1.0
            error_rate = error_count / total if total > 0 else 0.0
            safe_rate = refusal_count / total if total > 0 else 0.0
            
            rps = 0
            if total > 1:
                timestamps = []
                for doc in docs:
                    data = doc.to_dict()
                    ts = data.get('timestamp')
                    if ts:
                        if hasattr(ts, 'timestamp'):
                            timestamps.append(ts.timestamp())
                        else:
                            try:
                                dt = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
                                timestamps.append(dt.timestamp())
                            except:
                                pass
                if len(timestamps) >= 2:
                    time_span_seconds = max(timestamps) - min(timestamps)
                    if time_span_seconds > 0:
                        rps = total / time_span_seconds
            elif total == 1:
                rps = 1 / 60 
            
            open_incidents = self.count_open_incidents()
            
            return MetricsSummary(
                request_count=total,
                ok_count=ok_count,
                error_count=error_count,
                refusal_count=refusal_count,
                ok_rate=ok_rate,
                error_rate=error_rate,
                safe_rate=safe_rate,
                p50_latency_ms=p50,
                p95_latency_ms=p95,
                p99_latency_ms=p99,
                avg_latency_ms=avg_latency,
                total_tokens=total_tokens,
                prompt_tokens=total_prompt_tokens,
                completion_tokens=total_completion_tokens,
                avg_tokens_per_request=avg_tokens,
                total_cost_usd=total_cost,
                avg_cost_per_request=avg_cost,
                requests_per_second=rps,
                open_incidents=open_incidents,
                time_window_minutes=window_minutes,
            )
        except Exception as e:
            logger.error(f"Failed to calculate metrics: {e}")
            return self._empty_metrics(window_minutes)
    
    def _empty_metrics(self, window_minutes: int) -> MetricsSummary:
        """Return empty metrics when no data available."""
        return MetricsSummary(
            request_count=0,
            ok_count=0,
            error_count=0,
            refusal_count=0,
            ok_rate=1.0,
            error_rate=0.0,
            safe_rate=0.0,
            p50_latency_ms=0,
            p95_latency_ms=0,
            p99_latency_ms=0,
            avg_latency_ms=0,
            total_tokens=0,
            prompt_tokens=0,
            completion_tokens=0,
            avg_tokens_per_request=0,
            total_cost_usd=0,
            avg_cost_per_request=0,
            requests_per_second=0,
            open_incidents=0,
            time_window_minutes=window_minutes,
        )
    
    def get_timeseries(
        self, 
        window_minutes: int = 60, 
        rollup_minutes: int = 1
    ) -> List[Dict[str, Any]]:
        """Get time series data for charts."""
        if not self.is_available:
            return []
        
        try:
            since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
            
            query = (
                self.db.collection(REQUESTS_COLLECTION)
                .where(filter=FieldFilter("timestamp", ">=", since))
                .order_by("timestamp")
            )
            
            docs = list(query.stream())
            
            if not docs:
                return []
            
            buckets = {}
            for doc in docs:
                data = doc.to_dict()
                ts = data.get('timestamp')
                if not ts:
                    continue
                
                if hasattr(ts, 'timestamp'):
                    dt = ts
                else:
                    dt = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
                
                bucket_minute = (dt.minute // rollup_minutes) * rollup_minutes
                bucket_key = dt.replace(minute=bucket_minute, second=0, microsecond=0)
                
                if bucket_key not in buckets:
                    buckets[bucket_key] = {
                        'latencies': [],
                        'errors': 0,
                        'total': 0,
                    }
                
                buckets[bucket_key]['total'] += 1
                if data.get('latency_ms'):
                    buckets[bucket_key]['latencies'].append(data['latency_ms'])
                if not data.get('ok'):
                    buckets[bucket_key]['errors'] += 1
            
            points = []
            for bucket_key in sorted(buckets.keys()):
                b = buckets[bucket_key]
                latencies = sorted(b['latencies']) if b['latencies'] else [0]
                p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
                err_rate = b['errors'] / b['total'] if b['total'] > 0 else 0
                rps = b['total'] / (rollup_minutes * 60) if rollup_minutes > 0 else 0
                
                points.append({
                    't': bucket_key.strftime('%H:%M'),
                    'timestamp': bucket_key.isoformat(),
                    'p95': p95,
                    'err': err_rate,
                    'rps': rps,
                    'count': b['total'],
                })
            
            return points
        except Exception as e:
            logger.error(f"Failed to get timeseries: {e}")
            return []
    
    
    def detect_and_store_incidents(self, metrics: MetricsSummary) -> List[Dict[str, Any]]:
        """Detect incidents based on metrics and store them."""
        incidents = []
        now = datetime.now(timezone.utc)
        if metrics.p95_latency_ms > LATENCY_THRESHOLD_MS:
            incident = Incident(
                id=f"latency-{now.strftime('%Y%m%d%H%M')}",
                title=f"High latency detected (p95: {int(metrics.p95_latency_ms)}ms)",
                signal="p95_latency_ms",
                current=f"{int(metrics.p95_latency_ms)}ms",
                threshold=f"{LATENCY_THRESHOLD_MS}ms",
                severity="high" if metrics.p95_latency_ms > LATENCY_THRESHOLD_MS * 1.5 else "medium",
                status="open",
                description=f"p95 latency ({int(metrics.p95_latency_ms)}ms) exceeds threshold ({LATENCY_THRESHOLD_MS}ms). Users may experience slow responses.",
                suggested_action="Check Vertex AI/Gemini dependency spans; verify network latency; consider reducing max output tokens.",
                created_at=now,
            )
            incidents.append(incident)
            self._store_incident(incident)
        
        # Check error rate threshold
        if metrics.error_rate > ERROR_RATE_THRESHOLD:
            incident = Incident(
                id=f"errors-{now.strftime('%Y%m%d%H%M')}",
                title=f"Elevated error rate ({metrics.error_rate*100:.1f}%)",
                signal="error_rate",
                current=f"{metrics.error_rate*100:.1f}%",
                threshold=f"{ERROR_RATE_THRESHOLD*100:.0f}%",
                severity="high" if metrics.error_rate > ERROR_RATE_THRESHOLD * 2 else "medium",
                status="open",
                description=f"Error rate ({metrics.error_rate*100:.1f}%) exceeds threshold ({ERROR_RATE_THRESHOLD*100:.0f}%). Users experiencing failures.",
                suggested_action="Inspect error logs; validate API credentials; check Vertex AI quota limits.",
                created_at=now,
            )
            incidents.append(incident)
            self._store_incident(incident)
        
        if metrics.avg_cost_per_request > COST_THRESHOLD_PER_REQUEST:
            incident = Incident(
                id=f"cost-{now.strftime('%Y%m%d%H%M')}",
                title=f"High cost per request (${metrics.avg_cost_per_request:.4f})",
                signal="avg_cost_per_request",
                current=f"${metrics.avg_cost_per_request:.4f}",
                threshold=f"${COST_THRESHOLD_PER_REQUEST:.2f}",
                severity="medium" if metrics.avg_cost_per_request < COST_THRESHOLD_PER_REQUEST * 2 else "high",
                status="open",
                description=f"Average cost per request (${metrics.avg_cost_per_request:.4f}) exceeds threshold. Budget may be impacted.",
                suggested_action="Review prompt lengths; implement response caching; enforce max_tokens limits.",
                created_at=now,
            )
            incidents.append(incident)
            self._store_incident(incident)
        
        return [self._incident_to_dict(i) for i in incidents]
    
    def _store_incident(self, incident: Incident) -> bool:
        """Store an incident in Firestore."""
        if not self.is_available:
            return False
        
        try:
            existing = (
                self.db.collection(INCIDENTS_COLLECTION)
                .where(filter=FieldFilter("signal", "==", incident.signal))
                .where(filter=FieldFilter("status", "==", "open"))
                .limit(1)
                .stream()
            )
            
            if list(existing):
                logger.debug(f"Similar open incident exists for {incident.signal}, skipping")
                return False
            
            doc_ref = self.db.collection(INCIDENTS_COLLECTION).document(incident.id)
            doc_ref.set(asdict(incident))
            logger.info(f"Created incident: {incident.title}")
            return True
        except Exception as e:
            logger.error(f"Failed to store incident: {e}")
            return False
    
    def get_incidents(self, limit: int = 20, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get incidents from Firestore."""
        if not self.is_available:
            return []
        
        try:
            query = (
                self.db.collection(INCIDENTS_COLLECTION)
                .order_by("created_at", direction=firestore.Query.DESCENDING)
                .limit(limit)
            )
            
            if status:
                query = query.where(filter=FieldFilter("status", "==", status))
            
            docs = query.stream()
            
            return [self._incident_to_dict_from_doc(doc.to_dict()) for doc in docs]
        except Exception as e:
            logger.error(f"Failed to get incidents: {e}")
            return []
    
    def count_open_incidents(self) -> int:
        """Count open incidents."""
        if not self.is_available:
            return 0
        
        try:
            query = (
                self.db.collection(INCIDENTS_COLLECTION)
                .where(filter=FieldFilter("status", "==", "open"))
            )
            return len(list(query.stream()))
        except Exception as e:
            logger.error(f"Failed to count incidents: {e}")
            return 0
    
    def _incident_to_dict(self, incident: Incident) -> Dict[str, Any]:
        """Convert incident to frontend format."""
        return {
            'id': incident.id,
            'title': incident.title,
            'signal': incident.signal,
            'current': incident.current,
            'threshold': incident.threshold,
            'severity': incident.severity,
            'status': incident.status,
            'description': incident.description,
            'suggested_action': incident.suggested_action,
            'created_at': incident.created_at.isoformat(),
            'service': incident.service,
            'env': incident.env,
        }
    
    def _incident_to_dict_from_doc(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Firestore document to frontend format."""
        created_at = data.get('created_at')
        if hasattr(created_at, 'isoformat'):
            created_at = created_at.isoformat()
        elif created_at:
            created_at = str(created_at)
        else:
            created_at = datetime.now(timezone.utc).isoformat()
        
        return {
            'id': data.get('id'),
            'title': data.get('title'),
            'signal': data.get('signal'),
            'current': data.get('current'),
            'threshold': data.get('threshold'),
            'severity': data.get('severity', 'medium'),
            'status': data.get('status', 'open'),
            'description': data.get('description', ''),
            'suggested_action': data.get('suggested_action', ''),
            'created_at': created_at,
            'service': data.get('service', 'llm-observability-copilot'),
            'env': data.get('env', 'dev'),
        }
    
    def resolve_incident(self, incident_id: str) -> bool:
        """Mark an incident as resolved."""
        if not self.is_available:
            return False
        
        try:
            doc_ref = self.db.collection(INCIDENTS_COLLECTION).document(incident_id)
            doc_ref.update({
                'status': 'resolved',
                'resolved_at': datetime.now(timezone.utc),
            })
            return True
        except Exception as e:
            logger.error(f"Failed to resolve incident: {e}")
            return False


db = FirestoreDB()

