/**
 * API client for the Data Pipeline Observatory backend.
 * Uses relative URLs — Next.js server proxies /api/* to the FastAPI backend.
 * Configure INTERNAL_API_URL in .env.local (dev) or docker-compose (prod).
 */

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────

export interface Source {
  id: string;
  source_name: string;
  file: string;
  adapter?: string;
  base_url?: string;
  dataset_count: number;
  datasets: string[];
  total_records?: number;
  last_updated?: string;
  first_ingested?: string;
  error?: string;
}

/** Client-side grouped source for overview / sources page */
export interface GroupedSource {
  source_name: string;
  adapter?: string;
  configs: Source[];
  total_datasets: number;
  total_records: number;
  last_updated: string | null;
  first_ingested: string | null;
  has_errors: boolean;
}

export interface TableStat {
  schema: string;
  table: string;
  row_count: number;
  last_updated: string | null;
}

export interface RunSummary {
  run_id: string;
  timestamp: string;
  file: string;
  file_size: number;
  status: "success" | "partial" | "failed";
  tables_count: number;
  total_records: number;
  record_counts: Record<string, number>;
  error_count: number;
}

export interface RunDetail {
  run_id: string;
  timestamp: string;
  content: string;
  parsed: {
    tables: string[];
    record_counts: Record<string, number>;
    total_records: number;
    errors: string[];
  };
}

export interface BronzeEntry {
  source: string;
  dataset_id: string;
  adapter: string;
  fetched_at: string;
  response_bytes: number;
  age_hours: number;
  ttl_hours: number;
  is_fresh: boolean;
  is_latest: boolean;
  status: "fresh" | "stale";
}

export interface BronzeSummary {
  total_entries: number;
  unique_datasets: number;
  fresh_count: number;
  stale_count: number;
  ttl_hours: number;
  sources: string[];
}

/** Client-side grouped bronze for bronze page */
export interface GroupedBronze {
  source: string;
  entries: BronzeEntry[];
  total_entries: number;
  fresh_count: number;
  stale_count: number;
  avg_age_hours: number;
  total_bytes: number;
}

export interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
  truncated: boolean;
}

export interface SchemaTable {
  schema: string;
  table: string;
  columns: { name: string; type: string }[];
}

export interface TableQuality {
  table: string;
  schema: string;
  row_count: number;
  null_rates: Record<string, number | null>;
  duplicate_count: number;
  date_range: Record<string, { min: string | null; max: string | null }>;
  column_count: number;
}

export interface DbtResults {
  has_results: boolean;
  models: DbtEntry[];
  tests: DbtEntry[];
  summary: { total: number; pass: number; error: number; fail: number; warn: number; skip: number };
  elapsed_time?: number;
  metadata?: Record<string, string>;
  error?: string;
}

export interface DbtEntry {
  unique_id: string;
  status: string;
  execution_time: number;
  message: string;
}

// ─── Prediction Markets ─────────────────────────────────────

export interface PredictionMarket {
  id: string;
  source: "polymarket" | "kalshi";
  market_id: string;
  title: string;
  category: string;
  event_id: string | null;
  event_title: string | null;
  event_subtitle: string | null;
  contract_label: string | null;
  event_volume_usd: number | null;
  outcome: string;
  probability: number; // 0.0 – 1.0
  volume_usd: number;
  open_interest_usd: number;
  close_time: string;
  snapshot_time: string;
  fetched_at: string;
  resolved: boolean;
  resolution: string | null;
  market_url: string | null;
}

export interface PredictionMarketEvent {
  source: "polymarket" | "kalshi";
  event_id: string;
  event_title: string;
  event_subtitle: string | null;
  event_url: string | null;
  category: string;
  total_volume_usd: number;
  market_count: number;
  latest_snapshot_time: string | null;
  markets: PredictionMarket[];
}

export interface PredictionMarketEventHistorySeries {
  market_id: string;
  title: string;
  label: string;
  outcome: string | null;
  latest_probability: number;
  latest_volume_usd: number;
  snapshots: PredictionMarketEventSnapshot[];
}

export interface PredictionMarketEventHistory {
  event: Omit<PredictionMarketEvent, "markets">;
  series: PredictionMarketEventHistorySeries[];
}

export interface PredictionMarketEventSnapshot {
  market_id: string;
  probability: number;
  volume_usd: number;
  open_interest_usd: number;
  snapshot_time: string;
  fetched_at: string;
}

export interface CategoryVolumeHistoryPoint {
  snapshot_date: string;
  category: string;
  total_volume_usd: number;
}

export interface CategoryVolumeHistory {
  categories: string[];
  points: CategoryVolumeHistoryPoint[];
}

