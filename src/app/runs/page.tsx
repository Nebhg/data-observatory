"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { api, RunSummary } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  Card,
  StatusBadge,
  BarSegment,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

function RunChart({ runs }: { runs: RunSummary[] }) {
  const last30 = runs.slice(0, 30).reverse();
  const maxRecords = Math.max(...last30.map((r) => r.total_records || 1), 1);

  const successCount = last30.filter((r) => r.status === "success").length;
  const partialCount = last30.filter((r) => r.status === "partial").length;
  const failedCount = last30.filter((r) => r.status === "failed").length;

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Run History</h3>
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {successCount} success
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> {partialCount} partial
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> {failedCount} failed
          </span>
        </div>
      </div>

      {/* Success rate bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
          <span>Success Rate</span>
          <span>
            {last30.length > 0
              ? `${Math.round((successCount / last30.length) * 100)}%`
              : "—"}
          </span>
        </div>
        <BarSegment
          segments={[
            { value: successCount, color: "bg-emerald-500", label: "Success" },
            { value: partialCount, color: "bg-yellow-500", label: "Partial" },
            { value: failedCount, color: "bg-red-500", label: "Failed" },
          ]}
          height="h-3"
        />
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-[2px] h-16">
        {last30.map((run, i) => {
          const pct = Math.max(8, (run.total_records / maxRecords) * 100);
          const color =
            run.status === "success"
              ? "bg-emerald-500"
              : run.status === "partial"
              ? "bg-yellow-500"
              : "bg-red-500";
          return (
            <Link
              key={i}
              href={`/runs/${run.run_id}`}
              className={`flex-1 rounded-t-sm ${color} hover:opacity-80 transition-opacity min-w-[3px]`}
              style={{ height: `${pct}%` }}
              title={`${new Date(run.timestamp).toLocaleString()}\n${run.status} · ${run.total_records.toLocaleString()} records`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
        <span>
          {last30.length > 0
            ? new Date(last30[0].timestamp).toLocaleDateString()
            : ""}
        </span>
        <span>
          {last30.length > 0
            ? new Date(last30[last30.length - 1].timestamp).toLocaleDateString()
            : ""}
        </span>
      </div>
    </Card>
  );
}

export default function RunsPage() {
  const { data, error, loading, isRefreshing, refresh } = usePolling<RunSummary[]>(
    useCallback(() => api.getRuns(50), []),
    30_000
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const runs = data || [];

  return (
    <div>
      <PageHeader
        title="Runs"
        subtitle={`${runs.length} pipeline runs`}
        action={
          <Button variant="secondary" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Visualization */}
      {runs.length > 0 && <RunChart runs={runs} />}

      {/* Runs table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3 text-right">Tables</th>
                <th className="py-3 px-3 text-right">Records</th>
                <th className="py-3 px-3 text-right">Errors</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {runs.map((run) => (
                <tr
                  key={run.run_id}
                  className="hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="py-2 px-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {new Date(run.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {run.tables_count}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {run.total_records.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {run.error_count > 0 ? (
                      <span className="text-red-400">{run.error_count}</span>
                    ) : (
                      <span className="text-[var(--text-muted)]">0</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Link
                      href={`/runs/${run.run_id}`}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
