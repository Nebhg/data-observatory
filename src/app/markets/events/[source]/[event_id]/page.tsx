"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
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
const LOOKBACK_OPTIONS = [30, 120, 365] as const;
const INTERVAL_OPTIONS = ["hour", "day", "week"] as const;

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

function normalizeExternalUrl(source: string, url: string | null, eventId?: string | null): string | null {
  if (!url) return null;
  if (source !== "kalshi") return url;
  const ticker = (eventId || "").toLowerCase().replace(/-\d{2}[a-z]{3}\d{0,4}$/i, "").replace(/-\d{2,4}$/i, "");
  return ticker ? `https://kalshi.com/markets/${ticker}` : url;
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

function buildSnapshotBarData(event?: PredictionMarketEvent) {
  if (!event) return [] as Array<{ label: string; probability: number }>;
  return event.markets.slice(0, 10).map((market) => ({
    label: marketLabel(market),
    probability: Math.round(market.probability * 1000) / 10,
  }));
}

export default function EventDetailPage() {
  const params = useParams<{ source: string; event_id: string }>();
  const source = decodeURIComponent(params.source);
  const eventId = decodeURIComponent(params.event_id);
  const [lookbackDays, setLookbackDays] = useState<number>(120);
  const [interval, setInterval] = useState<"hour" | "day" | "week">("day");
  const searchParamsHook = useSearchParams();
  const fromExplorer = searchParamsHook.get("from") === "explorer";

  const fetchData = useCallback(async () => {
    const [event, history] = await Promise.all([
      api.getEvent(source, eventId),
      api.getEventHistory(source, eventId, { top_n: 6, lookback_days: lookbackDays, interval }),
    ]);
    return { event, history };
  }, [eventId, interval, lookbackDays, source]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 30_000);

  const event: PredictionMarketEvent | undefined = data?.event;
  const history: PredictionMarketEventHistory | undefined = data?.history;
  const chartData = buildSeriesChartData(history);
  const snapshotBarData = buildSnapshotBarData(event);
  const leadingMarket = event?.markets[0];
  const hasAnySnapshots = history ? history.series.some((series) => series.snapshots.length > 0) : false;
  const hasEnoughForLine = !!history && history.series.some((series) => series.snapshots.length >= 2);
  const externalUrl = event ? normalizeExternalUrl(event.source, event.event_url, event.event_id) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Link
        href={fromExplorer ? "/markets?view=explorer" : "/markets"}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        ← {fromExplorer ? "Back to Explorer" : "Back to Markets"}
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
                {externalUrl && (
                  <a href={externalUrl} target="_blank" rel="noopener noreferrer">
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
              <div className="flex items-center gap-4 flex-wrap justify-end">
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Range</span>
                  {LOOKBACK_OPTIONS.map((days) => (
                    <button
                      key={days}
                      onClick={() => setLookbackDays(days)}
                      className={`px-2 py-1 rounded-full border ${lookbackDays === days ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                    >
                      {days === 30 ? "1M" : days === 120 ? "4M" : "1Y"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>Step</span>
                  {INTERVAL_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setInterval(option)}
                      className={`px-2 py-1 rounded-full border ${interval === option ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                    >
                      {option === "hour" ? "6h" : option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Line chart — shown when ≥1 series has 2+ snapshots */}
            {hasEnoughForLine && (
              <ResponsiveContainer width="100%" height={280}>
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
                  {history!.series.map((series, index) => (
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

            {/* Bar chart — current snapshot ranking, always shown when data available */}
            {snapshotBarData.length > 1 ? (
              <div className={hasEnoughForLine ? "pt-4 border-t border-[var(--border)] mt-4" : ""}>
                {hasEnoughForLine && (
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Current Ranking</p>
                )}
                {!hasEnoughForLine && !hasAnySnapshots && (
                  <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                    No tracked history is available for this event yet.
                  </div>
                )}
                {!hasEnoughForLine && hasAnySnapshots && (
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Not enough history for a trend line — showing current outcome ranking.
                  </p>
                )}
                <ResponsiveContainer width="100%" height={hasEnoughForLine ? 220 : 320}>
                  <BarChart data={snapshotBarData} layout="vertical" margin={{ top: 8, right: 20, left: 40, bottom: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={140}
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [`${value}%`, "Current probability"]}
                      contentStyle={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        fontSize: "11px",
                      }}
                    />
                    <Bar dataKey="probability" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              !hasEnoughForLine && (
                <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                  No tracked history is available for this event yet.
                </div>
              )
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