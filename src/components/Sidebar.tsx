"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "./SidebarContext";

const navItems = [
  { href: "/", label: "Overview", icon: "📊" },
  { href: "/sources", label: "Sources", icon: "🔌" },
  { href: "/runs", label: "Runs", icon: "▶️" },
  { href: "/bronze", label: "Bronze", icon: "🥉" },
  { href: "/query", label: "SQL Editor", icon: "🔍" },
  { href: "/dbt", label: "dbt", icon: "🔧" },
  { href: "/markets", label: "Markets", icon: "📈" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={`${
        collapsed ? "w-14" : "w-52"
      } shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col transition-all duration-200`}
    >
      {/* Header */}
      <div className="px-3 py-4 border-b border-[var(--border)] flex items-center justify-between min-h-[56px]">
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">
              Observatory
            </h1>
            <p className="text-[10px] text-[var(--text-muted)]">
              Data Pipeline
            </p>
          </div>
        )}
        <button
          onClick={toggle}
          className="shrink-0 p-1 rounded hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "☰" : "◁"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base shrink-0 w-6 text-center">
                {item.icon}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-3 py-3 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          v0.2.0
        </div>
      )}
    </aside>
  );
}
