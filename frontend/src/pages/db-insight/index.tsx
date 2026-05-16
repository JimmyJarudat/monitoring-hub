import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type DbType =
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "redis"
  | "mongodb"
  | "sqlite"
  | "sqlserver"
  | "mssql";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";

type DbMonitor = {
  id: string;
  name: string;
  enabled: boolean;
  interval: number;
  config: {
    type: DbType;
    host?: string;
    port?: number;
    database?: string;
    uri?: string;
    filename?: string;
  };
  latestResult: {
    status: MonitorStatus;
    responseTimeMs: number | null;
    checkedAt: string;
    message: string | null;
  } | null;
  uptime24h: number | null;
};

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ─── DB type metadata ─────────────────────────────────────────────────────────
const DB_META: Record<DbType, { label: string; color: string; bg: string }> = {
  postgresql: { label: "PostgreSQL", color: "text-blue-700",   bg: "bg-blue-50 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-400/20" },
  mysql:      { label: "MySQL",      color: "text-orange-700", bg: "bg-orange-50 ring-orange-600/20 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-400/20" },
  mariadb:    { label: "MariaDB",    color: "text-teal-700",   bg: "bg-teal-50 ring-teal-600/20 dark:bg-teal-900/20 dark:text-teal-300 dark:ring-teal-400/20" },
  redis:      { label: "Redis",      color: "text-red-700",    bg: "bg-red-50 ring-red-600/20 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-400/20" },
  mongodb:    { label: "MongoDB",    color: "text-emerald-700",bg: "bg-emerald-50 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-400/20" },
  sqlite:     { label: "SQLite",     color: "text-slate-700",  bg: "bg-slate-100 ring-slate-600/20 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500/20" },
  sqlserver:  { label: "SQL Server", color: "text-indigo-700", bg: "bg-indigo-50 ring-indigo-600/20 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-400/20" },
  mssql:      { label: "MSSQL",      color: "text-indigo-700", bg: "bg-indigo-50 ring-indigo-600/20 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-400/20" },
};

const STATUS_STYLE: Record<MonitorStatus, string> = {
  UP:       "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300",
  DOWN:     "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/20 dark:text-rose-300",
};

const STATUS_DOT: Record<MonitorStatus, string> = {
  UP:       "bg-emerald-500",
  DEGRADED: "bg-amber-500",
  DOWN:     "bg-rose-500",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtMs = (v: number | null) => (v != null ? `${v} ms` : "—");
const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(1)}%` : "—");

const uptimeColor = (v: number | null) => {
  if (v == null) return "text-slate-400";
  if (v >= 99) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 95) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
};

const fmtRelative = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const getConnStr = (cfg: DbMonitor["config"]) => {
  if (cfg.uri) return cfg.uri.replace(/:[^:@]+@/, ":***@");
  if (cfg.filename) return cfg.filename;
  const port = cfg.port ? `:${cfg.port}` : "";
  const db = cfg.database ? `/${cfg.database}` : "";
  return cfg.host ? `${cfg.host}${port}${db}` : "—";
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const DbInsightPage = () => {
  const { t } = useTranslation();
  const { api } = useApi();
  const [monitors, setMonitors] = useState<DbMonitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiResponse<DbMonitor[]>>("/monitors", {
        params: { type: "DATABASE", limit: 200 },
      });
      if (res.data.success) setMonitors(res.data.data);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const filtered = monitors.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.config.host ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (DB_META[m.config.type]?.label ?? m.config.type).toLowerCase().includes(search.toLowerCase()),
  );

  const stats = {
    total: monitors.length,
    up: monitors.filter((m) => m.latestResult?.status === "UP").length,
    down: monitors.filter((m) => m.latestResult?.status === "DOWN").length,
    degraded: monitors.filter((m) => m.latestResult?.status === "DEGRADED").length,
  };

  return (
    <div className="min-h-full bg-slate-50 p-6 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-400">{t("sidebar.dbInsight")}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
              {t("sidebar.dbInsightOverview")}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Deep analysis for database monitors — slow queries, index health, table sizes, connections, and replication.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total DBs",  value: stats.total,    cls: "text-slate-950 dark:text-white" },
            { label: "UP",         value: stats.up,       cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "DOWN",       value: stats.down,     cls: "text-rose-600 dark:text-rose-400" },
            { label: "DEGRADED",   value: stats.degraded, cls: "text-amber-600 dark:text-amber-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, host, or DB type…"
            className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-700/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-24 dark:border-slate-700 dark:bg-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-12 w-12 text-slate-300 dark:text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {monitors.length === 0 ? "No database monitors found" : "No results match your search"}
            </p>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              {monitors.length === 0
                ? "Add a DATABASE monitor to start collecting insights."
                : "Try a different search term."}
            </p>
            {monitors.length === 0 && (
              <Link
                to="/monitors/new"
                className="mt-5 rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
              >
                Add Monitor
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => {
              const meta = DB_META[m.config.type] ?? { label: m.config.type, bg: "bg-slate-100 ring-slate-600/20", color: "text-slate-700" };
              const status = m.latestResult?.status ?? null;

              return (
                <div
                  key={m.id}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-cyan-700"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.bg}`}>
                          {meta.label}
                        </span>
                        {!m.enabled && (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-600/20 dark:bg-slate-700 dark:text-slate-400">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate font-semibold text-slate-950 dark:text-white">{m.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500" title={getConnStr(m.config)}>
                        {getConnStr(m.config)}
                      </p>
                    </div>

                    {status ? (
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                        {status}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-slate-600/20 dark:bg-slate-700">
                        No data
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 divide-x divide-slate-100 px-0 dark:divide-slate-700">
                    {[
                      { label: "Uptime 24h", value: fmtPct(m.uptime24h), cls: uptimeColor(m.uptime24h) },
                      { label: "Response",   value: fmtMs(m.latestResult?.responseTimeMs ?? null), cls: "text-slate-700 dark:text-slate-300" },
                      { label: "Last check", value: m.latestResult ? fmtRelative(m.latestResult.checkedAt) : "—", cls: "text-slate-500 dark:text-slate-400" },
                    ].map((stat) => (
                      <div key={stat.label} className="px-4 py-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{stat.label}</p>
                        <p className={`mt-0.5 text-sm font-semibold ${stat.cls}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-700">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Every {m.interval}s
                    </p>
                    <Link
                      to={`/db-insight/${m.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
                    >
                      View Insights
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DbInsightPage;
