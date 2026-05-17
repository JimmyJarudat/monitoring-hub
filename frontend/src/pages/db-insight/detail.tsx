import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

// ─── Types ────────────────────────────────────────────────────────────────────
type DbType = "postgresql" | "mysql" | "mariadb" | "redis" | "mongodb" | "sqlite" | "sqlserver" | "mssql";

type Monitor = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: { type: DbType; host?: string; port?: number; database?: string; uri?: string };
  credentialId: string | null;
};

type InsightConfig = {
  id: string;
  enabled: boolean;
  collectIntervalMinutes: number;
  slowQueryThresholdMs: number;
  topNQueries: number;
} | null;

type SlowQuery = {
  id: string;
  queryHash: string;
  queryText: string;
  avgDurationMs: number;
  maxDurationMs: number;
  callCount: number;
  rowsExamined: number | null;
};

type IndexStat = {
  id: string;
  tableName: string;
  indexName: string | null;
  status: "MISSING" | "UNUSED" | "HEALTHY";
  scansCount: number;
  sizeBytes: number | null;
  lastUsed: string | null;
  suggestedSql: string | null;
};

type TableSize = {
  id: string;
  tableName: string;
  totalBytes: number;
  dataBytes: number;
  indexBytes: number;
  rowCount: number;
  lastAnalyzedAt: string | null;
};

type FileSize = {
  id: string;
  fileType: "DATA" | "LOG" | "WAL";
  filePath: string;
  sizeBytes: number;
};

type ProcessRow = {
  pid: number;
  loginName: string;
  appName: string;
  status: string;
  durationSec: number | null;
  database: string;
  isBlocked: boolean;
};

type ConnectionStat = {
  total: number;
  active: number;
  idle: number;
  idleInTransaction: number;
  maxConnections: number;
  blockedCount: number;
  longestBlockedSeconds: number | null;
  loginBreakdown?: Record<string, number> | null;
  processListJson?: ProcessRow[] | null;
} | null;

type ReplicationRow = {
  id: string;
  replicaName: string;
  state: "STREAMING" | "LAGGING" | "STOPPED";
  lagSeconds: number | null;
  detailJson: Record<string, unknown>;
};

type Snapshot = {
  id: string;
  monitorId: string;
  dbType: string;
  collectedAt: string;
  collectionDurationMs: number | null;
  errorMessage: string | null;
  slowQueries: SlowQuery[];
  indexStats: IndexStat[];
  tableSizes: TableSize[];
  fileSizes: FileSize[];
  connectionStats: ConnectionStat;
  replicationStatus: ReplicationRow[];
} | null;

type ApiSuccess<T> = { success: true; data: T };
type ApiResponse<T> = ApiSuccess<T> | { success: false; message: string };

