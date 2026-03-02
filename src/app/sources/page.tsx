"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  api,
  Source,
  groupSources,
  GroupedSource,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import {
  PageHeader,
  HealthDot,
  Expandable,
  StatusBadge,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";

function SourcesInner() {
  const searchParams = useSearchParams();
  const highlightSource = searchParams.get("source");

  const { data, error, loading, isRefreshing, refresh } = usePolling<Source[]>(
    useCallback(() => api.getSources(), []),
    30_000
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const grouped = useMemo(
    () => (data ? groupSources(data) : []),
    [data]
  );

  const handleRunSource = async (sourceId: string) => {
    setActionLoading(sourceId);
    try {
      await api.triggerSourceRun(sourceId);
      setTimeout(refresh, 3000);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div>
      <PageHeader
        title="Sources"
        subtitle={`${grouped.length} sources · ${grouped.reduce((s, g) => s + g.total_datasets, 0)} total datasets`}
        action={
          <Button variant="secondary" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="space-y-2">
        {grouped.map((group) => (
          <Expandable
            key={group.source_name}
            defaultOpen={group.source_name === highlightSource}
            title={
              <div className="flex items-center gap-2">
                <HealthDot
                  status={group.has_errors ? "error" : "healthy"}
                />
                <span>{group.source_name}</span>
              </div>
            }
            subtitle={`${group.adapter || "—"} adapter`}
            right={
              <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span className="font-mono">
                  {group.total_datasets} dataset{group.total_datasets !== 1 ? "s" : ""}
                </span>
                <span className="font-mono">
                  {group.total_records.toLocaleString()} records
                </span>
                <span>
                  {group.last_updated
                    ? new Date(group.last_updated).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            }
          >
            {/* Series table for this source */}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] uppercase border-b border-[var(--border)]">
                    <th className="py-2 px-2">Config</th>
                    <th className="py-2 px-2">Datasets</th>
                    <th className="py-2 px-2 text-right">Records</th>
                    <th className="py-2 px-2">Last Updated</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {group.configs.map((cfg) => (
                    <tr
                      key={cfg.id}
                      className="hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <td className="py-2 px-2 font-mono">{cfg.id}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          {cfg.datasets.slice(0, 5).map((d) => (
                            <span
                              key={d}
                              className="bg-[var(--bg)] px-1.5 py-0.5 rounded text-[10px] font-mono"
                            >
                              {d}
                            </span>
                          ))}
                          {cfg.datasets.length > 5 && (
                            <span className="text-[var(--text-muted)]">
                              +{cfg.datasets.length - 5} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">
                        {(cfg.total_records || 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-[var(--text-muted)]">
                        {cfg.last_updated
                          ? new Date(cfg.last_updated).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2 px-2">
                        {cfg.error ? (
                          <StatusBadge status="error" />
                        ) : (
                          <StatusBadge status="healthy" />
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            handleRunSource(cfg.id);
                          }}
                          disabled={actionLoading === cfg.id}
                        >
                          {actionLoading === cfg.id ? "…" : "Run"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Expandable>
        ))}
      </div>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SourcesInner />
    </Suspense>
  );
}