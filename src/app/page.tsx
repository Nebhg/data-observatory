"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  Source,
  RunSummary,
  BronzeSummary,
  DbtResults,
  groupSources,
  GroupedSource,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  Card,
  MetricCard,
  HealthDot,
  BarSegment,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

// ─── Data fetcher ──────────────────────────────────────────
async function fetchOverview() {
  const [sources, runs, bronze, dbt] = await Promise.all([
    api.getSources(),
    api.getRuns(20),
    api.getBronzeSummary(),
    api.getDbtResults().catch(() => null),
  ]);
  return { sources, runs, bronze, dbt };
}

type OverviewData = {
  sources: Source[];
  runs: RunSummary[];
  bronze: BronzeSummary;
  dbt: DbtResults | null;
};

// ─── Component Status Card ────────────────────────────────
function ComponentCard({
  label,
  status,
  value,
  detail,
  onClick,
}: {
  label: string;
  status: "healthy" | "degraded" | "error" | "unknown";
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </span>
        <HealthDot status={status} />
      </div>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs text-[var(--text-muted)]">{detail}</span>
    </Card>
  );
}

// ─── Run History Bar ───────────────────────────────────────
function RunHistoryBar({ runs }: { runs: RunSummary[] }) {
  const last = runs.slice(0, 15).reverse();
  const successes = last.filter((r) => r.status === "success").length;
  const total = last.length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          Recent Runs
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {successes}/{total} successful
        </span>
      </div>
      <div className="flex gap-1 items-end h-8">
        {last.map((run, i) => {
          const color =
            run.status === "success"
              ? "bg-emerald-500"
              : run.status === "partial"
              ? "bg-yellow-500"
              : "bg-red-500";
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${color} min-w-[4px]`}
              style={{ height: `${Math.max(20, Math.min(100, (run.total_records / Math.max(...last.map(r => r.total_records || 1))) * 100))}%` }}
              title={`${run.timestamp}: ${run.status} (${run.total_records.toLocaleString()} records)`}
            />
          );
        })}
      </div>
    </Card>
  );
}

// ─── Source Health Grid ───────────────────────────────────
function SourceHealthGrid({ groups }: { groups: GroupedSource[] }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {groups.map((g) => {
        const status: "healthy" | "degraded" | "error" =
          g.has_errors ? "error" : "healthy";

        return (
          <Card
            key={g.source_name}
            onClick={() => {
              const id = g.configs[0]?.id;
              if (id) router.push(`/sources?source=${encodeURIComponent(g.source_name)}`);
            }}
            className="flex items-start gap-3"
          >
            <HealthDot status={status} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {g.source_name}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                <span>{g.total_datasets} dataset{g.total_datasets !== 1 ? "s" : ""}</span>
                <span className="text-[var(--border)]">·</span>
                <span>{g.total_records.toLocaleString()} records</span>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {g.last_updated
                  ? `Last: ${new Date(g.last_updated).toLocaleDateString()}`
                  : "No data yet"}
              </div>
            </div>
            {g.has_errors && (
              <span className="text-xs text-red-400 shrink-0">⚠</span>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function OverviewPage() {
  const { data, error, loading, refresh } = usePolling<OverviewData>(
    useCallback(() => fetchOverview(), []),
    30_000
  );
  const [actionLoading, setActionLoading] = useState(false);

  const grouped = useMemo(
    () => (data?.sources ? groupSources(data.sources) : []),
    [data?.sources]
  );

  const handleRun = async (full: boolean) => {
    setActionLoading(true);
    try {
      await api.triggerRun(!full);
      setTimeout(refresh, 2000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshStats = async () => {
    setActionLoading(true);
    try {
      await api.refreshCache();
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;

  const { runs, bronze, dbt } = data;
  const lastRun = runs[0];
  const totalRecords = grouped.reduce((s, g) => s + g.total_records, 0);

  // Compute statuses
  const bronzeStatus: "healthy" | "degraded" | "error" =
    bronze.stale_count === 0
      ? "healthy"
      : bronze.stale_count > bronze.fresh_count
      ? "error"
      : "degraded";

  const runStatus: "healthy" | "degraded" | "error" | "unknown" = lastRun
    ? lastRun.status === "success"
      ? "healthy"
      : lastRun.status === "partial"
      ? "degraded"
      : "error"
    : "unknown";

  const dbtStatus: "healthy" | "degraded" | "error" | "unknown" = dbt?.has_results
    ? dbt.summary.error > 0 || dbt.summary.fail > 0
      ? "error"
      : dbt.summary.warn > 0
      ? "degraded"
      : "healthy"
    : "unknown";

  return (
    <div>
      <PageHeader
        title="Pipeline Overview"
        subtitle="Real-time monitoring of the macro data pipeline"
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleRefreshStats}
              disabled={actionLoading}
            >
              Refresh Stats
            </Button>
            <Button
              onClick={() => handleRun(false)}
              disabled={actionLoading}
            >
              {actionLoading ? "Running…" : "Run Pipeline"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleRun(true)}
              disabled={actionLoading}
            >
              Full Refresh
            </Button>
          </div>
        }
      />

      {/* Component status row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <ComponentCard
          label="Sources"
          status="healthy"
          value={String(grouped.length)}
          detail={`${grouped.reduce((s, g) => s + g.total_datasets, 0)} datasets total`}
        />
        <ComponentCard
          label="Records"
          status="healthy"
          value={totalRecords.toLocaleString()}
          detail="across all sources"
        />
        <ComponentCard
          label="Last Run"
          status={runStatus}
          value={lastRun ? new Date(lastRun.timestamp).toLocaleDateString() : "—"}
          detail={lastRun ? lastRun.status : "no runs"}
          onClick={() => (window.location.href = "/runs")}
        />
        <ComponentCard
          label="Bronze Cache"
          status={bronzeStatus}
          value={`${bronze.fresh_count}/${bronze.total_entries}`}
          detail={bronze.stale_count > 0 ? `${bronze.stale_count} stale` : "all fresh"}
          onClick={() => (window.location.href = "/bronze")}
        />
        <ComponentCard
          label="dbt"
          status={dbtStatus}
          value={
            dbt?.has_results
              ? `${dbt.summary.pass}/${dbt.summary.total}`
              : "—"
          }
          detail={
            dbt?.has_results
              ? `${dbt.summary.pass} pass, ${dbt.summary.error + dbt.summary.fail} fail`
              : "not run"
          }
          onClick={() => (window.location.href = "/dbt")}
        />
      </div>

      {/* Run history visualization */}
      {runs.length > 0 && (
        <div className="mb-6">
          <RunHistoryBar runs={runs} />
        </div>
      )}

      {/* Source Health */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Source Health</h2>
        <span className="text-xs text-[var(--text-muted)]">
          Click a source for details
        </span>
      </div>
      <SourceHealthGrid groups={grouped} />
    </div>
  );
}
