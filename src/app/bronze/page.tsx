"use client";

import { useCallback, useMemo, useState } from "react";
import {
  api,
  BronzeEntry,
  BronzeSummary,
  groupBronze,
  GroupedBronze,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  MetricCard,
  Expandable,
  StatusBadge,
  HealthDot,
  BarSegment,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

export default function BronzePage() {
  const { data, error, loading, refresh } = usePolling(
    useCallback(() => api.getBronze(), []),
    30_000
  );
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshCache();
    } catch {
      // ignore — still refresh local data
    } finally {
      await refresh();
      setRefreshing(false);
    }
  };

  const grouped = useMemo(
    () => (data?.entries ? groupBronze(data.entries) : []),
    [data?.entries]
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Bronze Cache"
        subtitle="Raw API response cache layer"
        action={
          <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Total Entries" value={summary?.total_entries || 0} />
        <MetricCard label="Unique Datasets" value={summary?.unique_datasets || 0} />
        <MetricCard
          label="Fresh"
          value={summary?.fresh_count || 0}
          status="healthy"
        />
        <MetricCard
          label="Stale"
          value={summary?.stale_count || 0}
          status={summary?.stale_count ? "degraded" : "healthy"}
        />
        <MetricCard label="TTL" value={`${summary?.ttl_hours || 0}h`} />
      </div>

      {/* Freshness bar */}
      {summary && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Overall Freshness</span>
            <span>
              {summary.total_entries > 0
                ? `${Math.round((summary.fresh_count / summary.total_entries) * 100)}%`
                : "—"}
            </span>
          </div>
          <BarSegment
            segments={[
              { value: summary.fresh_count, color: "bg-emerald-500", label: "Fresh" },
              { value: summary.stale_count, color: "bg-yellow-500", label: "Stale" },
            ]}
            height="h-2"
          />
        </div>
      )}

      {/* Grouped by source */}
      <div className="space-y-2">
        {grouped.map((group) => (
          <Expandable
            key={group.source}
            title={
              <div className="flex items-center gap-2">
                <HealthDot
                  status={
                    group.stale_count === 0
                      ? "healthy"
                      : group.stale_count > group.fresh_count
                      ? "error"
                      : "degraded"
                  }
                />
                <span>{group.source}</span>
              </div>
            }
            subtitle={`${group.total_entries} entries · avg ${group.avg_age_hours.toFixed(1)}h old`}
            right={
              <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span className="text-emerald-400">
                  {group.fresh_count} fresh
                </span>
                {group.stale_count > 0 && (
                  <span className="text-yellow-400">
                    {group.stale_count} stale
                  </span>
                )}
                <span className="font-mono">
                  {(group.total_bytes / 1024).toFixed(0)} KB
                </span>
              </div>
            }
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] uppercase border-b border-[var(--border)]">
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2">Dataset</th>
                  <th className="py-1.5 px-2">Fetched At</th>
                  <th className="py-1.5 px-2 text-right">Age (hrs)</th>
                  <th className="py-1.5 px-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {group.entries.map((entry, i) => (
                  <tr
                    key={i}
                    className="hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <td className="py-1.5 px-2">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="py-1.5 px-2 font-mono">
                      {entry.dataset_id}
                    </td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)]">
                      {entry.fetched_at
                        ? new Date(entry.fetched_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {entry.age_hours.toFixed(1)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      {(entry.response_bytes / 1024).toFixed(1)} KB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Expandable>
        ))}
      </div>
    </div>
  );
}
