import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "DOCKER" | "DATABASE";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type ResultMonitor = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  interval: number;
  config: Record<string, unknown>;
};

type MonitorResultRow = {
  id: string;
  monitorId: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  metadata?: Record<string, unknown> | null;
  checkedAt: string;
  monitor: ResultMonitor;
};

type ResultsResponse = {
  items: MonitorResultRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<MonitorStatus, number>;
};

type TimeRangePreset = "day" | "week" | "month" | "custom";

const PAGE_SIZE = 50;

const timeRangeOptions: Array<{ label: string; value: TimeRangePreset }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom", value: "custom" },
];

const statusOptions: Array<{ label: string; value: "ALL" | MonitorStatus }> = [
  { label: "All status", value: "ALL" },
  { label: "UP", value: "UP" },
  { label: "DEGRADED", value: "DEGRADED" },
  { label: "DOWN", value: "DOWN" },
];

const typeOptions: Array<{ label: string; value: "ALL" | MonitorType }> = [
  { label: "All types", value: "ALL" },
  { label: "PING", value: "PING" },
  { label: "TCP", value: "TCP" },
  { label: "HTTP", value: "HTTP" },
  { label: "TLS_CERT", value: "TLS_CERT" },
  { label: "DNS", value: "DNS" },
  { label: "DOCKER", value: "DOCKER" },
  { label: "DATABASE", value: "DATABASE" },
];

