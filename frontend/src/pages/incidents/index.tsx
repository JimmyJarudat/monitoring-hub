import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type IncidentStatus = "OPEN" | "RESOLVED";
type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "SNMP" | "DOCKER" | "DATABASE";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type IncidentMonitor = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  interval: number;
  config: Record<string, unknown>;
};

type AlertRule = {
  id: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  enabled: boolean;
};

type IncidentRow = {
  id: string;
  status: IncidentStatus;
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
  monitorId: string;
  alertRuleId: string | null;
  monitor: IncidentMonitor;
  alertRule: AlertRule | null;
};

type IncidentsResponse = {
  items: IncidentRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<IncidentStatus, number>;
};

type TimeRangePreset = "day" | "week" | "month" | "custom";

const PAGE_SIZE = 50;

const timeRangeOptions: Array<{ label: string; value: TimeRangePreset }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom", value: "custom" },
];

const statusOptions: Array<{ label: string; value: "ALL" | IncidentStatus }> = [
  { label: "All incidents", value: "ALL" },
  { label: "OPEN", value: "OPEN" },
  { label: "RESOLVED", value: "RESOLVED" },
];

const typeOptions: Array<{ label: string; value: "ALL" | MonitorType }> = [
  { label: "All types", value: "ALL" },
  { label: "PING", value: "PING" },
  { label: "TCP", value: "TCP" },
  { label: "HTTP", value: "HTTP" },
  { label: "TLS_CERT", value: "TLS_CERT" },
  { label: "DNS", value: "DNS" },
  { label: "SNMP", value: "SNMP" },
  { label: "DOCKER", value: "DOCKER" },
  { label: "DATABASE", value: "DATABASE" },
];

