/**
 * API client for the Data Pipeline Observatory backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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

  // dbt
  getDbtResults: () => fetchApi<DbtResults>("/api/dbt/results"),
  runDbt: (cmd: "run" | "test" = "run") =>
    fetchApi<DbtCommandResult>(`/api/dbt/${cmd}`, { method: "POST" }),

  // SSE
  streamUrl: `${API_BASE}/api/pipeline/stream`,
};
