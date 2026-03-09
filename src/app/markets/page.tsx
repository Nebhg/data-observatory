"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  type CategorySourceStat,
  type CategoryVolumeHistory,
  type MarketsPage,
  type PMSummary,
  type PredictionMarket,
  type PredictionMarketEvent,
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
type CategoryHistoryInterval = "day" | "week" | "month";
type KeySignalsMode = "by_category" | "by_volume";
type ActiveSource = "both" | "polymarket" | "kalshi";
type PanelTab = "overview" | "categories";
type PageView = "overview" | "explorer";
type SortCol = "probability" | "volume_usd" | "close_time";

interface FilterState {
  hideResolved: boolean;
  sources: string[];
  categories: string[];
  timeHorizon: TimeHorizon;
  minVolume: number;
}

interface KeySignalsConfig {
  limit: number;
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
const CATEGORY_HISTORY_PRESETS = [30, 120, 365] as const;
const KEY_SIGNAL_LIMITS = [4, 8, 12] as const;

function selectKeySignalEvents(
  events: PredictionMarketEvent[],
  mode: KeySignalsMode,
  limit: number
): PredictionMarketEvent[] {
  if (mode === "by_volume") {
    return events.slice(0, limit);
  }

  const seen = new Set<string>();
  const selected: PredictionMarketEvent[] = [];
  for (const event of events) {
    if (seen.has(event.category)) continue;
    seen.add(event.category);
    selected.push(event);
    if (selected.length >= limit) break;
  }
  return selected;
}

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

function normalizeExternalUrl(source: string, url: string | null, eventId?: string | null): string | null {
  if (!url) return null;
  if (source !== "kalshi") return url;
  const ticker = (eventId || "").toLowerCase().replace(/-\d{2}[a-z]{3}\d{0,4}$/i, "").replace(/-\d{2,4}$/i, "");
  return ticker ? `https://kalshi.com/markets/${ticker}` : url;
}

function activeFilterCount(filters: FilterState): number {
  let count = 0;
  if (!filters.hideResolved) count++;
  // sources excluded — controlled by top-level toggle buttons
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

function mergeCategorySourceStats(stats: CategorySourceStat[]): CategoryStat[] {
  const grouped = new Map<string, CategoryStat>();

  for (const stat of stats) {
    const existing = grouped.get(stat.category) ?? {
      category: stat.category,
      count: 0,
      event_count: 0,
      avg_probability: 0,
      total_volume_usd: 0,
      polymarket_volume: 0,
      kalshi_volume: 0,
      high_conviction_count: 0,
    };

    existing.count += stat.count;
    existing.event_count += stat.event_count;
    existing.total_volume_usd += stat.total_volume_usd;
    existing.high_conviction_count += stat.high_conviction_count;
    existing.avg_probability += stat.avg_probability * stat.count;
    if (stat.source === "polymarket") {
      existing.polymarket_volume += stat.total_volume_usd;
    } else {
      existing.kalshi_volume += stat.total_volume_usd;
    }

    grouped.set(stat.category, existing);
  }

  return [...grouped.values()]
    .map((stat) => ({
      ...stat,
      avg_probability: stat.count > 0 ? stat.avg_probability / stat.count : 0,
    }))
    .sort((left, right) => right.total_volume_usd - left.total_volume_usd);
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
            {history.interval === "month"
              ? "Monthly total volume by category"
              : history.interval === "week"
              ? "Weekly total volume by category"
              : "Daily total volume by category using the latest snapshot per market each day"}
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
  const preview = event.markets.slice(0, 2);
  const externalUrl = normalizeExternalUrl(event.source, event.event_url, event.event_id);

  function goToEvent() {
    router.push(`/markets/events/${encodeURIComponent(event.source)}/${encodeURIComponent(event.event_id)}`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2.5 hover:border-[var(--accent)]/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            {event.source === "polymarket" ? "PM" : "KS"} · {titleCase(event.category)}
          </p>
          <button onClick={goToEvent} className="text-left mt-1 group w-full">
            <p className={`text-xl font-bold tabular-nums ${color}`}>{topProb}%</p>
            <p className="text-xs leading-tight mt-0.5 group-hover:text-[var(--accent)] transition-colors line-clamp-2">{event.event_title}</p>
          </button>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Ctrs</p>
          <p className="text-xs font-semibold mt-0.5">{event.market_count}</p>
        </div>
      </div>

      <div className="space-y-1 border-t border-[var(--border)] pt-1.5">
        {preview.map((market) => (
          <div key={market.market_id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-[var(--text-muted)]">{marketLabel(market)}</span>
            <span className="tabular-nums font-semibold shrink-0">{Math.round(market.probability * 100)}%</span>
          </div>
        ))}
        {event.market_count > preview.length && (
          <button onClick={goToEvent} className="text-[10px] text-[var(--accent)] hover:underline">
            +{event.market_count - preview.length} more
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-0.5 text-[10px] text-[var(--text-muted)]">
        <span>{fmtVolume(event.total_volume_usd)}</span>
        <div className="flex items-center gap-2">
          <button onClick={goToEvent} className="text-[var(--accent)] hover:underline">
            Open
          </button>
          {externalUrl && (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function HorizCategoryVolumeBar({ stats }: { stats: CategoryStat[] }) {
  if (stats.length === 0) {
    return <p className="text-[11px] text-[var(--text-muted)] text-center py-6">No category data yet</p>;
  }
  const totalVolume = stats.reduce((s, st) => s + st.total_volume_usd, 0) || 1;
  const sorted = [...stats].sort((a, b) => b.total_volume_usd - a.total_volume_usd).slice(0, 8);
  return (
    <div className="space-y-3">
      {sorted.map((stat, idx) => {
        const pct = (stat.total_volume_usd / totalVolume) * 100;
        return (
          <div key={stat.category}>
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="text-[var(--text-muted)] truncate pr-2">{titleCase(stat.category)}</span>
              <span className="tabular-nums text-[var(--text)] shrink-0">{fmtVolume(stat.total_volume_usd)}</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct.toFixed(1)}%`, background: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-0.5">
              <span>{stat.event_count.toLocaleString()} events</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}


const PAGE_SIZE = 50;

function SortableHeader({
  column, label, sortBy, sortDir, onSort,
}: {
  column: SortCol; label: string; sortBy: SortCol; sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
}) {
  const active = sortBy === column;
  return (
    <th
      onClick={() => onSort(column)}
      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] cursor-pointer select-none whitespace-nowrap hover:text-[var(--text)] transition-colors"
    >
      {label}
      <span className="ml-1 opacity-60">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
    </th>
  );
}

function MarketRow({ market, onClick }: { market: PredictionMarket; onClick?: () => void }) {
  const prob = market.probability;
  const probColor = prob >= 0.7 ? "text-emerald-400" : prob <= 0.3 ? "text-rose-400" : "text-[var(--text)]";
  const closeDate = market.close_time
    ? new Date(market.close_time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
    : "—";
  return (
    <tr
      onClick={onClick}
      className={`border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)] ${onClick ? "cursor-pointer" : ""}`}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
            market.source === "polymarket" ? "bg-sky-500/15 text-sky-400" : "bg-fuchsia-500/15 text-fuchsia-400"
          }`}>
            {market.source === "polymarket" ? "PM" : "KS"}
          </span>
          <span className="text-sm leading-snug line-clamp-1">{market.title}</span>
        </div>
        {market.category && (
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-7">{titleCase(market.category)}</p>
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <div className="flex flex-col items-end gap-1">
          <span className={`text-sm font-semibold tabular-nums ${probColor}`}>{Math.round(prob * 100)}%</span>
          <div className="w-14 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full rounded-full ${prob >= 0.7 ? "bg-emerald-400" : prob <= 0.3 ? "bg-rose-400" : "bg-[var(--accent)]"}`} style={{ width: `${prob * 100}%` }} />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-sm tabular-nums whitespace-nowrap">{fmtVolume(market.volume_usd)}</td>
      <td className="px-3 py-2.5 text-right text-[11px] text-[var(--text-muted)] whitespace-nowrap">{closeDate}</td>
    </tr>
  );
}

function CategoryCompactList({ stats }: { stats: CategoryStat[] }) {
  if (stats.length === 0) return <p className="text-[11px] text-[var(--text-muted)] text-center py-6">No category data</p>;
  const totalVolume = stats.reduce((sum, s) => sum + s.total_volume_usd, 0) || 1;
  return (
    <div className="divide-y divide-[var(--border)]">
      {stats.map((stat) => {
        const share = stat.total_volume_usd / totalVolume;
        const convictionPct = stat.count > 0 ? Math.round((stat.high_conviction_count / stat.count) * 100) : 0;
        return (
          <div key={stat.category} className="py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{titleCase(stat.category)}</p>
              <p className="text-sm font-semibold shrink-0">{fmtVolume(stat.total_volume_usd)}</p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="text-[10px] text-[var(--text-muted)]">{stat.event_count} events · {convictionPct}% conviction</p>
              <p className="text-[10px] text-[var(--text-muted)] shrink-0">{(share * 100).toFixed(0)}%</p>
            </div>
    
          </div>
        );
      })}
    </div>
  );
}

export default function MarketsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<ActiveSource>("kalshi");
  const [pageView, setPageView] = useState<PageView>("overview");
  const [panelTab, setPanelTab] = useState<PanelTab>("overview");
  const [explorerDraft, setExplorerDraft] = useState("");
  const [explorerQuery, setExplorerQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortCol>("close_time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [explorerResults, setExplorerResults] = useState<Array<{
    event_id: string; event_title: string; source: string;
    category: string; market_count: number; total_volume_usd: number;
  }>>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [categoryHistoryDays, setCategoryHistoryDays] = useState<number>(120);
  const categoryHistoryInterval: CategoryHistoryInterval = "day";

  // Reads ?view=explorer from the URL and sets Explorer mode
  function ViewParamReader() {
    const sp = useSearchParams();
    useEffect(() => {
      if (sp.get("view") === "explorer") setPageView("explorer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }
  const [eventSearch, setEventSearch] = useState("");
  const [eventSearchDraft, setEventSearchDraft] = useState("");
  const [keySignalsConfig, setKeySignalsConfig] = useState<KeySignalsConfig>({ limit: 8 });
  const [keySignalsMode, setKeySignalsMode] = useState<KeySignalsMode>("by_category");

  // Derive API source param from explicit toggle
  const apiSource = activeSource === "both" ? undefined : activeSource;

  // Debounce explorer search input
  useEffect(() => {
    const id = setTimeout(() => setExplorerQuery(explorerDraft.trim()), 400);
    return () => clearTimeout(id);
  }, [explorerDraft]);

  // Fetch explorer results on query change
  useEffect(() => {
    if (explorerQuery.length < 2) {
      setExplorerResults([]);
      return;
    }
    let cancelled = false;
    setExplorerLoading(true);
    api.suggestEvents({
      q: explorerQuery,
      limit: 10,
      source: apiSource,
    })
      .then((res) => { if (!cancelled) setExplorerResults(res); })
      .catch(() => { if (!cancelled) setExplorerResults([]); })
      .finally(() => { if (!cancelled) setExplorerLoading(false); });
    return () => { cancelled = true; };
  }, [explorerQuery, apiSource]);

  function handleSourceToggle(src: ActiveSource) {
    setActiveSource(src);
  }

  function applyFilters(nextFilters: FilterState) {
    setFilters(nextFilters);
  }

  const selectedCategories = filters.categories.length > 0 ? filters.categories : undefined;
  const topEventFetchLimit = keySignalsMode === "by_category"
    ? 24
    : keySignalsConfig.limit;

  const fetchData = useCallback(async () => {
    const [summary, categories, topEvents, categoryStats, categorySourceStats, categoryVolumeHistory, eventSearchResults, marketsPage] = await Promise.all([
      api.getPMSummary(apiSource ? { source: apiSource } : undefined),
      api.getMarketCategories(),
      api.getTopEvents({
        limit: topEventFetchLimit,
        min_volume: filters.minVolume,
        source: apiSource,
        categories: selectedCategories,
        time_horizon: filters.timeHorizon,
      }),
      api.getCategoryStats({ source: apiSource }),
      api.getCategorySourceStats({
        categories: selectedCategories,
        time_horizon: filters.timeHorizon,
        min_volume: filters.minVolume,
      }),
      api.getCategoryVolumeHistory({
        source: apiSource,
        categories: selectedCategories,
        categories_limit: 8,
        days: categoryHistoryDays,
        interval: categoryHistoryInterval,
      }),
      eventSearch.trim().length >= 2
        ? api.searchEvents({
            q: eventSearch.trim(),
            limit: 8,
            source: apiSource,
            categories: selectedCategories,
            min_volume: filters.minVolume,
            time_horizon: filters.timeHorizon,
          })
        : Promise.resolve({ events: [], total: 0 }),
      api.getMarkets({
        source: apiSource,
        limit: 50,
        offset,
        sort_by: sortBy,
        sort_dir: sortDir,
        resolved: filters.hideResolved ? false : undefined,
        time_horizon: filters.timeHorizon,
        min_volume: filters.minVolume,
      }),
    ]);
    return { summary, categories, topEvents, categoryStats, categorySourceStats, categoryVolumeHistory, eventSearchResults, marketsPage };
  }, [categoryHistoryDays, eventSearch, filters, selectedCategories, apiSource, topEventFetchLimit, offset, sortBy, sortDir]);

  const { data, loading, error, isRefreshing, refresh } = usePolling(fetchData, 60_000);

  const summary: PMSummary | undefined = data?.summary;
  const categories: string[] = data?.categories ?? [];
  const topEvents: TopEventsResult | undefined = data?.topEvents;
  const rawCategoryStats: CategoryStat[] = data?.categoryStats ?? [];
  const categorySourceStats: CategorySourceStat[] = data?.categorySourceStats ?? [];
  const categoryVolumeHistory: CategoryVolumeHistory = data?.categoryVolumeHistory ?? { categories: [], points: [] };
  const eventSearchResults: TopEventsResult | undefined = data?.eventSearchResults;
  const marketsPage: MarketsPage | undefined = data?.marketsPage;

  const categoryStats: CategoryStat[] =
    activeSource !== "both" ? rawCategoryStats : mergeCategorySourceStats(categorySourceStats);
  const displayedEvents = eventSearch.trim().length >= 2
    ? eventSearchResults?.events ?? []
    : selectKeySignalEvents(topEvents?.events ?? [], keySignalsMode, keySignalsConfig.limit);

  const filterCount = activeFilterCount(filters);
  const sourceLabel = activeSource === "both" ? "Polymarket + Kalshi" : activeSource === "polymarket" ? "Polymarket" : "Kalshi";

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <Suspense fallback={null}><ViewParamReader /></Suspense>
      <PageHeader
        title="Prediction Markets"
        subtitle={`Live probability and volume data · ${sourceLabel}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Page view switcher */}
            <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden text-xs font-semibold">
              {(["overview", "explorer"] as const).map((view, idx) => (
                <button
                  key={view}
                  onClick={() => setPageView(view)}
                  className={`px-3 py-1.5 transition-colors ${idx === 0 ? "border-r border-[var(--border)]" : ""} ${
                    pageView === view
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {view === "overview" ? "Overview" : "Explorer"}
                </button>
              ))}
            </div>
            {/* Source mode toggle */}
            <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden text-xs font-semibold">
              {(["polymarket", "both", "kalshi"] as const).map((src, idx) => (
                <button
                  key={src}
                  onClick={() => handleSourceToggle(src)}
                  className={`px-3 py-1.5 transition-colors ${
                    idx < 2 ? "border-r border-[var(--border)]" : ""
                  } ${
                    activeSource === src
                      ? src === "polymarket"
                        ? "bg-sky-500 text-white"
                        : src === "kalshi"
                        ? "bg-fuchsia-600 text-white"
                        : "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {src === "polymarket" ? "Polymarket" : src === "kalshi" ? "Kalshi" : "Both"}
                </button>
              ))}
            </div>
            {pageView === "overview" && (
              <form
                onSubmit={(e) => { e.preventDefault(); setEventSearch(eventSearchDraft.trim()); }}
                className="flex items-center gap-2"
              >
                <input
                  value={eventSearchDraft}
                  onChange={(e) => setEventSearchDraft(e.target.value)}
                  placeholder="Search key signals…"
                  className="w-48 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <Button size="sm" variant="secondary" onClick={() => setEventSearch(eventSearchDraft.trim())}>
                  Search
                </Button>
                {eventSearch && (
                  <button type="button" onClick={() => { setEventSearch(""); setEventSearchDraft(""); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] underline">
                    Clear
                  </button>
                )}
              </form>
            )}
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing…" : "↻ Refresh"}
            </Button>
            {pageView === "overview" && (
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
            )}
          </div>
        }
      />

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} allCategories={categories} onApply={applyFilters} />

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : pageView === "explorer" ? (
        /* ── EXPLORER PAGE VIEW ─────────────────────────────── */
        <div className="space-y-4">
          {/* Search input */}
          <div className="flex items-center gap-3">
            <input
              value={explorerDraft}
              onChange={(e) => setExplorerDraft(e.target.value)}
              placeholder="Search markets by name, topic, keyword…"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
              autoFocus
            />
            {explorerDraft && (
              <button
                onClick={() => setExplorerDraft("")}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          {explorerDraft.trim().length >= 2 ? (
            /* ── SEARCH RESULTS ── */
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--text-muted)]">
                {explorerLoading ? "Searching…" : `${explorerResults.length} result${explorerResults.length !== 1 ? "s" : ""} for "${explorerDraft.trim()}"`}
              </p>
              {!explorerLoading && explorerResults.length === 0 && (
                <div className="py-12 text-center text-sm text-[var(--text-muted)]">No events found</div>
              )}
              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)] divide-y divide-[var(--border)]">
                {explorerResults.map((event) => (
                  <button
                    key={`${event.source}:${event.event_id}`}
                    onClick={() => router.push(`/markets/events/${encodeURIComponent(event.source)}/${encodeURIComponent(event.event_id)}?from=explorer`)}
                    className="w-full text-left px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors flex items-center gap-3"
                  >
                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      event.source === "polymarket" ? "bg-sky-500/15 text-sky-400" : "bg-fuchsia-500/15 text-fuchsia-400"
                    }`}>
                      {event.source === "polymarket" ? "PM" : "KS"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.event_title}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{titleCase(event.category)} · {event.market_count} contracts</p>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] shrink-0 tabular-nums">{fmtVolume(event.total_volume_usd)}</p>
                    <span className="text-[var(--text-muted)] text-xs shrink-0">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── ALL-MARKETS TABLE ── */
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-[11px] text-[var(--text-muted)]">
                  {marketsPage ? `${marketsPage.total.toLocaleString()} markets · ${sourceLabel}` : sourceLabel}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-muted)]">
                  <span>Sort:</span>
                  {([["close_time", "Close date"], ["probability", "Probability"], ["volume_usd", "Volume"]] as [SortCol, string][]).map(([col, label]) => (
                    <button
                      key={col}
                      onClick={() => {
                        if (sortBy === col) {
                          setSortDir((d) => d === "asc" ? "desc" : "asc");
                        } else {
                          setSortBy(col);
                          setSortDir("asc");
                          setOffset(0);
                        }
                      }}
                      className={`px-2 py-1 rounded-full border ${sortBy === col ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                    >
                      {label}{sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-card)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Market</th>
                      <SortableHeader column="probability" label="Prob" sortBy={sortBy} sortDir={sortDir} onSort={(col) => { setSortBy(col); setSortDir("desc"); setOffset(0); }} />
                      <SortableHeader column="volume_usd" label="Volume" sortBy={sortBy} sortDir={sortDir} onSort={(col) => { setSortBy(col); setSortDir("desc"); setOffset(0); }} />
                      <SortableHeader column="close_time" label="Closes" sortBy={sortBy} sortDir={sortDir} onSort={(col) => { setSortBy(col); setSortDir("asc"); setOffset(0); }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(marketsPage?.markets ?? []).map((m) => (
                      <MarketRow
                        key={`${m.source}:${m.market_id}`}
                        market={m}
                        onClick={() => {
                          if (m.event_id) {
                            router.push(`/markets/events/${encodeURIComponent(m.source)}/${encodeURIComponent(m.event_id)}?from=explorer`);
                          } else {
                            router.push(`/markets/${encodeURIComponent(m.market_id)}?from=explorer`);
                          }
                        }}
                      />
                    ))}
                    {(marketsPage?.markets ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">No markets found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {marketsPage && marketsPage.total > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                    <span>
                      {offset + 1}–{Math.min(offset + PAGE_SIZE, marketsPage.total)} of {marketsPage.total.toLocaleString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={offset === 0}
                        onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                        className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-30 hover:text-[var(--text)] transition-colors"
                      >
                        ← Prev
                      </button>
                      <button
                        disabled={offset + PAGE_SIZE >= marketsPage.total}
                        onClick={() => setOffset((o) => o + PAGE_SIZE)}
                        className="px-2 py-1 rounded border border-[var(--border)] disabled:opacity-30 hover:text-[var(--text)] transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── OVERVIEW PAGE VIEW ─────────────────────────────── */
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6">
          {/* ── LEFT MAIN COLUMN ─────────────────────────────── */}
          <div className="min-w-0 flex flex-col gap-4 xl:h-[calc(100vh-9rem)]">
            {displayedEvents.length > 0 && (
              <div className="flex-[7] min-h-0 overflow-y-auto">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Key Signals</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {eventSearch.trim().length >= 2
                        ? `Matches for "${eventSearch}" · ${sourceLabel}`
                        : `Top events by volume · ${sourceLabel}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!eventSearch.trim() && (
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span>Mode</span>
                        {([
                          ["by_category", "Per category"],
                          ["by_volume", "Top volume"],
                        ] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            onClick={() => setKeySignalsMode(mode)}
                            className={`px-2 py-1 rounded-full border ${keySignalsMode === mode ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <span>Show</span>
                      {KEY_SIGNAL_LIMITS.map((limit) => (
                        <button
                          key={limit}
                          onClick={() => setKeySignalsConfig({ limit })}
                          className={`px-2 py-1 rounded-full border ${keySignalsConfig.limit === limit ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                        >
                          {limit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {displayedEvents.map((event) => (
                    <EventGroupCard key={`${event.source}:${event.event_id}`} event={event} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex-[3] min-h-0 flex items-end">
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Total Markets" value={(summary?.total_markets ?? 0).toLocaleString()} subtitle={sourceLabel} />
              <MetricCard
                label="High Conviction"
                value={(summary?.high_conviction_count ?? 0).toLocaleString()}
                subtitle={`${summary && summary.total_markets > 0 ? Math.round((summary.high_conviction_count / summary.total_markets) * 100) : 0}% clear signal`}
              />
              <MetricCard label="Total Volume" value={fmtVolume(summary?.total_volume_usd ?? 0)} subtitle="combined volume" />
              <MetricCard label="Closing This Week" value={(summary?.closing_this_week ?? 0).toLocaleString()} subtitle="resolving in 7 days" />
            </div>
            </div>
          </div>{/* end left column */}

          {/* ── RIGHT PANEL ──────────────────────────────────── */}
          <div className="xl:sticky xl:top-6 xl:self-start space-y-0">
            {/* Tab strip */}
            <div className="flex rounded-t-xl border border-b-0 border-[var(--border)] overflow-hidden">
              {(["overview", "categories"] as const).map((tab, idx) => (
                <button
                  key={tab}
                  onClick={() => setPanelTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    idx === 0 ? "border-r border-[var(--border)]" : ""
                  } ${
                    panelTab === tab
                      ? "bg-[var(--bg-card)] text-[var(--text)]"
                      : "bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  {tab === "overview" ? "Overview" : "Categories"}
                </button>
              ))}
            </div>

            <div className="rounded-b-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 overflow-y-auto xl:max-h-[calc(100vh-9rem)]">
              {/* Overview: category volume bar chart + trend */}
              {panelTab === "overview" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Category Volume Share</p>
                    <DataFreshnessBadge snapshotTime={summary?.latest_snapshot_time ?? null} />
                  </div>
                  <HorizCategoryVolumeBar stats={categoryStats} />
                  <div className="pt-2">
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-muted)] mb-3">
                      <span className="uppercase tracking-wider">Trend</span>
                      {CATEGORY_HISTORY_PRESETS.map((days) => (
                        <button
                          key={days}
                          onClick={() => setCategoryHistoryDays(days)}
                          className={`px-2 py-0.5 rounded-full border ${categoryHistoryDays === days ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] hover:text-[var(--text)]"}`}
                        >
                          {days === 30 ? "1M" : days === 120 ? "4M" : "1Y"}
                        </button>
                      ))}
                    </div>
                    <CategoryVolumeTrendChart history={categoryVolumeHistory} />
                  </div>
                </div>
              )}

              {/* Categories: compact single-column list */}
              {panelTab === "categories" && (
                <div className="space-y-1">
                  <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Category Breakdown</p>
                  <CategoryCompactList stats={categoryStats} />
                </div>
              )}
            </div>
          </div>{/* end right panel */}
        </div>
      )}
    </div>
  );
}
