"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  PageHeader,
  MetricCard,
  Card,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import {
  api,
  type CategoryVolumeHistory,
  type PMSummary,
  type PredictionMarket,
  type PredictionMarketEvent,
  type MarketsPage as MarketsPageResult,
} from "@/lib/api";

type TopEventsResult = { events: PredictionMarketEvent[]; total: number };
type CategoryStat = {
  category: string;
  count: number;
  event_count: number;
  avg_probability: number;
  total_volume_usd: number;
  polymarket_volume: number;
  kalshi_volume: number;
  high_conviction_count: number;
};
type TimeHorizon = "all" | "upcoming" | "past";
type SortCol = "probability" | "volume_usd" | "close_time";

interface FilterState {
  hideResolved: boolean;
  sources: string[];
  categories: string[];
  timeHorizon: TimeHorizon;
  minVolume: number;
}

const DEFAULT_FILTERS: FilterState = {
  hideResolved: true,
  sources: [],
  categories: [],
  timeHorizon: "upcoming",
  minVolume: 0,
};

const VOLUME_PRESETS = [
  { label: "Any", value: 0 },
  { label: "$100K+", value: 100_000 },
  { label: "$1M+", value: 1_000_000 },
  { label: "$10M+", value: 10_000_000 },
];

const CATEGORY_COLORS = ["#f97316", "#38bdf8", "#22c55e", "#facc15", "#a78bfa", "#fb7185"];

function fmtVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function marketLabel(market: PredictionMarket): string {
  return market.contract_label || market.outcome || market.title;
}

function activeFilterCount(filters: FilterState): number {
  let count = 0;
  if (!filters.hideResolved) count++;
  if (filters.sources.length > 0) count++;
  if (filters.categories.length > 0) count++;
  if (filters.timeHorizon !== "upcoming") count++;
  if (filters.minVolume > 0) count++;
  return count;
}

function buildTrendRows(history: CategoryVolumeHistory): Array<Record<string, string | number>> {
  const rows = new Map<string, Record<string, string | number>>();
  for (const point of history.points) {
    const row = rows.get(point.snapshot_date) ?? { snapshot_date: point.snapshot_date };
    row[point.category] = point.total_volume_usd;
    rows.set(point.snapshot_date, row);
  }

  const ordered = [...rows.values()].sort((a, b) =>
    String(a.snapshot_date).localeCompare(String(b.snapshot_date))
  );

  for (const row of ordered) {
    for (const category of history.categories) {
      if (!(category in row)) {
        row[category] = 0;
      }
    }
  }

  return ordered;
}

function ProbBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70
      ? "bg-[var(--success)]"
      : pct >= 40
      ? "bg-[var(--accent)]"
      : "bg-[var(--error)]";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right">{fmtPct(value)}</span>
    </div>
  );
}