export interface MarketSnapshot {
  id: string;
  market_id: string;
  probability: number;
  volume_usd: number;
  open_interest_usd: number;
  snapshot_time: string;
  fetched_at: string;
}

export interface PMSummary {
  total_markets: number;
  avg_probability: number;
  total_volume_usd: number;
  source_count: number;
  category_count: number;
  latest_snapshot_time: string | null;
  sources: string[];
  top_volume_markets: PredictionMarket[];
  high_conviction_count: number;
  closing_this_week: number;
}

export interface MarketsPage {
  markets: PredictionMarket[];
  total: number;
  limit: number;
  offset: number;
}

export interface DbtCommandResult {
  command: string;
  returncode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

export function groupSources(sources: Source[]): GroupedSource[] {
  const map = new Map<string, Source[]>();
  for (const s of sources) {
    const key = s.source_name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries())
    .map(([name, configs]) => {
      const allDates = configs
        .map((c) => c.last_updated)
        .filter(Boolean) as string[];
      const firstDates = configs
        .map((c) => c.first_ingested)
        .filter(Boolean) as string[];
      return {
        source_name: name,
        adapter: configs[0]?.adapter,
        configs,
        total_datasets: configs.reduce((s, c) => s + c.dataset_count, 0),
        total_records: configs.reduce((s, c) => s + (c.total_records || 0), 0),
        last_updated: allDates.length
          ? allDates.sort().reverse()[0]
          : null,
        first_ingested: firstDates.length
          ? firstDates.sort()[0]
          : null,
        has_errors: configs.some((c) => !!c.error),
      };
    })
    .sort((a, b) => a.source_name.localeCompare(b.source_name));
}

export function groupBronze(entries: BronzeEntry[]): GroupedBronze[] {
  const map = new Map<string, BronzeEntry[]>();
  for (const e of entries) {
    if (!e.is_latest) continue;
    const key = e.source;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .map(([source, entries]) => ({
      source,
      entries,
      total_entries: entries.length,
      fresh_count: entries.filter((e) => e.is_fresh).length,
      stale_count: entries.filter((e) => !e.is_fresh).length,
      avg_age_hours:
        entries.reduce((s, e) => s + e.age_hours, 0) / entries.length,
      total_bytes: entries.reduce((s, e) => s + e.response_bytes, 0),
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

// ─── API functions ────────────────────────────────────────

export const api = {
  health: () => fetchApi<{ status: string }>("/api/health"),

  // Sources
  getSources: () => fetchApi<Source[]>("/api/sources"),
  getSource: (id: string) => fetchApi<Record<string, unknown>>(`/api/sources/${id}`),
  getSourceStats: (id: string) => fetchApi<Record<string, unknown>>(`/api/sources/${id}/stats`),

  // Tables
  getTables: () => fetchApi<TableStat[]>("/api/tables"),
  getTableQuality: (table: string) => fetchApi<TableQuality>(`/api/tables/${table}/quality`),

  // Runs
  getRuns: (limit = 50) => fetchApi<RunSummary[]>(`/api/runs?limit=${limit}`),
  getRun: (id: string) => fetchApi<RunDetail>(`/api/runs/${id}`),

  // Pipeline control
  triggerRun: (incremental = true, source_filter?: string) =>
    fetchApi<Record<string, unknown>>("/api/pipeline/run", {
      method: "POST",
      body: JSON.stringify({ incremental, source_filter }),
    }),
  triggerSourceRun: (sourceId: string) =>
    fetchApi<Record<string, unknown>>(`/api/pipeline/run/${sourceId}`, { method: "POST" }),
  dropSource: (sourceId: string) =>
    fetchApi<Record<string, unknown>>(`/api/pipeline/drop/${sourceId}`, { method: "POST" }),
  getPipelineStatus: () =>
    fetchApi<{ status: string; output_lines: number; last_lines: string[] }>("/api/pipeline/status"),

  // Bronze
  getBronze: () => fetchApi<{ summary: BronzeSummary; entries: BronzeEntry[] }>("/api/bronze"),
  getBronzeSummary: () => fetchApi<BronzeSummary>("/api/bronze/summary"),
  refreshBronze: (sourceId: string) =>
    fetchApi<Record<string, unknown>>(`/api/bronze/refresh/${sourceId}`, { method: "POST" }),

  // Query
  executeQuery: (sql: string, limit = 1000) =>
    fetchApi<QueryResult>("/api/query", {
      method: "POST",
      body: JSON.stringify({ sql, limit }),
    }),
  getSchema: () => fetchApi<SchemaTable[]>("/api/schema"),
  getTableSchema: (table: string) => fetchApi<Record<string, unknown>>(`/api/schema/${table}`),

  // Prediction Markets
  getPMSummary: () => fetchApi<PMSummary>("/api/prediction-markets/summary"),
  getMarkets: (params?: {
    category?: string;
    resolved?: boolean;
    source?: string;
    limit?: number;
    offset?: number;
    sort_by?: "probability" | "volume_usd" | "close_time" | "snapshot_time";
    sort_dir?: "asc" | "desc";
    time_horizon?: "all" | "upcoming" | "past";
    min_volume?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set("category", params.category);
    if (params?.resolved !== undefined) q.set("resolved", String(params.resolved));
    if (params?.source) q.set("source", params.source);
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.offset !== undefined) q.set("offset", String(params.offset));
    if (params?.sort_by) q.set("sort_by", params.sort_by);
    if (params?.sort_dir) q.set("sort_dir", params.sort_dir);
    if (params?.time_horizon) q.set("time_horizon", params.time_horizon);
    if (params?.min_volume !== undefined && params.min_volume > 0) q.set("min_volume", String(params.min_volume));
    const qs = q.toString();
    return fetchApi<MarketsPage>(`/api/prediction-markets/markets${qs ? `?${qs}` : ""}`);
  },
  getCategoryStats: (params?: { source?: string }) => {
    const q = new URLSearchParams();
    if (params?.source) q.set("source", params.source);
    const qs = q.toString();
    return fetchApi<{
      category: string;
      count: number;
      event_count: number;
      avg_probability: number;
      total_volume_usd: number;
      polymarket_volume: number;
      kalshi_volume: number;
      high_conviction_count: number;
    }[]>(
      `/api/prediction-markets/category-stats${qs ? `?${qs}` : ""}`
    );
  },
  getCategoryVolumeHistory: (params?: { source?: string; categories_limit?: number; days?: number }) => {
    const q = new URLSearchParams();
    if (params?.source) q.set("source", params.source);
    if (params?.categories_limit !== undefined) q.set("categories_limit", String(params.categories_limit));
    if (params?.days !== undefined) q.set("days", String(params.days));
    const qs = q.toString();
    return fetchApi<CategoryVolumeHistory>(
      `/api/prediction-markets/category-volume-history${qs ? `?${qs}` : ""}`
    );
  },
  getMarket: (id: string) =>
    fetchApi<PredictionMarket>(`/api/prediction-markets/markets/${encodeURIComponent(id)}`),
  getMarketSnapshots: (id: string, since?: string, limit = 500) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (since) q.set("since", since);
    return fetchApi<MarketSnapshot[]>(
      `/api/prediction-markets/markets/${encodeURIComponent(id)}/snapshots?${q}`
    );
  },
  getMarketCategories: () =>
    fetchApi<string[]>("/api/prediction-markets/categories"),
  getTopMarkets: (params?: { limit?: number; min_volume?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.min_volume !== undefined) q.set("min_volume", String(params.min_volume));
    const qs = q.toString();
    return fetchApi<{ markets: PredictionMarket[]; total: number }>(
      `/api/prediction-markets/top-markets${qs ? `?${qs}` : ""}`
    );
  },
  getTopEvents: (params?: { limit?: number; min_volume?: number; source?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    if (params?.min_volume !== undefined) q.set("min_volume", String(params.min_volume));
    if (params?.source) q.set("source", params.source);
    const qs = q.toString();
    return fetchApi<{ events: PredictionMarketEvent[]; total: number }>(
      `/api/prediction-markets/top-events${qs ? `?${qs}` : ""}`
    );
  },
  getEvent: (source: string, eventId: string) =>
    fetchApi<PredictionMarketEvent>(
      `/api/prediction-markets/events/${encodeURIComponent(source)}/${encodeURIComponent(eventId)}`
    ),
  getEventHistory: (source: string, eventId: string, params?: { top_n?: number; points_per_series?: number }) => {
    const q = new URLSearchParams();
    if (params?.top_n !== undefined) q.set("top_n", String(params.top_n));
    if (params?.points_per_series !== undefined) q.set("points_per_series", String(params.points_per_series));
    const qs = q.toString();
    return fetchApi<PredictionMarketEventHistory>(
      `/api/prediction-markets/events/${encodeURIComponent(source)}/${encodeURIComponent(eventId)}/history${qs ? `?${qs}` : ""}`
    );
  },
  searchMarkets: (q: string, limit = 50) =>
    fetchApi<PredictionMarket[]>(
      `/api/prediction-markets/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  // dbt
  getDbtResults: () => fetchApi<DbtResults>("/api/dbt/results"),
  runDbt: (cmd: "run" | "test" = "run") =>
    fetchApi<DbtCommandResult>(`/api/dbt/${cmd}`, { method: "POST" }),

  // Cache
  refreshCache: () =>
    fetchApi<{ status: string }>("/api/cache/refresh", { method: "POST" }),

  // SSE
  streamUrl: `/api/pipeline/stream`,
};
