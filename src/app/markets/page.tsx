"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  MetricCard,
  Card,
  Button,
  LoadingSpinner,
  ErrorMessage,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";
import { api, type PMSummary, type PredictionMarket, type MarketsPage } from "@/lib/api";

type TopMarketsResult = { markets: PredictionMarket[]; total: number };
type CategoryStat = { category: string; count: number; avg_probability: number; total_volume_usd: number };
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

// ─── Helpers ──────────────────────────────────────────────

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (!f.hideResolved) n++;
  if (f.sources.length > 0) n++;
  if (f.categories.length > 0) n++;
  if (f.timeHorizon !== "upcoming") n++;
  if (f.minVolume > 0) n++;
  return n;
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
        <div
          className={`h-full rounded-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-10 text-right">{fmtPct(value)}</span>
    </div>
  );
}

// ─── Category Sentiment Map ────────────────────────────────

function CategorySentimentMap({ stats }: { stats: CategoryStat[] }) {
  if (!stats || stats.length === 0) return null;
  const totalVol = stats.reduce((sum, s) => sum + s.total_volume_usd, 0) || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          Market Sentiment by Category
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">avg YES probability · sorted by volume</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {stats.map((s) => {
          const pct = Math.round(s.avg_probability * 100);
          const volShare = s.total_volume_usd / totalVol;
          const sentiment = pct >= 65 ? "Bullish" : pct >= 40 ? "Mixed" : "Bearish";
          const sentimentColor =
            pct >= 65 ? "text-emerald-400" : pct >= 40 ? "text-indigo-400" : "text-red-400";
          const barColor =
            pct >= 65 ? "bg-emerald-500" : pct >= 40 ? "bg-indigo-500" : "bg-red-500";

          return (
            <div
              key={s.category}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold capitalize truncate">{s.category}</p>
                  <p className={`text-[10px] font-medium mt-0.5 ${sentimentColor}`}>{sentiment}</p>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">{s.count} mkts</span>
              </div>

              {/* YES probability bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-[9px] text-[var(--text-muted)]">NO</span>
                  <span className="text-sm font-bold tabular-nums">{pct}%</span>
                  <span className="text-[9px] text-[var(--text-muted)]">YES</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Volume + share bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[var(--text-muted)]">Volume</span>
                  <span className="text-xs font-semibold tabular-nums">
                    {fmtVolume(s.total_volume_usd)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-zinc-400 transition-all duration-500"
                    style={{ width: `${volShare * 100}%` }}
                  />
                </div>
                <p className="text-[9px] text-[var(--text-muted)]">
                  {(volShare * 100).toFixed(0)}% of total market volume
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Filter Modal ─────────────────────────────────────────

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
  onApply: (f: FilterState) => void;
}) {
  const [draft, setDraft] = useState<FilterState>(filters);
  const ref = useRef<HTMLDivElement>(null);

  // Sync draft when modal opens
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  // Outside click to close
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function toggleSource(s: string) {
    setDraft((d) => ({
      ...d,
      sources: d.sources.includes(s) ? d.sources.filter((x) => x !== s) : [...d.sources, s],
    }));
  }

  function toggleCategory(c: string) {
    setDraft((d) => ({
      ...d,
      categories: d.categories.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...d.categories, c],
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
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-[var(--accent)] w-3.5 h-3.5"
      />
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
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none"
          >
            ×
          </button>
        </div>

        <Section title="Status">
          <Checkbox
            checked={draft.hideResolved}
            onChange={() => setDraft((d) => ({ ...d, hideResolved: !d.hideResolved }))}
            label="Hide resolved markets"
          />
        </Section>

        <Section title="Time Horizon">
          {(["upcoming", "all", "past"] as TimeHorizon[]).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer text-sm select-none hover:text-[var(--text)] text-[var(--text-muted)]">
              <input
                type="radio"
                name="timeHorizon"
                checked={draft.timeHorizon === t}
                onChange={() => setDraft((d) => ({ ...d, timeHorizon: t }))}
                className="accent-[var(--accent)]"
              />
              {t === "upcoming" ? "Upcoming / Active" : t === "all" ? "All" : "Past / Resolved"}
            </label>
          ))}
        </Section>

        <Section title="Min Volume">
          <div className="flex flex-wrap gap-2">
            {VOLUME_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDraft((d) => ({ ...d, minVolume: p.value }))}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  draft.minVolume === p.value
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Source">
          {["polymarket", "kalshi"].map((s) => (
            <Checkbox
              key={s}
              checked={draft.sources.includes(s)}
              onChange={() => toggleSource(s)}
              label={s === "polymarket" ? "Polymarket" : "Kalshi"}
            />
          ))}
        </Section>

        {allCategories.length > 0 && (
          <Section title="Category">
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {allCategories.map((c) => (
                <Checkbox
                  key={c}
                  checked={draft.categories.includes(c)}
                  onChange={() => toggleCategory(c)}
                  label={c}
                />
              ))}
            </div>
          </Section>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDraft(DEFAULT_FILTERS)}
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={() => { onApply(draft); onClose(); }}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Data freshness badge ─────────────────────────────────

function DataFreshnessBadge({ snapshotTime }: { snapshotTime: string | null }) {
  if (!snapshotTime) return null;
  const ageMs = Date.now() - new Date(snapshotTime).getTime();
  const ageHours = ageMs / 3_600_000;
  const label =
    ageHours < 1 ? "< 1h ago" : ageHours < 24 ? `${Math.floor(ageHours)}h ago` : `${Math.floor(ageHours / 24)}d ago`;
  const isStale = ageHours > 8;
  return (
    <span className={`text-[11px] tabular-nums ${isStale ? "text-amber-400" : "text-[var(--text-muted)]"}`}>
      Data: {label}
    </span>
  );
}

// ─── Key signal card ──────────────────────────────────────

function KeySignalCard({ market }: { market: PredictionMarket }) {
  const router = useRouter();
  const pct = Math.round(market.probability * 100);
  const color =
    pct >= 70 ? "text-[var(--success)]" : pct >= 40 ? "text-[var(--accent)]" : "text-[var(--error)]";

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--accent)]/40 transition-colors cursor-pointer"
    >
      <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider truncate">
        {market.source === "polymarket" ? "PM" : "KS"} · {market.category}
      </p>
      <p className={`text-4xl font-bold tabular-nums ${color}`}>{pct}%</p>
      <p className="text-sm leading-snug line-clamp-2 flex-1">{market.title}</p>
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-[10px] text-[var(--text-muted)]">{fmtVolume(market.volume_usd)} vol</span>
        {market.market_url && (
          <a
            href={market.market_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-[var(--accent)] hover:underline shrink-0"
          >
            {market.source === "polymarket" ? "Polymarket ↗" : "Kalshi ↗"}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Market row ───────────────────────────────────────────

function MarketRow({ market }: { market: PredictionMarket }) {
  const router = useRouter();
  const closeDate = market.close_time ? new Date(market.close_time + "T00:00:00") : null;
  const isExpired = closeDate ? closeDate < new Date() : false;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/markets/${encodeURIComponent(market.market_id)}?source=${market.source}`)}
      className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--border)] last:border-0 group cursor-pointer"
    >
      <span
        className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
          market.source === "polymarket"
            ? "bg-blue-500/15 text-blue-400"
            : "bg-purple-500/15 text-purple-400"
        }`}
      >
        {market.source === "polymarket" ? "PM" : "KS"}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate group-hover:text-[var(--accent)] transition-colors">
          {market.title}
        </p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          {market.outcome} ·{" "}
          {closeDate ? (
            <span className={isExpired ? "text-[var(--error)]" : ""}>
              closes {closeDate.toLocaleDateString()}
            </span>
          ) : (
            <span>open-ended</span>
          )}
        </p>
      </div>

      <div className="w-36 shrink-0">
        <ProbBar value={market.probability} />
      </div>

      <span className="w-16 shrink-0 text-right text-xs text-[var(--text-muted)] tabular-nums">
        {fmtVolume(market.volume_usd)}
      </span>

      <span className="w-20 shrink-0 text-right text-[10px] text-[var(--text-muted)] truncate capitalize">
        {market.category}
      </span>

      {market.market_url ? (
        <a
          href={market.market_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-[10px] text-[var(--accent)] hover:underline w-4"
        >
          ↗
        </a>
      ) : (
        <span className="shrink-0 w-4" />
      )}
    </div>
  );
}

// ─── Sortable column header ───────────────────────────────

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
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 transition-colors ${
        active ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
      } ${className ?? ""}`}
    >
      {label}
      <span className="text-[8px] ml-0.5">{arrow}</span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function MarketsPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol>("close_time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (col === sortBy) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir(col === "close_time" ? "asc" : "desc");
    }
    setOffset(0);
  }

  function applyFilters(f: FilterState) {
    // When switching to past, default close_time sort to desc
    if (f.timeHorizon === "past" && sortBy === "close_time") {
      setSortDir("desc");
    } else if (f.timeHorizon === "upcoming" && sortBy === "close_time") {
      setSortDir("asc");
    }
    setFilters(f);
    setOffset(0);
  }

  const fetchData = useCallback(async () => {
    const [summary, page, cats, topMarkets, categoryStats] = await Promise.all([
      api.getPMSummary(),
      api.getMarkets({
        category: filters.categories.length === 1 ? filters.categories[0] : undefined,
        source: filters.sources.length === 1 ? filters.sources[0] : undefined,
        resolved: filters.hideResolved ? false : undefined,
        limit: PAGE_SIZE,
        offset,
        sort_by: sortBy,
        sort_dir: sortDir,
        time_horizon: filters.timeHorizon,
        min_volume: filters.minVolume > 0 ? filters.minVolume : undefined,
      }),
      api.getMarketCategories(),
      api.getTopMarkets({ limit: 8, min_volume: 5000 }),
      api.getCategoryStats(),
    ]);
    return { summary, page, cats, topMarkets, categoryStats };
  }, [filters, offset, sortBy, sortDir]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 60_000);

  const summary: PMSummary | undefined = data?.summary;
  const page: MarketsPage | undefined = data?.page;
  const categories: string[] = data?.cats ?? [];
  const topMarkets: TopMarketsResult | undefined = data?.topMarkets;
  const categoryStats: CategoryStat[] = data?.categoryStats ?? [];

  const totalPages = page ? Math.ceil(page.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Prediction Markets"
        subtitle="Live probability data from Polymarket and Kalshi"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
              disabled={isRefreshing}
            >
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

      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        allCategories={categories}
        onApply={applyFilters}
      />

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          {/* Key Signals */}
          {topMarkets && topMarkets.markets.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Key Signals
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Top 8 markets by trading volume — high volume ≠ high probability
                  </p>
                </div>
                <DataFreshnessBadge snapshotTime={summary?.latest_snapshot_time ?? null} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {topMarkets.markets.map((m) => (
                  <KeySignalCard key={m.market_id} market={m} />
                ))}
              </div>
            </div>
          )}

          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Markets"
              value={(summary?.total_markets ?? 0).toLocaleString()}
              subtitle={`${summary?.sources.join(", ") ?? "—"}`}
            />
            <MetricCard
              label="Avg Probability"
              value={fmtPct(summary?.avg_probability ?? 0)}
              subtitle="weighted across all outcomes"
            />
            <MetricCard
              label="Total Volume"
              value={fmtVolume(summary?.total_volume_usd ?? 0)}
              subtitle="cumulative USD"
            />
            <MetricCard
              label="Categories"
              value={summary?.category_count ?? 0}
              subtitle={`${summary?.source_count ?? 0} sources`}
            />
          </div>

          {/* Category sentiment heatmap */}
          {categoryStats.length > 0 && (
            <Card>
              <CategorySentimentMap stats={categoryStats} />
            </Card>
          )}

          {/* Markets table */}
          <Card>
            <div className="space-y-4">
              {/* Active filter summary */}
              {filterCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>Filters active:</span>
                  {filters.timeHorizon !== "upcoming" && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                      {filters.timeHorizon}
                    </span>
                  )}
                  {filters.minVolume > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                      {fmtVolume(filters.minVolume)}+ vol
                    </span>
                  )}
                  {filters.sources.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                      {s}
                    </span>
                  ))}
                  {filters.categories.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                      {c}
                    </span>
                  ))}
                  {!filters.hideResolved && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                      showing resolved
                    </span>
                  )}
                  <button
                    onClick={() => { setFilters(DEFAULT_FILTERS); setOffset(0); setSortDir("asc"); }}
                    className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)] underline"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* Table */}
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
                  page.markets.map((m) => (
                    <MarketRow key={m.market_id} market={m} />
                  ))
                ) : (
                  <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                    No markets found.{" "}
                    {filterCount > 0 && (
                      <button
                        onClick={() => { setFilters(DEFAULT_FILTERS); setOffset(0); }}
                        className="underline hover:text-[var(--text)]"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-[var(--text-muted)]">
                    Page {currentPage} of {totalPages} ({page?.total.toLocaleString()} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      ← Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={offset + PAGE_SIZE >= (page?.total ?? 0)}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
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