const presetDurationsMs: Record<Exclude<TimeRangePreset, "custom">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const statusStyles: Record<IncidentStatus, string> = {
  OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const severityStyles: Record<string, string> = {
  CRITICAL: "bg-rose-50 text-rose-700 ring-rose-600/20",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  INFO: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
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

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatDuration = (startedAt: string, resolvedAt: string | null) => {
  const startMs = new Date(startedAt).getTime();
  const endMs = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const diffMs = Math.max(endMs - startMs, 0);
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getTarget = (monitor: IncidentMonitor) => {
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

const IncidentsPage = () => {
  const { api, del, patch } = useApi();
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("week");
  const [statusFilter, setStatusFilter] = useState<"ALL" | IncidentStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | MonitorType>("ALL");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - presetDurationsMs.week)),
  );
  const [customTo, setCustomTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [appliedFrom, setAppliedFrom] = useState(() =>
    new Date(Date.now() - presetDurationsMs.week).toISOString(),
  );
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString());
  const [statusCounts, setStatusCounts] = useState<Record<IncidentStatus, number>>({
    OPEN: 0,
    RESOLVED: 0,
  });
  const [page, setPage] = useState(1);

  const fetchIncidents = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (mode === "replace") {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await api.get<ApiResponse<IncidentsResponse>>("/incidents", {
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

        setIncidents((current) => (mode === "append" ? [...current, ...nextItems] : nextItems));
        setHasMore(response.data.data.hasMore);
        setPage(response.data.data.page);

        if (mode === "replace") {
          setStatusCounts(response.data.data.statusCounts);
        }
      } catch {
        toast.error("โหลด incidents ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [api, appliedFrom, appliedTo, statusFilter, typeFilter],
  );

  useEffect(() => {
    void fetchIncidents(1, "replace");
  }, [fetchIncidents]);

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

  const handleSetIncidentStatus = async (incident: IncidentRow, status: IncidentStatus) => {
    setBusyId(incident.id);

    try {
      const response = await patch<ApiResponse<IncidentRow>>(`/incidents/${incident.id}`, { status });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(status === "RESOLVED" ? "Resolve incident แล้ว" : "Reopen incident แล้ว");
      await fetchIncidents(1, "replace");
    } catch {
      toast.error("อัปเดต incident ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteIncident = async (incident: IncidentRow) => {
    const confirmed = window.confirm(
      `ต้องการลบ incident ของ ${incident.monitor.name} ที่เริ่มเมื่อ ${formatDateTime(incident.startedAt)} ใช่ไหม`,
    );

    if (!confirmed) return;

    setBusyId(incident.id);

    try {
      const response = await del<ApiResponse<{ message: string }>>(`/incidents/${incident.id}`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success("ลบ incident แล้ว");
      await fetchIncidents(1, "replace");
    } catch {
      toast.error("ลบ incident ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    return {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status === "OPEN").length,
      resolved: incidents.filter((incident) => incident.status === "RESOLVED").length,
    };
  }, [incidents]);

  const activeRangeLabel = useMemo(() => {
    if (timeRange === "custom") {
      return `${formatDateTime(appliedFrom)} - ${formatDateTime(appliedTo)}`;
    }

    return timeRangeOptions.find((option) => option.value === timeRange)?.label ?? "Week";
  }, [appliedFrom, appliedTo, timeRange]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Incidents</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ดูเหตุการณ์ล่มหรือผิดปกติที่ควร action แทนการไล่ raw check ทีละแถว ช่วยให้เห็นว่า
            monitor ไหนเริ่มมีปัญหาเมื่อไร และยังเปิดค้างอยู่หรือไม่
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            type="button"
            onClick={() => void fetchIncidents(1, "replace")}
          >
            Refresh
          </button>
          <Link
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            to="/results"
          >
            View Results
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Displayed", value: summary.total, tone: "text-slate-950" },
          { label: "OPEN", value: summary.open, tone: "text-rose-700" },
          { label: "Resolved", value: summary.resolved, tone: "text-emerald-700" },
          {
            label: "Page snapshot",
            value: `${statusCounts.OPEN} / ${statusCounts.RESOLVED}`,
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
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | IncidentStatus)}
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
                    Current page incidents:
                    <span className="ml-2 text-rose-700">OPEN {statusCounts.OPEN}</span>
                    <span className="ml-3 text-emerald-700">RESOLVED {statusCounts.RESOLVED}</span>
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
            <h2 className="text-sm font-semibold text-slate-950">Incident queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Showing {incidents.length} rows from page {page}
            </p>
          </div>
          {isLoading ? <p className="text-xs text-slate-400">Loading...</p> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Monitor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Resolved</th>
                <th className="px-4 py-3">Alert rule</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!isLoading && incidents.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={8}>
                    ไม่พบ incident ในช่วงเวลานี้
                  </td>
                </tr>
              ) : null}

              {incidents.map((incident) => {
                const isBusy = busyId === incident.id;
                const severity = incident.alertRule?.severity ?? "INFO";

                return (
                  <tr className="transition hover:bg-slate-50" key={incident.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(incident.startedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                        to={`/monitors/${incident.monitor.id}`}
                      >
                        {incident.monitor.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {incident.monitor.type} · {getTarget(incident.monitor)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[incident.status]}`}
                      >
                        {incident.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDuration(incident.startedAt, incident.resolvedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(incident.resolvedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {incident.alertRule ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                                severityStyles[severity] ?? severityStyles.INFO
                              }`}
                            >
                              {severity}
                            </span>
                            <span className="text-xs text-slate-500">
                              {incident.alertRule.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {incident.alertRule.metric} {incident.alertRule.operator}{" "}
                            {incident.alertRule.threshold}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-500">
                      <div className="truncate" title={incident.message ?? undefined}>
                        {incident.message ?? "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {incident.status === "OPEN" ? (
                          <button
                            className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            onClick={() => void handleSetIncidentStatus(incident, "RESOLVED")}
                            disabled={isBusy}
                          >
                            Resolve
                          </button>
                        ) : (
                          <button
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            onClick={() => void handleSetIncidentStatus(incident, "OPEN")}
                            disabled={isBusy}
                          >
                            Reopen
                          </button>
                        )}

                        <button
                          className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={() => void handleDeleteIncident(incident)}
                          disabled={isBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            Filter incidents by day, week, month, or any custom incident window
          </p>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchIncidents(page + 1, "append")}
            disabled={!hasMore || isLoading || isLoadingMore}
          >
            {isLoadingMore ? "Loading..." : hasMore ? "Load more incidents" : "No more incidents"}
          </button>
        </div>
      </section>
    </div>
  );
};

export default IncidentsPage;
