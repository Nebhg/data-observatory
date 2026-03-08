"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  PageHeader,
  Card,
  Button,
  LoadingSpinner,
  ErrorMessage,
  MetricCard,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import { api, PredictionMarket, MarketSnapshot } from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Custom tooltip for the probability chart ─────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { snapshot_time: string; volume_usd: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-[var(--text)]">
        {(p.value * 100).toFixed(2)}%
      </p>
      <p className="text-[var(--text-muted)]">{fmtTime(p.payload.snapshot_time)}</p>
      <p className="text-[var(--text-muted)]">{fmtVolume(p.payload.volume_usd)} vol</p>
    </div>
  );
}

// ─── Detail page ──────────────────────────────────────────

export default function MarketDetailPage() {
  const { market_id } = useParams<{ market_id: string }>();
  const searchParams = useSearchParams();
  const source = searchParams.get("source") ?? "";

  const decodedId = decodeURIComponent(market_id);

  const fetchData = useCallback(async () => {
    const [market, snapshots] = await Promise.all([
      api.getMarket(decodedId),
      api.getMarketSnapshots(decodedId, undefined, 500),
    ]);
    return { market, snapshots };
  }, [decodedId]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 30_000);

  const market: PredictionMarket | undefined = data?.market;
  const snapshots: MarketSnapshot[] = data?.snapshots ?? [];

  // Probability over time: downsample to max 200 points for perf
  const chartData =
    snapshots.length > 200
      ? snapshots.filter((_, i) => i % Math.ceil(snapshots.length / 200) === 0)
      : snapshots;

  const latestProb = market?.probability ?? 0;
  const probPct = (latestProb * 100).toFixed(1);

  const probColor =
    latestProb >= 0.7
      ? "text-[var(--success)]"
      : latestProb >= 0.4
      ? "text-[var(--accent)]"
      : "text-[var(--error)]";

  const closeDate = market ? new Date(market.close_time) : null;
  const isExpired = closeDate ? closeDate < new Date() : false;

  // Stats across snapshots
  const probValues = snapshots.map((s) => s.probability);
  const minProb = probValues.length ? Math.min(...probValues) : 0;
  const maxProb = probValues.length ? Math.max(...probValues) : 0;
  const avgProb = probValues.length
    ? probValues.reduce((a, b) => a + b, 0) / probValues.length
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back nav */}
      <Link
        href="/markets"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        ← Back to Markets
      </Link>

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : !market ? (
        <ErrorMessage message="Market not found." />
      ) : (
        <>
          {/* Header */}
          <PageHeader
            title={market.title}
            subtitle={
              [
                source || market.source,
                market.category,
                market.outcome,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={refresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing…" : "↻ Refresh"}
              </Button>
            }
          />

          {/* Status banner */}
          {market.resolved && (
            <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">
              ✓ Resolved
              {market.resolution ? ` — ${market.resolution}` : ""}
            </div>
          )}
          {!market.resolved && isExpired && (
            <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">
              ⚠ Market has passed its close date and is pending resolution.
            </div>
          )}

          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Current Probability"
              value={`${probPct}%`}
              subtitle="latest snapshot"
            />
            <MetricCard
              label="Volume"
              value={fmtVolume(market.volume_usd)}
              subtitle="cumulative USD"
            />
            <MetricCard
              label="Open Interest"
              value={fmtVolume(market.open_interest_usd)}
              subtitle="USD"
            />
            <MetricCard
              label="Closes"
              value={closeDate ? closeDate.toLocaleDateString() : "—"}
              subtitle={isExpired ? "expired" : "upcoming"}
              status={isExpired ? "degraded" : "healthy"}
            />
          </div>

          {/* Probability chart */}
          <Card>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-4">
              Probability Over Time
              <span className="ml-2 font-normal normal-case">
                ({snapshots.length.toLocaleString()} snapshots)
              </span>
            </p>
            {chartData.length < 2 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                Not enough snapshot history to display a chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={chartData}
                  margin={{ top: 4, right: 8, bottom: 0, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="snapshot_time"
                    tickFormatter={(v) =>
                      new Date(v).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0.5} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="probability"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "var(--accent)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Historical stats */}
          {snapshots.length > 1 && (
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Min Probability"
                value={`${(minProb * 100).toFixed(1)}%`}
                subtitle="historical low"
              />
              <MetricCard
                label="Avg Probability"
                value={`${(avgProb * 100).toFixed(1)}%`}
                subtitle="across all snapshots"
              />
              <MetricCard
                label="Max Probability"
                value={`${(maxProb * 100).toFixed(1)}%`}
                subtitle="historical high"
              />
            </div>
          )}

          {/* Latest snapshot info */}
          <Card>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Details
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ["Market ID", market.market_id],
                ["Source", market.source],
                ["Category", market.category],
                ["Outcome", market.outcome],
                ["Status", market.resolved ? "Resolved" : "Active"],
                ["Resolution", market.resolution ?? "—"],
                [
                  "Snapshot time",
                  market.snapshot_time ? fmtTime(market.snapshot_time) : "—",
                ],
                [
                  "Fetched at",
                  market.fetched_at ? fmtTime(market.fetched_at) : "—",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-[var(--text-muted)] shrink-0 w-32">{label}</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
            {market.market_url && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <a
                  href={market.market_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  View on {market.source === "polymarket" ? "Polymarket" : "Kalshi"} ↗
                </a>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