const presetDurationsMs: Record<Exclude<TimeRangePreset, "custom">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const statusStyles: Record<MonitorStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const toDateTimeLocalValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocalValue = (value: string) => {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const formatDateTime = (value: string) => {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const getTarget = (monitor: ResultMonitor) => {
  const config = monitor.config;

  if (typeof config.url === "string") return config.url;
  if (typeof config.host === "string" && typeof config.recordType === "string") {
    return `${config.host} (${config.recordType})`;
  }
  if (typeof config.host === "string" && typeof config.port === "number") {
    return `${config.host}:${config.port}`;
  }
  if (typeof config.host === "string") return config.host;
  if (typeof config.portainerUrl === "string") return config.portainerUrl;
  if (typeof config.filename === "string") return config.filename;
  if (config.type === "sqlite" && typeof config.database === "string") return config.database;

  return "-";
};

const ResultsPage = () => {
  const { api } = useApi();
  const [results, setResults] = useState<MonitorResultRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("day");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MonitorStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | MonitorType>("ALL");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - presetDurationsMs.day)),
  );
  const [customTo, setCustomTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [appliedFrom, setAppliedFrom] = useState(() =>
    new Date(Date.now() - presetDurationsMs.day).toISOString(),
  );
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString());
  const [statusCounts, setStatusCounts] = useState<Record<MonitorStatus, number>>({
    UP: 0,
    DOWN: 0,
    DEGRADED: 0,
  });
  const [page, setPage] = useState(1);

  const fetchResults = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (mode === "replace") {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await api.get<ApiResponse<ResultsResponse>>("/monitors/results", {
          params: {
            page: nextPage,
            limit: PAGE_SIZE,
            from: appliedFrom,
            to: appliedTo,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            type: typeFilter === "ALL" ? undefined : typeFilter,
          },
        });

        if (!response.data.success) {
          toast.error(response.data.message);
          return;
        }

        const nextItems = response.data.data.items;

        setResults((current) => (mode === "append" ? [...current, ...nextItems] : nextItems));
        setHasMore(response.data.data.hasMore);
        setPage(response.data.data.page);

        if (mode === "replace") {
          setStatusCounts(response.data.data.statusCounts);
        }
      } catch {
        toast.error("โหลดผลตรวจไม่สำเร็จ");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [api, appliedFrom, appliedTo, statusFilter, typeFilter],
  );

  useEffect(() => {
    void fetchResults(1, "replace");
  }, [fetchResults]);

  const handleTimeRangeChange = (value: TimeRangePreset) => {
    setTimeRange(value);

    if (value !== "custom") {
      const nextTo = new Date();
      const nextFrom = new Date(nextTo.getTime() - presetDurationsMs[value]);
      setCustomFrom(toDateTimeLocalValue(nextFrom));
      setCustomTo(toDateTimeLocalValue(nextTo));
      setAppliedFrom(nextFrom.toISOString());
      setAppliedTo(nextTo.toISOString());
    }
  };

  const handleApplyCustomRange = () => {
    const from = toIsoFromLocalValue(customFrom);
    const to = toIsoFromLocalValue(customTo);

    if (!from || !to) {
      toast.error("กรุณาเลือกช่วงเวลาให้ครบ");
      return;
    }

    if (new Date(from).getTime() > new Date(to).getTime()) {
      toast.error("เวลาเริ่มต้นต้องไม่มากกว่าเวลาสิ้นสุด");
      return;
    }

    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const summary = useMemo(() => {
    const responseTimes = results
      .map((result) => result.responseTimeMs)
      .filter((value): value is number => typeof value === "number");

    return {
      total: results.length,
      up: results.filter((result) => result.status === "UP").length,
      degraded: results.filter((result) => result.status === "DEGRADED").length,
      down: results.filter((result) => result.status === "DOWN").length,
      avgResponseTimeMs:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
          : null,
    };
  }, [results]);

  const activeRangeLabel = useMemo(() => {
    if (timeRange === "custom") {
      return `${formatDateTime(appliedFrom)} - ${formatDateTime(appliedTo)}`;
    }

    return timeRangeOptions.find((option) => option.value === timeRange)?.label ?? "Day";
  }, [appliedFrom, appliedTo, timeRange]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Monitor Results</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            รวมผลตรวจของทุก monitor ในหน้าเดียว เพื่อไล่ดูช่วงเวลาที่มีปัญหา, down หลายตัวพร้อมกัน,
            และ response time ที่ผิดปกติได้เร็วขึ้น
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            type="button"
            onClick={() => void fetchResults(1, "replace")}
          >
            Refresh
          </button>
          <Link
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            to="/monitors"
          >
            Back to Monitors
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Displayed", value: summary.total, tone: "text-slate-950" },
          { label: "UP", value: summary.up, tone: "text-emerald-700" },
          { label: "Degraded", value: summary.degraded, tone: "text-amber-700" },
          { label: "Down", value: summary.down, tone: "text-rose-700" },
          {
            label: "Avg response",
            value: summary.avgResponseTimeMs === null ? "-" : `${summary.avgResponseTimeMs} ms`,
            tone: "text-cyan-700",
          },
        ].map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Filters</h2>
              <p className="mt-1 text-sm text-slate-500">
                Current range: <span className="font-medium text-slate-700">{activeRangeLabel}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {timeRangeOptions.map((option) => {
                const isActive = timeRange === option.value;

                return (
                  <button
                    className={[
                      "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                        : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-100",
                    ].join(" ")}
                    key={option.value}
                    type="button"
                    onClick={() => handleTimeRangeChange(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | MonitorStatus)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Monitor type</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "ALL" | MonitorType)}
              >
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {timeRange === "custom" ? (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">From</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="datetime-local"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">To</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="datetime-local"
                      value={customTo}
                      onChange={(event) => setCustomTo(event.target.value)}
                    />
                    <button
                      className="shrink-0 rounded-md border border-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                      type="button"
                      onClick={handleApplyCustomRange}
                    >
                      Apply
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <div className="lg:col-span-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">Quick snapshot</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Page 1 counts in the current filter:
                    <span className="ml-2 text-emerald-700">UP {statusCounts.UP}</span>
                    <span className="ml-3 text-amber-700">DEGRADED {statusCounts.DEGRADED}</span>
                    <span className="ml-3 text-rose-700">DOWN {statusCounts.DOWN}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Global results log</h2>
            <p className="mt-1 text-xs text-slate-500">
              Showing {results.length} rows from page {page}
            </p>
          </div>
          {isLoading ? <p className="text-xs text-slate-400">Loading...</p> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Monitor</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Response</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!isLoading && results.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                    ไม่พบผลตรวจในช่วงเวลานี้
                  </td>
                </tr>
              ) : null}

              {results.map((result) => (
                <tr className="transition hover:bg-slate-50" key={result.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDateTime(result.checkedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                      to={`/monitors/${result.monitor.id}`}
                    >
                      {result.monitor.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {result.monitor.type} · every {result.monitor.interval}s
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">
                    <div className="truncate" title={getTarget(result.monitor)}>
                      {getTarget(result.monitor)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[result.status]}`}
                    >
                      {result.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatResponseTime(result.responseTimeMs)}
                  </td>
                  <td className="max-w-md px-4 py-3 text-slate-500">
                    <div className="truncate" title={result.message ?? undefined}>
                      {result.message ?? "-"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            Time filters support daily, weekly, monthly, and custom range
          </p>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchResults(page + 1, "append")}
            disabled={!hasMore || isLoading || isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : hasMore ? "Load more results" : "No more results"}
          </button>
        </div>
      </section>
    </div>
  );
};

export default ResultsPage;
