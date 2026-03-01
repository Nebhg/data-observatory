import { useState } from "react";

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    healthy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    fresh: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    partial: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    warn: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    stale: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    degraded: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
    fail: "bg-red-500/15 text-red-400 border-red-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    idle: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    skip: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    unknown: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  const cls = colors[status] || colors.idle;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${cls}`}
    >
      {status}
    </span>
  );
}

export function HealthDot({ status }: { status: "healthy" | "degraded" | "error" | "unknown" }) {
  const colors = {
    healthy: "bg-emerald-400",
    degraded: "bg-yellow-400",
    error: "bg-red-400",
    unknown: "bg-zinc-500",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />
  );
}

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 ${
        onClick ? "cursor-pointer hover:border-[var(--accent)]/40 transition-colors" : ""
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  subtitle,
  status,
  onClick,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  status?: "healthy" | "degraded" | "error" | "unknown";
  onClick?: () => void;
}) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </p>
        {status && <HealthDot status={status} />}
      </div>
      <p className="text-2xl font-bold mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {subtitle && (
        <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>
      )}
    </Card>
  );
}

/** Simple horizontal bar chart segment */
export function BarSegment({
  segments,
  height = "h-2",
}: {
  segments: { value: number; color: string; label?: string }[];
  height?: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className={`${height} rounded-full bg-zinc-800`} />;

  return (
    <div className={`${height} rounded-full overflow-hidden flex bg-zinc-800`}>
      {segments.map((seg, i) => (
        <div
          key={i}
          className={`${seg.color} transition-all duration-500`}
          style={{ width: `${(seg.value / total) * 100}%` }}
          title={seg.label ? `${seg.label}: ${seg.value}` : String(seg.value)}
        />
      ))}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
      {message}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const base =
    "rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white",
    secondary:
      "bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text)] border border-[var(--border)]",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Expandable section */
export function Expandable({
  title,
  subtitle,
  right,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[var(--text-muted)] text-xs shrink-0">
            {open ? "▾" : "▸"}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{title}</div>
            {subtitle && (
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {right && (
          <div className="text-right shrink-0 ml-4">{right}</div>
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
