"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  Button,
  ErrorMessage,
  LoadingSpinner,
  MetricCard,
  PageHeader,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import {
  api,
  type PredictionMarket,
  type PredictionMarketEvent,
  type PredictionMarketEventHistory,
} from "@/lib/api";

const LINE_COLORS = ["#ff6b57", "#f5d56c", "#7cb7ff", "#3c73ff", "#a78bfa", "#22c55e"];

function fmtVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
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

function marketLabel(market: PredictionMarket): string {
  return market.contract_label || market.outcome || market.title;
}

function buildSeriesChartData(history?: PredictionMarketEventHistory) {
  if (!history) return [] as Array<Record<string, string | number>>;

  const rows = new Map<string, Record<string, string | number>>();
  for (const series of history.series) {
    for (const point of series.snapshots) {
      const row = rows.get(point.snapshot_time) ?? { snapshot_time: point.snapshot_time };
      row[series.market_id] = point.probability;
      rows.set(point.snapshot_time, row);
    }
  }

  return [...rows.values()].sort((a, b) =>
    String(a.snapshot_time).localeCompare(String(b.snapshot_time))
  );
}

export default function EventDetailPage() {
  const params = useParams<{ source: string; event_id: string }>();
  const source = decodeURIComponent(params.source);
  const eventId = decodeURIComponent(params.event_id);

  const fetchData = useCallback(async () => {
    const [event, history] = await Promise.all([
      api.getEvent(source, eventId),
      api.getEventHistory(source, eventId, { top_n: 4, points_per_series: 240 }),
    ]);
    return { event, history };
  }, [eventId, source]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 30_000);

  const event: PredictionMarketEvent | undefined = data?.event;
  const history: PredictionMarketEventHistory | undefined = data?.history;
  const chartData = buildSeriesChartData(history);
  const leadingMarket = event?.markets[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
      ) : !event ? (
        <ErrorMessage message="Event not found." />
      ) : (
        <>
          <PageHeader
            title={event.event_title}
            subtitle={[source, event.category, event.event_subtitle].filter(Boolean).join(" · ")}
            action={
              <div className="flex items-center gap-2">
                {event.event_url && (
                  <a href={event.event_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm">
                      {source === "polymarket" ? "Open on Polymarket ↗" : "Open on Kalshi ↗"}
                    </Button>
                  </a>
                )}
                <Button variant="secondary" size="sm" onClick={refresh} disabled={isRefreshing}>
                  {isRefreshing ? "Refreshing…" : "↻ Refresh"}
                </Button>
              </div>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Event Volume"
              value={fmtVolume(event.total_volume_usd)}
              subtitle="latest total across child contracts"
            />
            <MetricCard
              label="Contracts"
              value={event.market_count}
              subtitle="latest tracked contracts"
            />
            <MetricCard
              label="Leading Contract"
              value={leadingMarket ? `${Math.round(leadingMarket.probability * 100)}%` : "—"}
              subtitle={leadingMarket ? marketLabel(leadingMarket) : "—"}
            />
            <MetricCard
              label="Latest Snapshot"
              value={event.latest_snapshot_time ? fmtTime(event.latest_snapshot_time) : "—"}
              subtitle="most recent event update"
            />
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Top Outcome History
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Probability history for the leading contracts in this parent event
                </p>
              </div>
            </div>

            {chartData.length < 2 || !history || history.series.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                Not enough event history to display a chart yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="snapshot_time"
                    tickFormatter={(value) =>
                      new Date(String(value)).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(value) => `${Math.round((value as number) * 100)}%`}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: string) => [`${((value as number) * 100).toFixed(1)}%`, name]}
                    labelFormatter={(label) => fmtTime(String(label))}
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      fontSize: "11px",
                    }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {history.series.map((series, index) => (
                    <Line
                      key={series.market_id}
                      type="monotone"
                      dataKey={series.market_id}
                      name={series.label}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  All Contracts
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Latest probabilities for every tracked contract in this event
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {event.markets.map((market) => (
                <Link
                  key={market.market_id}
                  href={`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`}
                  className="block rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 hover:border-[var(--accent)]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{marketLabel(market)}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate">{market.title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-semibold tabular-nums">
                        {Math.round(market.probability * 100)}%
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        {fmtVolume(market.volume_usd)} vol
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}