function CategoryOverviewGrid({ stats }: { stats: CategoryStat[] }) {
  if (stats.length === 0) return null;
  const totalVolume = stats.reduce((sum, stat) => sum + stat.total_volume_usd, 0) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Category Landscape
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Total volume, breadth, and conviction split across the full tracked universe
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {stats.map((stat) => {
          const share = stat.total_volume_usd / totalVolume;
          const convictionShare = stat.count > 0 ? stat.high_conviction_count / stat.count : 0;
          const dominantSource =
            stat.polymarket_volume > stat.kalshi_volume * 1.1
              ? "Polymarket"
              : stat.kalshi_volume > stat.polymarket_volume * 1.1
              ? "Kalshi"
              : "Mixed";
          const sourceSplit =
            stat.total_volume_usd > 0 ? stat.polymarket_volume / stat.total_volume_usd : 0;

          return (
            <div
              key={stat.category}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{titleCase(stat.category)}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {stat.event_count.toLocaleString()} events · {stat.count.toLocaleString()} contracts
                  </p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
                  {dominantSource}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Volume</p>
                  <p className="text-xl font-semibold mt-1">{fmtVolume(stat.total_volume_usd)}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {(share * 100).toFixed(0)}% of tracked volume
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Conviction</p>
                  <p className="text-xl font-semibold mt-1">{Math.round(convictionShare * 100)}%</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {stat.high_conviction_count.toLocaleString()} contracts at 70%+/30%-
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)]">
                  <span>Source split</span>
                  <span>
                    {fmtVolume(stat.polymarket_volume)} PM · {fmtVolume(stat.kalshi_volume)} KS
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-900 overflow-hidden flex">
                  <div className="h-full bg-sky-400" style={{ width: `${sourceSplit * 100}%` }} />
                  <div className="h-full bg-fuchsia-400" style={{ width: `${(1 - sourceSplit) * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryVolumeTrendChart({ history }: { history: CategoryVolumeHistory }) {
  if (history.categories.length === 0 || history.points.length === 0) return null;
  const rows = buildTrendRows(history);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Category Volume Trend
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Daily total volume by category using the latest snapshot per market each day
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="snapshot_date"
            tickFormatter={(value) =>
              new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(value) => fmtVolume(value as number)}
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            formatter={(value: unknown, name: string) => [fmtVolume(value as number), titleCase(name)]}
            labelFormatter={(label) =>
              new Date(`${label}T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
            contentStyle={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              fontSize: "11px",
            }}
          />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          {history.categories.map((category, index) => (
            <Line
              key={category}
              type="monotone"
              dataKey={category}
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterModal({
  open,
  onClose,
  filters,
  allCategories,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  allCategories: string[];
  onApply: (filters: FilterState) => void;
}) {
  const [draft, setDraft] = useState<FilterState>(filters);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function toggleSource(source: string) {
    setDraft((current) => ({
      ...current,
      sources: current.sources.includes(source)
        ? current.sources.filter((item) => item !== source)
        : [...current.sources, source],
    }));
  }

  function toggleCategory(category: string) {
    setDraft((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category],
    }));
  }

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{title}</p>
      {children}
    </div>
  );

  const Checkbox = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer text-sm select-none hover:text-[var(--text)] text-[var(--text-muted)]">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--accent)] w-3.5 h-3.5" />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-20 pr-6">
      <div
        ref={ref}
        className="w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl p-5 space-y-5 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none">
            ×
          </button>
        </div>

        <Section title="Status">
          <Checkbox
            checked={draft.hideResolved}
            onChange={() => setDraft((current) => ({ ...current, hideResolved: !current.hideResolved }))}
            label="Hide resolved markets"
          />
        </Section>

        <Section title="Time Horizon">
          {(["upcoming", "all", "past"] as TimeHorizon[]).map((timeHorizon) => (
            <label key={timeHorizon} className="flex items-center gap-2 cursor-pointer text-sm select-none hover:text-[var(--text)] text-[var(--text-muted)]">
              <input
                type="radio"
                name="timeHorizon"
                checked={draft.timeHorizon === timeHorizon}
                onChange={() => setDraft((current) => ({ ...current, timeHorizon }))}
                className="accent-[var(--accent)]"
              />
              {timeHorizon === "upcoming" ? "Upcoming / Active" : timeHorizon === "all" ? "All" : "Past / Resolved"}
            </label>
          ))}
        </Section>

        <Section title="Min Volume">
          <div className="flex flex-wrap gap-2">
            {VOLUME_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDraft((current) => ({ ...current, minVolume: preset.value }))}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  draft.minVolume === preset.value
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Source">
          {["polymarket", "kalshi"].map((source) => (
            <Checkbox
              key={source}
              checked={draft.sources.includes(source)}
              onChange={() => toggleSource(source)}
              label={source === "polymarket" ? "Polymarket" : "Kalshi"}
            />
          ))}
        </Section>

        {allCategories.length > 0 && (
          <Section title="Category">
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {allCategories.map((category) => (
                <Checkbox
                  key={category}
                  checked={draft.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  label={titleCase(category)}
                />
              ))}
            </div>
          </Section>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => setDraft(DEFAULT_FILTERS)}>
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function DataFreshnessBadge({ snapshotTime }: { snapshotTime: string | null }) {
  if (!snapshotTime) return null;
  const ageMs = Date.now() - new Date(snapshotTime).getTime();
  const ageHours = ageMs / 3_600_000;
  const label = ageHours < 1 ? "< 1h ago" : ageHours < 24 ? `${Math.floor(ageHours)}h ago` : `${Math.floor(ageHours / 24)}d ago`;
  const isStale = ageHours > 8;
  return <span className={`text-[11px] tabular-nums ${isStale ? "text-amber-400" : "text-[var(--text-muted)]"}`}>Data: {label}</span>;
}

function EventGroupCard({ event }: { event: PredictionMarketEvent }) {
  const router = useRouter();
  const lead = event.markets[0];
  const topProb = lead ? Math.round(lead.probability * 100) : 0;
  const color = topProb >= 70 ? "text-[var(--success)]" : topProb >= 40 ? "text-[var(--accent)]" : "text-[var(--error)]";
  const preview = event.markets.slice(0, 4);

  function goToEvent() {
    router.push(`/markets/events/${encodeURIComponent(event.source)}/${encodeURIComponent(event.event_id)}`);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--accent)]/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            {event.source === "polymarket" ? "PM" : "KS"} · {titleCase(event.category)}
          </p>
          <button onClick={goToEvent} className="text-left mt-2 group">
            <p className={`text-4xl font-bold tabular-nums ${color}`}>{topProb}%</p>
            <p className="text-base leading-tight mt-2 group-hover:text-[var(--accent)] transition-colors">{event.event_title}</p>
          </button>
          {event.event_subtitle && <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">{event.event_subtitle}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Contracts</p>
          <p className="text-sm font-semibold mt-1">{event.market_count}</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-3">
        {preview.map((market) => (
          <div key={market.market_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-[var(--text-muted)]">{marketLabel(market)}</span>
            <span className="tabular-nums font-semibold shrink-0">{Math.round(market.probability * 100)}%</span>
          </div>
        ))}
        {event.market_count > preview.length && (
          <button onClick={goToEvent} className="text-[11px] text-[var(--accent)] hover:underline">
            View all {event.market_count} contracts
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-auto pt-1 text-[11px] text-[var(--text-muted)]">
        <span>{fmtVolume(event.total_volume_usd)} total volume</span>
        <div className="flex items-center gap-3">
          <button onClick={goToEvent} className="text-[var(--accent)] hover:underline">
            Open event
          </button>
          {event.event_url && (
            <a href={event.event_url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              {event.source === "polymarket" ? "Polymarket ↗" : "Kalshi ↗"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketRow({ market }: { market: PredictionMarket }) {
  const router = useRouter();
  const closeDate = market.close_time ? new Date(`${market.close_time}T00:00:00`) : null;
  const isExpired = closeDate ? closeDate < new Date() : false;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--border)] last:border-0 group cursor-pointer"
    >
      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${market.source === "polymarket" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
        {market.source === "polymarket" ? "PM" : "KS"}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate group-hover:text-[var(--accent)] transition-colors">{market.title}</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
          {market.event_title ? `${market.event_title} · ` : ""}
          {market.outcome} · {closeDate ? `closes ${closeDate.toLocaleDateString()}` : "open-ended"}
          {isExpired ? " · expired" : ""}
        </p>
      </div>

      <div className="w-36 shrink-0">
        <ProbBar value={market.probability} />
      </div>

      <span className="w-16 shrink-0 text-right text-xs text-[var(--text-muted)] tabular-nums">{fmtVolume(market.volume_usd)}</span>
      <span className="w-20 shrink-0 text-right text-[10px] text-[var(--text-muted)] truncate capitalize">{titleCase(market.category)}</span>

      {market.market_url ? (
        <a href={market.market_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-[10px] text-[var(--accent)] hover:underline w-4">
          ↗
        </a>
      ) : (
        <span className="shrink-0 w-4" />
      )}
    </div>
  );
}

function SortableHeader({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  col: SortCol;
  label: string;
  sortBy: SortCol;
  sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  const active = sortBy === col;
  const arrow = !active ? "↕" : sortDir === "desc" ? "↓" : "↑";
  return (
    <button onClick={() => onSort(col)} className={`flex items-center gap-0.5 transition-colors ${active ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"} ${className ?? ""}`}>
      {label}
      <span className="text-[8px] ml-0.5">{arrow}</span>
    </button>
  );
}

const PAGE_SIZE = 50;

export default function MarketsPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol>("close_time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (col === sortBy) {
      setSortDir((current) => (current === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir(col === "close_time" ? "asc" : "desc");
    }
    setOffset(0);
  }

  function applyFilters(nextFilters: FilterState) {
    if (nextFilters.timeHorizon === "past" && sortBy === "close_time") {
      setSortDir("desc");
    } else if (nextFilters.timeHorizon === "upcoming" && sortBy === "close_time") {
      setSortDir("asc");
    }
    setFilters(nextFilters);
    setOffset(0);
  }

  const singleSource = filters.sources.length === 1 ? filters.sources[0] : undefined;

  const fetchData = useCallback(async () => {
    const [summary, page, categories, topEvents, categoryStats, categoryVolumeHistory] = await Promise.all([
      api.getPMSummary(),
      api.getMarkets({
        category: filters.categories.length === 1 ? filters.categories[0] : undefined,
        source: singleSource,
        resolved: filters.hideResolved ? false : undefined,
        limit: PAGE_SIZE,
        offset,
        sort_by: sortBy,
        sort_dir: sortDir,
        time_horizon: filters.timeHorizon,
        min_volume: filters.minVolume > 0 ? filters.minVolume : undefined,
      }),
      api.getMarketCategories(),
      api.getTopEvents({ limit: 8, min_volume: filters.minVolume, source: singleSource }),
      api.getCategoryStats({ source: singleSource }),
      api.getCategoryVolumeHistory({ source: singleSource, categories_limit: 6, days: 90 }),
    ]);
    return { summary, page, categories, topEvents, categoryStats, categoryVolumeHistory };
  }, [filters, offset, singleSource, sortBy, sortDir]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 60_000);

  const summary: PMSummary | undefined = data?.summary;
  const page: MarketsPageResult | undefined = data?.page;
  const categories: string[] = data?.categories ?? [];
  const topEvents: TopEventsResult | undefined = data?.topEvents;
  const categoryStats: CategoryStat[] = data?.categoryStats ?? [];
  const categoryVolumeHistory: CategoryVolumeHistory = data?.categoryVolumeHistory ?? { categories: [], points: [] };

  const totalPages = page ? Math.ceil(page.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Prediction Markets"
        subtitle="Live volume and probability data across the full Polymarket and Kalshi universe"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing…" : "↻ Refresh"}
            </Button>
            <button
              onClick={() => setFilterOpen(true)}
              className="relative inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              Filters
              {filterCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                  {filterCount}
                </span>
              )}
            </button>
          </div>
        }
      />

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} allCategories={categories} onApply={applyFilters} />

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          {topEvents && topEvents.events.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Key Signals</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Parent events ranked by total event volume, with leading contracts surfaced directly
                  </p>
                </div>
                <DataFreshnessBadge snapshotTime={summary?.latest_snapshot_time ?? null} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {topEvents.events.map((event) => (
                  <EventGroupCard key={`${event.source}:${event.event_id}`} event={event} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Markets" value={(summary?.total_markets ?? 0).toLocaleString()} subtitle={`${summary?.sources.join(" + ") ?? "—"}`} />
            <MetricCard
              label="High Conviction"
              value={(summary?.high_conviction_count ?? 0).toLocaleString()}
              subtitle={`${summary && summary.total_markets > 0 ? Math.round((summary.high_conviction_count / summary.total_markets) * 100) : 0}% with clear YES/NO signal`}
            />
            <MetricCard label="Total Volume" value={fmtVolume(summary?.total_volume_usd ?? 0)} subtitle="combined Polymarket + Kalshi" />
            <MetricCard label="Closing This Week" value={(summary?.closing_this_week ?? 0).toLocaleString()} subtitle="markets resolving in 7 days" />
          </div>

          {(categoryStats.length > 0 || categoryVolumeHistory.points.length > 0) && (
            <Card>
              <CategoryOverviewGrid stats={categoryStats} />
              <CategoryVolumeTrendChart history={categoryVolumeHistory} />
            </Card>
          )}

          <Card>
            <div className="space-y-4">
              {filterCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] flex-wrap">
                  <span>Filters active:</span>
                  {filters.timeHorizon !== "upcoming" && <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">{filters.timeHorizon}</span>}
                  {filters.minVolume > 0 && <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">{fmtVolume(filters.minVolume)}+ vol</span>}
                  {filters.sources.map((source) => (
                    <span key={source} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">{source}</span>
                  ))}
                  {filters.categories.map((category) => (
                    <span key={category} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">{titleCase(category)}</span>
                  ))}
                  {!filters.hideResolved && <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">showing resolved</span>}
                  <button
                    onClick={() => {
                      setFilters(DEFAULT_FILTERS);
                      setOffset(0);
                      setSortDir("asc");
                    }}
                    className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)] underline"
                  >
                    Clear all
                  </button>
                </div>
              )}

              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-2 bg-[var(--bg)] border-b border-[var(--border)] text-[10px] uppercase tracking-wider">
                  <span className="w-8 shrink-0 text-[var(--text-muted)]">Src</span>
                  <span className="flex-1 text-[var(--text-muted)]">Market / Outcome</span>
                  <div className="w-36 shrink-0">
                    <SortableHeader col="probability" label="Probability" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                  <div className="w-16 shrink-0 flex justify-end">
                    <SortableHeader col="volume_usd" label="Volume" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                  <div className="w-20 shrink-0 flex justify-end">
                    <SortableHeader col="close_time" label="Closes" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  </div>
                  <span className="w-4 shrink-0" />
                </div>

                {page && page.markets.length > 0 ? (
                  page.markets.map((market) => <MarketRow key={market.market_id} market={market} />)
                ) : (
                  <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                    No markets found.{" "}
                    {filterCount > 0 && (
                      <button
                        onClick={() => {
                          setFilters(DEFAULT_FILTERS);
                          setOffset(0);
                        }}
                        className="underline hover:text-[var(--text)]"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[var(--text-muted)]">Page {currentPage} of {totalPages} ({page?.total.toLocaleString()} total)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                      ← Prev
                    </Button>
                    <Button size="sm" variant="secondary" disabled={offset + PAGE_SIZE >= (page?.total ?? 0)} onClick={() => setOffset(offset + PAGE_SIZE)}>
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
