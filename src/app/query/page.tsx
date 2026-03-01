"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, QueryResult, SchemaTable } from "@/lib/api";
import { useSidebar } from "@/components/SidebarContext";
import {
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

// ─── Schema Browser (narrow, collapsible) ─────────────────
function SchemaBrowser({
  schema,
  onInsert,
  visible,
  onToggle,
}: {
  schema: SchemaTable[];
  onInsert: (text: string) => void;
  visible: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      {/* Toggle button always visible */}
      <button
        onClick={onToggle}
        className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
        title={visible ? "Hide schema" : "Show schema"}
      >
        {visible ? "◁ Schema" : "▷"}
      </button>

      {visible && (
        <div className="w-48 shrink-0 border-r border-[var(--border)] overflow-y-auto">
          <div className="pt-8 px-2 pb-2">
            <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-1">
              Tables ({schema.length})
            </h3>
            <div className="space-y-0.5">
              {schema.map((t) => (
                <div key={`${t.schema}.${t.table}`}>
                  <button
                    onClick={() =>
                      setExpanded(expanded === t.table ? null : t.table)
                    }
                    onDoubleClick={() => onInsert(`${t.schema}.${t.table}`)}
                    className="w-full text-left px-1.5 py-0.5 text-[11px] font-mono rounded hover:bg-[var(--bg-card-hover)] flex items-center gap-1"
                    title="Double-click to insert"
                  >
                    <span className="text-[var(--text-muted)] text-[10px]">
                      {expanded === t.table ? "▾" : "▸"}
                    </span>
                    <span className="truncate">{t.table}</span>
                  </button>
                  {expanded === t.table && (
                    <div className="ml-3 border-l border-[var(--border)] pl-1.5 py-0.5 space-y-0">
                      {t.columns.map((col) => (
                        <button
                          key={col.name}
                          onClick={() => onInsert(col.name)}
                          className="w-full text-left px-1 py-0 text-[10px] font-mono rounded hover:bg-[var(--bg-card-hover)] flex items-center justify-between gap-1"
                        >
                          <span className="truncate">{col.name}</span>
                          <span className="text-[9px] text-[var(--text-muted)] shrink-0">
                            {col.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Results Grid ──────────────────────────────────────────
function ResultsGrid({ result }: { result: QueryResult }) {
  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
          <tr>
            <th className="px-2 py-1.5 text-left text-[var(--text-muted)] font-medium border-b border-[var(--border)] w-8 text-[10px]">
              #
            </th>
            {result.columns.map((col, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-left text-[var(--text-muted)] font-medium border-b border-[var(--border)] whitespace-nowrap"
              >
                <div className="text-[11px]">{col}</div>
                <div className="text-[9px] font-normal opacity-50">
                  {result.column_types[i]}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr
              key={ri}
              className="hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <td className="px-2 py-0.5 text-[var(--text-muted)] border-b border-[var(--border)] font-mono text-[10px]">
                {ri + 1}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-2 py-0.5 border-b border-[var(--border)] font-mono text-[11px] whitespace-nowrap max-w-xs truncate"
                  title={String(cell ?? "")}
                >
                  {cell === null ? (
                    <span className="text-[var(--text-muted)] italic">NULL</span>
                  ) : (
                    String(cell)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SQL Editor ────────────────────────────────────────────
function SqlEditor({
  value,
  onChange,
  onExecute,
}: {
  value: string;
  onChange: (v: string) => void;
  onExecute: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onExecute();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = ref.current;
      if (ta) {
        const s = ta.selectionStart;
        const end = ta.selectionEnd;
        const nv = value.substring(0, s) + "  " + value.substring(end);
        onChange(nv);
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        }, 0);
      }
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className="w-full h-full bg-[var(--bg)] text-[var(--text)] font-mono text-sm p-3 resize-none outline-none border-0 leading-relaxed"
      placeholder="-- Write SQL here (⌘+Enter to run)&#10;SELECT * FROM macro_data.metadata LIMIT 10;"
      spellCheck={false}
    />
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function QueryPage() {
  const [sql, setSql] = useState("SELECT * FROM macro_data.metadata LIMIT 100;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaVisible, setSchemaVisible] = useState(true);
  const [history, setHistory] = useState<{ sql: string; ts: number }[]>([]);
  const [limit, setLimit] = useState(1000);

  useEffect(() => {
    api
      .getSchema()
      .then(setSchema)
      .catch(() => {})
      .finally(() => setSchemaLoading(false));
  }, []);

  const executeQuery = useCallback(async () => {
    if (!sql.trim() || executing) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await api.executeQuery(sql.trim(), limit);
      setResult(res);
      setHistory((p) => [{ sql: sql.trim(), ts: Date.now() }, ...p.slice(0, 29)]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
      setResult(null);
    } finally {
      setExecuting(false);
    }
  }, [sql, limit, executing]);

  const insertText = useCallback((text: string) => {
    setSql((p) => (p ? p + " " + text : text));
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] -m-6">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold">SQL Editor</h1>
          <span className="text-[10px] text-[var(--text-muted)]">
            Read-only · DuckDB
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={executeQuery} disabled={executing || !sql.trim()}>
            {executing ? "…" : "▶ Run"}
          </Button>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-[10px]"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1K</option>
            <option value={5000}>5K</option>
            <option value={10000}>10K</option>
          </select>
          <span className="text-[10px] text-[var(--text-muted)]">⌘+Enter</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Schema sidebar */}
        {schemaLoading ? (
          <div className="w-48 shrink-0 border-r border-[var(--border)] flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <SchemaBrowser
            schema={schema}
            onInsert={insertText}
            visible={schemaVisible}
            onToggle={() => setSchemaVisible((v) => !v)}
          />
        )}

        {/* Editor + results (vertical split) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor - compact */}
          <div className="h-28 border-b border-[var(--border)] shrink-0">
            <SqlEditor value={sql} onChange={setSql} onExecute={executeQuery} />
          </div>

          {/* Status bar */}
          {result && (
            <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border)] bg-[var(--bg-card)] text-[10px] text-[var(--text-muted)] shrink-0">
              <span>
                {result.row_count.toLocaleString()} rows
                {result.truncated && " (truncated)"}
                {" · "}
                {result.columns.length} columns
              </span>
              <span>{result.execution_time_ms.toFixed(1)}ms</span>
            </div>
          )}

          {/* Results - takes ALL remaining space */}
          <div className="flex-1 min-h-0 overflow-auto bg-[var(--bg-card)]">
            {error && (
              <div className="p-3">
                <ErrorMessage message={error} />
              </div>
            )}
            {result && !error && <ResultsGrid result={result} />}
            {!result && !error && !executing && (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs">
                Run a query to see results
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Query history drawer */}
      {history.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 shrink-0">
          <div className="flex gap-2 overflow-x-auto">
            {history.slice(0, 8).map((h, i) => (
              <button
                key={i}
                onClick={() => setSql(h.sql)}
                className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] whitespace-nowrap max-w-48 truncate shrink-0"
                title={h.sql}
              >
                {h.sql.slice(0, 60)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
