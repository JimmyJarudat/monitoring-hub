import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type LogLevel = "INFO" | "WARN" | "ERROR";

type SystemLogRow = {
  id: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

type SystemLogResponse = {
  items: SystemLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: string[];
};

const formatDate = (v: string, locale: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  INFO: "bg-sky-100 text-sky-700",
  WARN: "bg-amber-100 text-amber-700",
  ERROR: "bg-red-100 text-red-700",
};

const stringifyJson = (v: unknown) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

const buildParams = (
  p: number,
  limit: number,
  level: string,
  category: string,
  search: string,
  from: string,
  to: string,
) => {
  const params: Record<string, string | number> = { page: p, limit };
  if (level) params.level = level;
  if (category) params.category = category;
  if (search.trim()) params.search = search.trim();
  if (from) params.from = new Date(from).toISOString();
  if (to) {
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    params.to = d.toISOString();
  }
  return params;
};

const DATE_SLUG = () => new Date().toISOString().slice(0, 10);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportToCsv = (rows: SystemLogRow[]) => {
  const header = ["timestamp", "level", "category", "message", "metadata"];
  const lines = rows.map((r) => [
    r.createdAt,
    r.level,
    r.category,
    `"${r.message.replace(/"/g, '""')}"`,
    r.metadata != null ? `"${stringifyJson(r.metadata).replace(/"/g, '""')}"` : "",
  ]);
  const csv = [header, ...lines].map((row) => row.join(",")).join("\n");
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `system-logs-${DATE_SLUG()}.csv`);
};

const exportToJson = (rows: SystemLogRow[]) => {
  const json = JSON.stringify(rows, null, 2);
  downloadBlob(new Blob([json], { type: "application/json;charset=utf-8;" }), `system-logs-${DATE_SLUG()}.json`);
};

const SystemLogsPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";

  const [data, setData] = useState<SystemLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"" | "csv" | "json">("");

  const [page, setPage] = useState(1);
  const [levelFilter, setLevelFilter] = useState<"" | LogLevel>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [jsonPanel, setJsonPanel] = useState<{ title: string; value: unknown } | null>(null);

  const totalPages = useMemo(() => Math.max(data?.totalPages ?? 1, 1), [data]);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = buildParams(p, 50, levelFilter, categoryFilter, search, from, to);
        const res = await api.get<ApiResponse<SystemLogResponse>>("/admin/system-logs", { params });
        if (!res.data.success) { toast.error(res.data.message); return; }
        setData(res.data.data);
        setPage(p);
      } catch {
        toast.error(t("systemLogs.loadError"));
      } finally {
        setLoading(false);
      }
    },
    [api, levelFilter, categoryFilter, search, from, to],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const applyFilters = () => {
    setPage(1);
    void load(1);
  };

  const clearFilters = () => {
    setLevelFilter("");
    setCategoryFilter("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const fetchAllFiltered = async () => {
    const params = buildParams(1, 10000, levelFilter, categoryFilter, search, from, to);
    const res = await api.get<ApiResponse<SystemLogResponse>>("/admin/system-logs", { params });
    if (!res.data.success) throw new Error(res.data.message);
    return res.data.data.items;
  };

  const handleExportCsv = async () => {
    setExporting("csv");
    try {
      const rows = await fetchAllFiltered();
      exportToCsv(rows);
      toast.success(t("systemLogs.exportCsvSuccess", { count: rows.length }));
    } catch {
      toast.error(t("systemLogs.exportError"));
    } finally {
      setExporting("");
    }
  };

  const handleExportJson = async () => {
    setExporting("json");
    try {
      const rows = await fetchAllFiltered();
      exportToJson(rows);
      toast.success(t("systemLogs.exportJsonSuccess", { count: rows.length }));
    } catch {
      toast.error(t("systemLogs.exportError"));
    } finally {
      setExporting("");
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("systemLogs.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("systemLogs.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {t("systemLogs.description")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={exporting !== "" || loading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {exporting === "csv" ? t("systemLogs.exporting") : t("systemLogs.exportCsv")}
          </button>
          <button
            type="button"
            onClick={() => void handleExportJson()}
            disabled={exporting !== "" || loading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {exporting === "json" ? t("systemLogs.exporting") : t("systemLogs.exportJson")}
          </button>
          <button
            type="button"
            onClick={() => void load(page)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {t("common.refresh")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(160px,0.8fr)_minmax(160px,0.8fr)_minmax(160px,0.8fr)_minmax(200px,1fr)_auto]">
          {/* Level */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("systemLogs.level")}</span>
            <div className="mt-2 flex gap-1">
              {(["", "INFO", "WARN", "ERROR"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => { setLevelFilter(l); setPage(1); }}
                  className={[
                    "rounded-md px-3 py-2 text-xs font-semibold transition",
                    levelFilter === l
                      ? l === "" ? "bg-slate-950 text-white"
                        : l === "INFO" ? "bg-sky-500 text-white"
                        : l === "WARN" ? "bg-amber-500 text-slate-950"
                        : "bg-red-500 text-white"
                      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {l || t("systemLogs.all")}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("systemLogs.category")}</span>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="">{t("systemLogs.allCategories")}</option>
              {(data?.categories ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("incidents.filterFrom")}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("incidents.filterTo")}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("systemLogs.search")}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("systemLogs.searchPlaceholder")}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {t("incidents.apply")}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {t("dashboard.clear")}
            </button>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">{t("systemLogs.entriesTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? t("common.loading") : t("systemLogs.recordsCount", { count: (data?.total ?? 0).toLocaleString() })}
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {t("systemLogs.pageCount", { page, totalPages })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">{t("systemLogs.time")}</th>
                <th className="px-4 py-3">{t("systemLogs.level")}</th>
                <th className="px-4 py-3">{t("systemLogs.category")}</th>
                <th className="px-4 py-3">{t("systemLogs.message")}</th>
                <th className="px-4 py-3 text-right">{t("systemLogs.meta")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    {t("systemLogs.noData")}
                  </td>
                </tr>
              ) : (
                (data?.items ?? []).map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(row.createdAt, locale)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_BADGE[row.level]}`}>
                        {row.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                        {row.category}
                      </span>
                    </td>
                    <td className="max-w-xl px-4 py-3 text-slate-800">
                      {row.message}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.metadata != null && (
                        <button
                          type="button"
                          onClick={() => setJsonPanel({ title: `${row.category} — ${row.level}`, value: row.metadata })}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          {t("systemLogs.details")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("systemLogs.previous")}
          </button>
          <span className="text-xs text-slate-500">
            {t("systemLogs.showing", { shown: (data?.items.length ?? 0).toLocaleString(), total: (data?.total ?? 0).toLocaleString() })}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => void load(page + 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("systemLogs.next")}
          </button>
        </div>
      </section>

      {/* JSON detail modal */}
      {jsonPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-950">{jsonPanel.title}</h2>
              <button
                type="button"
                onClick={() => setJsonPanel(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {t("systemLogs.close")}
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-100">
              {stringifyJson(jsonPanel.value)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemLogsPage;