// ─── DB type metadata ─────────────────────────────────────────────────────────
const DB_META: Record<DbType, { label: string; bg: string }> = {
  postgresql: { label: "PostgreSQL", bg: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-400/20" },
  mysql:      { label: "MySQL",      bg: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-400/20" },
  mariadb:    { label: "MariaDB",    bg: "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-900/20 dark:text-teal-300 dark:ring-teal-400/20" },
  redis:      { label: "Redis",      bg: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-400/20" },
  mongodb:    { label: "MongoDB",    bg: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-400/20" },
  sqlite:     { label: "SQLite",     bg: "bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-500/20" },
  sqlserver:  { label: "SQL Server", bg: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-400/20" },
  mssql:      { label: "MSSQL",      bg: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-400/20" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBytes = (b: number | null) => {
  if (b == null) return "—";
  if (b >= 1_099_511_627_776) return `${(b / 1_099_511_627_776).toFixed(1)} TB`;
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024) return `${(b / 1_024).toFixed(1)} KB`;
  return `${b} B`;
};

const fmtMs = (v: number) => {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v.toFixed(0)}ms`;
};

const fmtNum = (v: number) => v.toLocaleString();

const fmtRelative = (iso: string, t: (key: string, options?: Record<string, unknown>) => string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return t("dbInsightDetail.relativeSeconds", { count: diff });
  if (diff < 3600) return t("dbInsightDetail.relativeMinutes", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("dbInsightDetail.relativeHours", { count: Math.floor(diff / 3600) });
  return t("dbInsightDetail.relativeDays", { count: Math.floor(diff / 86400) });
};

const copyToClipboard = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) => {
  const rail =
    accent?.includes("rose") ? "bg-rose-500" :
    accent?.includes("amber") ? "bg-amber-500" :
    accent?.includes("emerald") ? "bg-emerald-500" :
    "bg-cyan-500";

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
      <div className={`absolute inset-x-0 top-0 h-1 ${rail}`} />
      <div className="flex min-h-[84px] flex-col justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <div>
          <p className={`text-2xl font-bold leading-none ${accent ?? "text-slate-900 dark:text-white"}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = "slow" | "index" | "tables" | "connections" | "replication";

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "slow",        labelKey: "dbInsightDetail.tabs.slow" },
  { key: "index",       labelKey: "dbInsightDetail.tabs.index" },
  { key: "tables",      labelKey: "dbInsightDetail.tabs.tables" },
  { key: "connections", labelKey: "dbInsightDetail.tabs.connections" },
  { key: "replication", labelKey: "dbInsightDetail.tabs.replication" },
];

// ─── Slow Queries Tab ─────────────────────────────────────────────────────────
const SlowQueriesTab = ({ queries, threshold }: { queries: SlowQuery[]; threshold: number }) => {
  const { t } = useTranslation();

  if (queries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <p className="text-sm">{t("dbInsightDetail.emptySlowQueries", { threshold })}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
            <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colQuery")}</th>
            <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">{t("dbInsightDetail.colAvgTime")}</th>
            <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">{t("dbInsightDetail.colMaxTime")}</th>
            <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">{t("dbInsightDetail.colCalls")}</th>
            <th className="pb-2 font-medium text-slate-500 dark:text-slate-400 text-right whitespace-nowrap">{t("dbInsightDetail.colRows")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {queries.map((q) => (
            <tr key={q.id} className="group">
              <td className="py-2 pr-4 max-w-xs">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 inline-flex h-1.5 w-1.5 rounded-full ${
                      q.avgDurationMs > 5000 ? "bg-rose-500" : q.avgDurationMs > 1000 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-sm" title={q.queryText}>
                      {q.queryText}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(q.queryText)}
                    className="opacity-0 group-hover:opacity-100 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-opacity"
                    title={t("dbInsightDetail.copyQuery")}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  </button>
                </div>
              </td>
              <td className={`py-2 pr-4 text-right font-mono font-semibold ${q.avgDurationMs > 5000 ? "text-rose-600 dark:text-rose-400" : q.avgDurationMs > 1000 ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>
                {fmtMs(q.avgDurationMs)}
              </td>
              <td className="py-2 pr-4 text-right font-mono text-slate-500 dark:text-slate-400">
                {fmtMs(q.maxDurationMs)}
              </td>
              <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                {fmtNum(q.callCount)}
              </td>
              <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                {q.rowsExamined != null ? fmtNum(q.rowsExamined) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Index Analysis Tab ───────────────────────────────────────────────────────
const INDEX_STATUS_STYLE = {
  MISSING: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/20 dark:text-rose-300",
  UNUSED:  "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300",
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300",
};

const IndexAnalysisTab = ({ stats }: { stats: IndexStat[] }) => {
  const { t } = useTranslation();
  const missing = stats.filter((s) => s.status === "MISSING");
  const unused  = stats.filter((s) => s.status === "UNUSED");
  const healthy = stats.filter((s) => s.status === "HEALTHY");

  const Section = ({ title, items, emptyMsg }: { title: string; items: IndexStat[]; emptyMsg: string }) => (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{title} <span className="font-normal text-slate-400">({items.length})</span></h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">{emptyMsg}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-1">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                <th className="pb-2 pr-3 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colTable")}</th>
                <th className="pb-2 pr-3 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colIndex")}</th>
                <th className="pb-2 pr-3 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colScans")}</th>
                <th className="pb-2 pr-3 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colSize")}</th>
                <th className="pb-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colSuggestion")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((i) => (
                <tr key={i.id} className="group">
                  <td className="py-1.5 pr-3 font-mono text-xs text-slate-700 dark:text-slate-300">{i.tableName}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs text-slate-500 dark:text-slate-400">{i.indexName ?? <span className="italic">—</span>}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-600 dark:text-slate-300">{fmtNum(i.scansCount)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-500 dark:text-slate-400">{fmtBytes(i.sizeBytes)}</td>
                  <td className="py-1.5 max-w-xs">
                    {i.suggestedSql ? (
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs" title={i.suggestedSql}>{i.suggestedSql}</code>
                        <button
                          onClick={() => copyToClipboard(i.suggestedSql!)}
                          className="opacity-0 group-hover:opacity-100 shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-opacity"
                          title={t("dbInsightDetail.copySql")}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                        </button>
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
        <p className="text-sm">{t("dbInsightDetail.emptyIndexData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(["MISSING", "UNUSED", "HEALTHY"] as const).map((s) => (
          <span key={s} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${INDEX_STATUS_STYLE[s]}`}>
            {s === "MISSING" ? missing.length : s === "UNUSED" ? unused.length : healthy.length} {s}
          </span>
        ))}
      </div>
      <Section title={t("dbInsightDetail.missingIndexes")} items={missing} emptyMsg={t("dbInsightDetail.noMissingIndexes")} />
      <Section title={t("dbInsightDetail.unusedIndexes")} items={unused} emptyMsg={t("dbInsightDetail.noUnusedIndexes")} />
      <Section title={t("dbInsightDetail.healthyIndexes")} items={healthy} emptyMsg={t("dbInsightDetail.noIndexData")} />
    </div>
  );
};

// ─── Tables & Files Tab ───────────────────────────────────────────────────────
const TablesFilesTab = ({ tables, files }: { tables: TableSize[]; files: FileSize[] }) => {
  const { t } = useTranslation();
  const FILE_ICON: Record<FileSize["fileType"], string> = {
    DATA: "text-blue-500",
    LOG:  "text-amber-500",
    WAL:  "text-purple-500",
  };

  const totalDbBytes = files.find((f) => f.fileType === "DATA")?.sizeBytes ?? null;

  return (
    <div className="space-y-8">
      {/* File sizes */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t("dbInsightDetail.fileSizes")}</h3>
        {files.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("dbInsightDetail.noFileSizeData")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {files.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 flex items-center gap-3">
                <div className={`${FILE_ICON[f.fileType]} shrink-0`}>
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{f.fileType}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{fmtBytes(f.sizeBytes)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate" title={f.filePath}>{f.filePath}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table sizes */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t("dbInsightDetail.tableSizes")}</h3>
        {tables.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("dbInsightDetail.noTableSizeData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colTable")}</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colTotal")}</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colData")}</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colIndexes")}</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colRows")}</th>
                  <th className="pb-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colBar")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tables.map((t) => {
                  const pct = totalDbBytes && totalDbBytes > 0 ? (t.totalBytes / totalDbBytes) * 100 : 0;
                  return (
                    <tr key={t.id}>
                      <td className="py-1.5 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">{t.tableName}</td>
                      <td className="py-1.5 pr-4 text-right font-semibold text-slate-800 dark:text-slate-200">{fmtBytes(t.totalBytes)}</td>
                      <td className="py-1.5 pr-4 text-right text-slate-500 dark:text-slate-400">{fmtBytes(t.dataBytes)}</td>
                      <td className="py-1.5 pr-4 text-right text-slate-500 dark:text-slate-400">{fmtBytes(t.indexBytes)}</td>
                      <td className="py-1.5 pr-4 text-right text-slate-500 dark:text-slate-400">{fmtNum(t.rowCount)}</td>
                      <td className="py-1.5 min-w-20">
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Connections Tab ──────────────────────────────────────────────────────────
const fmtDuration = (sec: number | null) => {
  if (sec == null || sec < 0) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
};

const STATUS_DOT_CONN: Record<string, string> = {
  active:  "bg-emerald-500",
  running: "bg-emerald-500",
  idle:    "bg-slate-300 dark:bg-slate-600",
  sleeping:"bg-slate-300 dark:bg-slate-600",
  "idle in transaction": "bg-amber-500",
  blocked: "bg-rose-500",
};

const ConnectionsTab = ({ stat }: { stat: ConnectionStat }) => {
  const { t } = useTranslation();

  if (!stat) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
        <p className="text-sm">{t("dbInsightDetail.noConnectionData")}</p>
      </div>
    );
  }

  const usedPct = stat.maxConnections > 0 ? (stat.total / stat.maxConnections) * 100 : 0;
  const usedColor = usedPct > 80 ? "bg-rose-500" : usedPct > 60 ? "bg-amber-500" : "bg-emerald-500";
  const processList = stat.processListJson ?? [];

  return (
    <div className="space-y-6">
      {/* Usage bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("dbInsightDetail.connectionPoolUsage")}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {stat.total} / {stat.maxConnections} <span className="text-xs font-normal text-slate-400">({usedPct.toFixed(0)}%)</span>
          </p>
        </div>
        <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${usedColor}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: t("dbInsightDetail.active"),       value: stat.active,           accent: stat.active > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined },
          { label: t("dbInsightDetail.idle"),         value: stat.idle },
          { label: t("dbInsightDetail.idleInTxn"),  value: stat.idleInTransaction, accent: stat.idleInTransaction > 0 ? "text-amber-600 dark:text-amber-400" : undefined },
          { label: t("dbInsightDetail.blocked"),      value: stat.blockedCount,      accent: stat.blockedCount > 0 ? "text-rose-600 dark:text-rose-400" : undefined },
          { label: t("dbInsightDetail.maxAllowed"),  value: stat.maxConnections },
        ].map((card) => (
          <StatCard key={card.label} label={card.label} value={String(card.value)} accent={card.accent} />
        ))}
      </div>

      {stat.longestBlockedSeconds != null && stat.longestBlockedSeconds > 0 && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-700 dark:text-rose-300">
          {t("dbInsightDetail.longestBlockedQuery")} <strong>{stat.longestBlockedSeconds.toFixed(1)}s</strong>
        </div>
      )}

      {/* Process list */}
      {processList.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {t("dbInsightDetail.activeSessions")} <span className="font-normal text-slate-400">({processList.length})</span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">PID</th>
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colUser")}</th>
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colApplication")}</th>
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colState")}</th>
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colDuration")}</th>
                  <th className="px-3 py-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colDatabase")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {processList.map((row) => {
                  const dotKey = row.isBlocked ? "blocked" : row.status.toLowerCase();
                  const dotColor = STATUS_DOT_CONN[dotKey] ?? "bg-slate-300 dark:bg-slate-600";
                  const isLongRunning = row.durationSec != null && row.durationSec > 300;
                  return (
                    <tr
                      key={row.pid}
                      className={`${row.isBlocked ? "bg-rose-50/50 dark:bg-rose-900/10" : isLongRunning ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{row.pid}</td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-700 dark:text-slate-300">{row.loginName}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-45 truncate" title={row.appName}>
                        {row.appName || <span className="italic text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className={`${row.isBlocked ? "text-rose-600 dark:text-rose-400 font-medium" : "text-slate-600 dark:text-slate-300"}`}>
                            {row.isBlocked ? t("dbInsightDetail.blocked") : row.status}
                          </span>
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${isLongRunning ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-500 dark:text-slate-400"}`}>
                        {fmtDuration(row.durationSec)}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-400 dark:text-slate-500">{row.database}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-user breakdown */}
      {stat.loginBreakdown && Object.keys(stat.loginBreakdown).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t("dbInsightDetail.connectionsByUser")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colUserLogin")}</th>
                  <th className="pb-2 pr-4 font-medium text-slate-500 dark:text-slate-400 text-right">{t("dbInsightDetail.colConnections")}</th>
                  <th className="pb-2 font-medium text-slate-500 dark:text-slate-400">{t("dbInsightDetail.colShare")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(stat.loginBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([user, count]) => {
                    const pct = stat.total > 0 ? (count / stat.total) * 100 : 0;
                    return (
                      <tr key={user}>
                        <td className="py-1.5 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">{user}</td>
                        <td className="py-1.5 pr-4 text-right font-semibold text-slate-800 dark:text-slate-200">{count}</td>
                        <td className="py-1.5 min-w-25">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500 w-8 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Replication Tab ──────────────────────────────────────────────────────────
const REPLICATION_STYLE = {
  STREAMING: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300",
  LAGGING:   "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300",
  STOPPED:   "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/20 dark:text-rose-300",
};

const REPL_TYPE_STYLE: Record<string, string> = {
  AlwaysOn_AG:  "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300",
  LogShipping:  "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-900/20 dark:text-violet-300",
  Mirroring:    "bg-slate-100 text-slate-600 ring-slate-600/20 dark:bg-slate-700 dark:text-slate-300",
};

const ReplicationTab = ({ replicas }: { replicas: ReplicationRow[] }) => {
  const { t } = useTranslation();

  if (replicas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
        <p className="text-sm">{t("dbInsightDetail.noReplication")}</p>
        <p className="text-xs text-slate-400">{t("dbInsightDetail.standaloneHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {replicas.map((r) => {
        const replType = typeof r.detailJson.type === "string" ? r.detailJson.type : null;
        const typeStyle = replType ? REPL_TYPE_STYLE[replType] : null;

        // Build detail key-value pairs from detailJson
        const details = Object.entries(r.detailJson)
          .filter(([k, v]) => k !== "type" && v != null && v !== "")
          .map(([k, v]) => ({ k, v: String(v) }));

        return (
          <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{r.replicaName}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${REPLICATION_STYLE[r.state]}`}>
                {r.state}
              </span>
              {typeStyle && replType && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${typeStyle}`}>
                  {replType.replace("_", " ")}
                </span>
              )}
              <span className={`ml-auto font-mono text-sm font-bold ${r.lagSeconds != null && r.lagSeconds > 30 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}`}>
                {r.lagSeconds != null ? t("dbInsightDetail.lagSeconds", { seconds: r.lagSeconds.toFixed(1) }) : t("dbInsightDetail.lagUnavailable")}
              </span>
            </div>

            {/* Detail grid */}
            {details.length > 0 && (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                {details.map(({ k, v }) => (
                  <div key={k} className="flex gap-1 min-w-0">
                    <dt className="shrink-0 text-slate-400 dark:text-slate-500 capitalize">
                      {k.replace(/([A-Z])/g, " $1").toLowerCase()}:
                    </dt>
                    <dd className="font-mono text-slate-600 dark:text-slate-300 truncate" title={v}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const DbInsightDetailPage = () => {
  const { monitorId } = useParams<{ monitorId: string }>();
  const { t } = useTranslation();
  const { api } = useApi();

  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [config, setConfig] = useState<InsightConfig>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("slow");

  const load = useCallback(async () => {
    if (!monitorId) return;
    setIsLoading(true);
    try {
      const res = await api.get<ApiResponse<{ monitor: Monitor; config: InsightConfig; snapshot: Snapshot }>>(
        `/db-insight/${monitorId}/latest`,
      );
      if (res.data.success) {
        setMonitor(res.data.data.monitor);
        setConfig(res.data.data.config);
        setSnapshot(res.data.data.snapshot);
      }
    } finally {
      setIsLoading(false);
    }
  }, [api, monitorId]);

  useEffect(() => { void load(); }, [load]);

  const dbType = (monitor?.config?.type ?? "postgresql") as DbType;
  const dbMeta = DB_META[dbType] ?? DB_META.postgresql;
  const targetLabel = monitor?.config.host
    ? `${monitor.config.host}${monitor.config.port ? `:${monitor.config.port}` : ""}${monitor.config.database ? `/${monitor.config.database}` : ""}`
    : monitor?.config.uri
      ? t("dbInsightDetail.uriConfigured")
      : t("common.notAvailable");
  const nonHealthyIndexCount = snapshot?.indexStats.filter((i) => i.status !== "HEALTHY").length ?? 0;
  const blockedCount = snapshot?.connectionStats?.blockedCount ?? 0;
  const replicationIssueCount = snapshot?.replicationStatus.filter((r) => r.state !== "STREAMING").length ?? 0;
  const issueCount = (snapshot?.slowQueries.length ?? 0) + nonHealthyIndexCount + blockedCount + replicationIssueCount;
  const connectionUsedPct = snapshot?.connectionStats && snapshot.connectionStats.maxConnections > 0
    ? (snapshot.connectionStats.total / snapshot.connectionStats.maxConnections) * 100
    : null;
  const healthTone = issueCount > 0 || (connectionUsedPct ?? 0) > 80
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200"
    : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
        <p className="text-lg font-medium">{t("dbInsightDetail.monitorNotFound")}</p>
        <Link to="/db-insight" className="text-sm text-cyan-600 hover:underline">{t("dbInsightDetail.backToDbInsight")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-start gap-4 p-4">
          <div className="flex-1 min-w-0">
            <Link to="/db-insight" className="text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300">
              {t("dbInsightDetail.backToDbInsight")}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">{monitor.name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${dbMeta.bg}`}>
                {dbMeta.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                config?.enabled
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-300"
              }`}>
                {config?.enabled ? t("dbInsightDetail.collecting") : t("dbInsightDetail.notEnabled")}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/30">
                <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.target")}</span>
                <span className="block truncate font-mono text-slate-700 dark:text-slate-200" title={targetLabel}>{targetLabel}</span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/30">
                <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.collectionInterval")}</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {config ? t("dbInsightDetail.minutes", { count: config.collectIntervalMinutes }) : "—"}
                </span>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/30">
                <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.slowThreshold")}</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {config ? `${config.slowQueryThresholdMs}ms` : "—"}
                </span>
              </div>
            </div>
            {!config?.enabled && (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                {t("dbInsightDetail.notEnabledHint")}{" "}
                <Link to={`/monitors/${monitor.id}`} className="font-medium underline">{t("dbInsightDetail.enableInMonitorSettings")}</Link>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {snapshot && (
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `db-insight-${monitor.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {t("dbInsightDetail.export")}
              </button>
            )}
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {t("common.refresh")}
            </button>
          </div>
        </div>
        {snapshot && (
          <div className="grid border-t border-slate-100 bg-slate-50/70 text-xs dark:border-slate-700 dark:bg-slate-900/20 sm:grid-cols-4">
            <div className="px-4 py-3">
              <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.snapshotAge", { age: "" }).replace(":", "").trim()}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{fmtRelative(snapshot.collectedAt, t)}</span>
            </div>
            <div className="px-4 py-3">
              <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.connectionPoolUsage")}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {connectionUsedPct == null ? "—" : `${connectionUsedPct.toFixed(0)}%`}
              </span>
            </div>
            <div className="px-4 py-3">
              <span className="block uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("dbInsightDetail.warning", { message: "" }).replace(":", "").trim()}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{issueCount}</span>
            </div>
            <div className={`m-2 rounded-lg border px-3 py-2 ${healthTone}`}>
              <span className="block text-xs font-semibold uppercase tracking-wide">{config?.enabled ? t("dbInsightDetail.collecting") : t("dbInsightDetail.notEnabled")}</span>
              <span className="text-lg font-bold leading-tight">{issueCount > 0 ? issueCount : "OK"}</span>
            </div>
          </div>
        )}
      </div>

      {/* No snapshot yet */}
      {!snapshot ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-10 flex flex-col items-center gap-3 text-center">
          <svg className="h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
          <p className="text-base font-medium text-slate-700 dark:text-slate-200">{t("dbInsightDetail.noSnapshots")}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">
            {config?.enabled
              ? t("dbInsightDetail.nextSnapshotHint", { minutes: config.collectIntervalMinutes })
              : t("dbInsightDetail.enableHint")}
          </p>
          {!config?.enabled && (
            <Link
              to={`/monitors/${monitor.id}`}
              className="mt-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
            >
              {t("dbInsightDetail.openMonitorSettings")}
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Snapshot meta */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <span>{t("dbInsightDetail.snapshotAge", { age: fmtRelative(snapshot.collectedAt, t) })}</span>
            {snapshot.collectionDurationMs != null && (
              <span>{t("dbInsightDetail.collectionTook", { ms: snapshot.collectionDurationMs })}</span>
            )}
            {snapshot.errorMessage && (
              <span className="text-amber-600 dark:text-amber-400">{t("dbInsightDetail.warning", { message: snapshot.errorMessage })}</span>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label={t("dbInsightDetail.activeConnections")}
              value={snapshot.connectionStats ? String(snapshot.connectionStats.active) : "—"}
              sub={snapshot.connectionStats ? t("dbInsightDetail.ofMax", { max: snapshot.connectionStats.maxConnections }) : undefined}
              accent={
                snapshot.connectionStats && snapshot.connectionStats.active / snapshot.connectionStats.maxConnections > 0.8
                  ? "text-rose-600 dark:text-rose-400"
                  : undefined
              }
            />
            <StatCard
              label={t("dbInsightDetail.slowQueries")}
              value={String(snapshot.slowQueries.length)}
              sub={config ? t("dbInsightDetail.thresholdSub", { threshold: config.slowQueryThresholdMs }) : undefined}
              accent={snapshot.slowQueries.length > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
            <StatCard
              label={t("dbInsightDetail.dbSize")}
              value={fmtBytes(snapshot.fileSizes.find((f) => f.fileType === "DATA")?.sizeBytes ?? null)}
            />
            <StatCard
              label={t("dbInsightDetail.blockedQueries")}
              value={snapshot.connectionStats ? String(snapshot.connectionStats.blockedCount) : "—"}
              accent={(snapshot.connectionStats?.blockedCount ?? 0) > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
            />
            <StatCard
              label={t("dbInsightDetail.replicas")}
              value={String(snapshot.replicationStatus.length)}
              sub={
                snapshot.replicationStatus.length > 0
                  ? snapshot.replicationStatus.every((r) => r.state === "STREAMING")
                    ? t("dbInsightDetail.allStreaming")
                    : t("dbInsightDetail.checkReplicationTab")
                  : t("dbInsightDetail.standalone")
              }
            />
          </div>

          {/* Tabs */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            {/* Tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-700 flex overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {t(tab.labelKey)}
                  {tab.key === "slow" && snapshot.slowQueries.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-1.5 py-0.5">
                      {snapshot.slowQueries.length}
                    </span>
                  )}
                  {tab.key === "index" && snapshot.indexStats.filter((i) => i.status !== "HEALTHY").length > 0 && (
                    <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs px-1.5 py-0.5">
                      {snapshot.indexStats.filter((i) => i.status !== "HEALTHY").length}
                    </span>
                  )}
                  {tab.key === "connections" && (snapshot.connectionStats?.blockedCount ?? 0) > 0 && (
                    <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-xs px-1.5 py-0.5">
                      {t("dbInsightDetail.blockedBadge", { count: snapshot.connectionStats!.blockedCount })}
                    </span>
                  )}
                  {tab.key === "replication" && snapshot.replicationStatus.some((r) => r.state !== "STREAMING") && (
                    <span className="ml-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-1.5 py-0.5">
                      {snapshot.replicationStatus.filter((r) => r.state !== "STREAMING").length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4">
              {activeTab === "slow" && (
                <SlowQueriesTab
                  queries={snapshot.slowQueries}
                  threshold={config?.slowQueryThresholdMs ?? 1000}
                />
              )}
              {activeTab === "index" && <IndexAnalysisTab stats={snapshot.indexStats} />}
              {activeTab === "tables" && (
                <TablesFilesTab tables={snapshot.tableSizes} files={snapshot.fileSizes} />
              )}
              {activeTab === "connections" && <ConnectionsTab stat={snapshot.connectionStats} />}
              {activeTab === "replication" && <ReplicationTab replicas={snapshot.replicationStatus} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DbInsightDetailPage;
