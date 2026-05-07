import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "@/hooks/useApi";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type MonitorType =
  | "PING"
  | "TCP"
  | "HTTP"
  | "TLS_CERT"
  | "DNS"
  | "SNMP"
  | "SYSTEM"
  | "DOCKER"
  | "DATABASE";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type MonitorResult = {
  id: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  checkedAt: string;
};

type ActiveIncident = {
  id: string;
  status: "OPEN" | "RESOLVED";
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
};

type MonitorRow = {
  id: string;
  name: string;
  type: MonitorType;
  config: Record<string, unknown>;
  interval: number;
  enabled: boolean;
  latestResult: MonitorResult | null;
  lastDownAt: string | null;
  downCount24h: number;
  checkCount24h: number;
  uptime24h: number | null;
  activeIncident: ActiveIncident | null;
};

type MonitorSummary = {
  total: number;
  up: number;
  degraded: number;
  down: number;
  unknown: number;
  openIncidents: number;
  uptime24h: number | null;
  avgResponseTimeMs: number | null;
};

type IncidentRow = {
  id: string;
  status: "OPEN" | "RESOLVED";
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
  monitor: {
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
    config: Record<string, unknown>;
  };
};

type IncidentsResponse = {
  items: IncidentRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<"OPEN" | "RESOLVED", number>;
};

type ResultRow = {
  id: string;
  monitorId: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  checkedAt: string;
  monitor: {
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
    config: Record<string, unknown>;
  };
};

type ResultsResponse = {
  items: ResultRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<MonitorStatus, number>;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  monitorCount: number;
  monitors: Array<{
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
    latestResult: MonitorResult | null;
  }>;
};

type DashboardStatus = MonitorStatus | "PENDING" | "DISABLED";

const statusStyles: Record<DashboardStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING: "bg-slate-100 text-slate-600 ring-slate-400/30",
  DISABLED: "bg-slate-100 text-slate-500 ring-slate-300",
};

const statusDotStyles: Record<DashboardStatus, string> = {
  UP: "bg-emerald-500",
  DOWN: "bg-rose-500",
  DEGRADED: "bg-amber-500",
  PENDING: "bg-slate-400",
  DISABLED: "bg-slate-300",
};

const statusChartColors: Record<"UP" | "DOWN" | "DEGRADED" | "UNKNOWN", string> = {
  UP: "#059669",
  DOWN: "#e11d48",
  DEGRADED: "#d97706",
  UNKNOWN: "#94a3b8",
};

const typeAccentClasses = [
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-slate-500",
];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatTime = (value: string | null | undefined) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatDuration = (startedAt: string) => {
  const diffMs = Math.max(Date.now() - new Date(startedAt).getTime(), 0);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const formatPercent = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value}%` : "-";
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const getTarget = (config: Record<string, unknown>) => {
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

const getMonitorStatus = (monitor: MonitorRow | GroupRow["monitors"][number]): DashboardStatus => {
  if (!monitor.enabled) return "DISABLED";
  return monitor.latestResult?.status ?? "PENDING";
};

type DashboardData = {
  summary: MonitorSummary;
  monitors: MonitorRow[];
  incidents: IncidentRow[];
  recentResults: ResultRow[];
  groups: GroupRow[];
};

const DashboardPage = () => {
  const { api } = useApi();
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [recentResults, setRecentResults] = useState<ResultRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async (): Promise<DashboardData> => {
    const [summaryRes, monitorsRes, incidentsRes, resultsRes, groupsRes] = await Promise.all([
        api.get<ApiResponse<MonitorSummary>>("/monitors/summary"),
        api.get<ApiResponse<MonitorRow[]>>("/monitors"),
        api.get<ApiResponse<IncidentsResponse>>("/incidents", {
          params: { status: "OPEN", limit: 8 },
        }),
        api.get<ApiResponse<ResultsResponse>>("/monitors/results", {
          params: { limit: 16 },
        }),
        api.get<ApiResponse<GroupRow[]>>("/groups"),
      ]);

    if (!summaryRes.data.success) throw new Error(summaryRes.data.message);
    if (!monitorsRes.data.success) throw new Error(monitorsRes.data.message);
    if (!incidentsRes.data.success) throw new Error(incidentsRes.data.message);
    if (!resultsRes.data.success) throw new Error(resultsRes.data.message);
    if (!groupsRes.data.success) throw new Error(groupsRes.data.message);

    return {
      summary: summaryRes.data.data,
      monitors: monitorsRes.data.data,
      incidents: incidentsRes.data.data.items,
      recentResults: resultsRes.data.data.items,
      groups: groupsRes.data.data,
    };
  }, [api]);

  const applyDashboardData = useCallback((data: DashboardData) => {
    setSummary(data.summary);
    setMonitors(data.monitors);
    setIncidents(data.incidents);
    setRecentResults(data.recentResults);
    setGroups(data.groups);
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      applyDashboardData(await fetchDashboardData());
    } catch {
      toast.error("โหลด Dashboard ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [applyDashboardData, fetchDashboardData]);

  useEffect(() => {
    let isCurrent = true;

    fetchDashboardData()
      .then((data) => {
        if (isCurrent) applyDashboardData(data);
      })
      .catch(() => {
        if (isCurrent) toast.error("โหลด Dashboard ไม่สำเร็จ");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [applyDashboardData, fetchDashboardData]);

  const statusCounts = useMemo(() => {
    return monitors.reduce(
      (acc, monitor) => {
        const status = getMonitorStatus(monitor);
        acc[status] += 1;
        return acc;
      },
      { UP: 0, DOWN: 0, DEGRADED: 0, PENDING: 0, DISABLED: 0 } satisfies Record<DashboardStatus, number>,
    );
  }, [monitors]);

  const attentionMonitors = useMemo(() => {
    return monitors
      .filter((monitor) => {
        const status = getMonitorStatus(monitor);
        return status === "DOWN" || status === "DEGRADED" || monitor.activeIncident;
      })
      .sort((a, b) => {
        const aStatus = getMonitorStatus(a);
        const bStatus = getMonitorStatus(b);
        const score = (status: DashboardStatus) =>
          status === "DOWN" ? 0 : status === "DEGRADED" ? 1 : status === "PENDING" ? 2 : 3;
        return score(aStatus) - score(bStatus) || b.downCount24h - a.downCount24h;
      })
      .slice(0, 8);
  }, [monitors]);

  const deviceSummary = useMemo(() => {
    const devices = monitors.filter((monitor) => monitor.type === "SNMP" || monitor.type === "SYSTEM");
    const statuses = devices.map(getMonitorStatus);
    return {
      total: devices.length,
      up: statuses.filter((status) => status === "UP").length,
      degraded: statuses.filter((status) => status === "DEGRADED").length,
      down: statuses.filter((status) => status === "DOWN").length,
    };
  }, [monitors]);

  const groupWidgets = useMemo(() => {
    return groups
      .map((group) => {
        const enabled = group.monitors.filter((monitor) => monitor.enabled);
        const statuses = enabled.map(getMonitorStatus);
        const down = statuses.filter((status) => status === "DOWN").length;
        const degraded = statuses.filter((status) => status === "DEGRADED").length;
        const pending = statuses.filter((status) => status === "PENDING").length;
        const up = statuses.filter((status) => status === "UP").length;
        const health = enabled.length > 0 ? Math.round((up / enabled.length) * 100) : null;
        return { ...group, enabled: enabled.length, up, down, degraded, pending, health };
      })
      .sort((a, b) => b.down - a.down || b.degraded - a.degraded || b.monitorCount - a.monitorCount)
      .slice(0, 6);
  }, [groups]);

  const recentProblemResults = useMemo(() => {
    return recentResults.filter((result) => result.status !== "UP").slice(0, 6);
  }, [recentResults]);

  const healthChartData = useMemo(() => {
    return [
      { name: "UP", value: summary?.up ?? statusCounts.UP, color: statusChartColors.UP },
      { name: "DEGRADED", value: summary?.degraded ?? statusCounts.DEGRADED, color: statusChartColors.DEGRADED },
      { name: "DOWN", value: summary?.down ?? statusCounts.DOWN, color: statusChartColors.DOWN },
      {
        name: "UNKNOWN",
        value: summary?.unknown ?? statusCounts.PENDING + statusCounts.DISABLED,
        color: statusChartColors.UNKNOWN,
      },
    ].filter((item) => item.value > 0);
  }, [statusCounts, summary]);

  const responseTrendData = useMemo(() => {
    return [...recentResults]
      .reverse()
      .map((result) => ({
        name: formatTime(result.checkedAt),
        response: result.responseTimeMs ?? 0,
        status: result.status,
      }))
      .slice(-12);
  }, [recentResults]);

  const typeBreakdown = useMemo(() => {
    const counts = monitors.reduce<Record<string, number>>((acc, monitor) => {
      acc[monitor.type] = (acc[monitor.type] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [monitors]);

  const topRiskMonitors = useMemo(() => {
    return [...monitors]
      .filter((monitor) => monitor.checkCount24h > 0 || monitor.downCount24h > 0)
      .sort((a, b) => b.downCount24h - a.downCount24h || (a.uptime24h ?? 100) - (b.uptime24h ?? 100))
      .slice(0, 5);
  }, [monitors]);

  const activeIncident = incidents[0] ?? null;
  const totalMonitors = summary?.total ?? monitors.length;
  const healthyPercent = totalMonitors > 0 ? Math.round(((summary?.up ?? statusCounts.UP) / totalMonitors) * 100) : 0;
  const needsAttention = (summary?.down ?? statusCounts.DOWN) + (summary?.degraded ?? statusCounts.DEGRADED);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-700">Monitoring Command Center</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">Dashboard</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">
                  ภาพรวมสุขภาพ monitor, incident ที่เปิดอยู่, กลุ่มที่มีความเสี่ยง และผลตรวจล่าสุดในจุดเดียว
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadDashboard()}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Refreshing..." : "Refresh"}
                </button>
                <Link
                  to="/monitors/new"
                  className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Add monitor
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fleet health</p>
                <div className="mt-3 flex items-end gap-3">
                  <p className="text-4xl font-semibold text-slate-950">{healthyPercent}%</p>
                  <p className="pb-1 text-sm text-slate-500">{summary?.up ?? statusCounts.UP} healthy</p>
                </div>
                <HealthBar
                  className="mt-4"
                  up={summary?.up ?? statusCounts.UP}
                  degraded={summary?.degraded ?? statusCounts.DEGRADED}
                  down={summary?.down ?? statusCounts.DOWN}
                  unknown={summary?.unknown ?? statusCounts.PENDING + statusCounts.DISABLED}
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Attention required</p>
                <p className={["mt-3 text-4xl font-semibold", needsAttention > 0 ? "text-rose-700" : "text-emerald-700"].join(" ")}>
                  {needsAttention}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {(summary?.down ?? statusCounts.DOWN)} down, {(summary?.degraded ?? statusCounts.DEGRADED)} degraded
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open incident focus</p>
                {activeIncident ? (
                  <>
                    <Link
                      className="mt-3 block truncate text-lg font-semibold text-slate-950 underline-offset-2 hover:text-cyan-800 hover:underline"
                      to={`/monitors/${activeIncident.monitor.id}`}
                    >
                      {activeIncident.monitor.name}
                    </Link>
                    <p className="mt-1 text-sm text-rose-700">Open for {formatDuration(activeIncident.startedAt)}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-2xl font-semibold text-emerald-700">Clear</p>
                    <p className="mt-1 text-sm text-slate-500">No open incidents in the queue.</p>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-300">24h operating signal</p>
                <p className="mt-2 text-3xl font-semibold">{formatPercent(summary?.uptime24h)}</p>
              </div>
              <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
                Live
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MetricTile label="Avg response" value={formatResponseTime(summary?.avgResponseTimeMs)} />
              <MetricTile label="Devices" value={deviceSummary.total} />
              <MetricTile label="Open incidents" value={summary?.openIncidents ?? incidents.length} />
              <MetricTile label="Disabled" value={statusCounts.DISABLED} />
            </div>
          </section>
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Total monitors"
                value={totalMonitors}
                detail={`${statusCounts.PENDING} pending checks, ${statusCounts.DISABLED} disabled`}
                tone="slate"
              />
              <SummaryCard
                label="Healthy now"
                value={`${summary?.up ?? statusCounts.UP}/${totalMonitors}`}
                detail={`${healthyPercent}% of all configured monitors`}
                tone="emerald"
              />
              <SummaryCard
                label="Open incidents"
                value={summary?.openIncidents ?? incidents.length}
                detail={incidents.length > 0 ? "Incident queue needs review" : "No active incidents"}
                tone={(summary?.openIncidents ?? incidents.length) > 0 ? "rose" : "emerald"}
              />
              <SummaryCard
                label="Device health"
                value={deviceSummary.total}
                detail={`${deviceSummary.up} up, ${deviceSummary.degraded} degraded, ${deviceSummary.down} down`}
                tone={deviceSummary.down > 0 ? "rose" : "cyan"}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <Panel
                title="Status distribution"
                description="Current state of every monitor"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/monitors">Inventory</Link>}
              >
                <div className="grid gap-4 p-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="h-44">
                    {healthChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={healthChartData}
                            dataKey="value"
                            innerRadius={48}
                            outerRadius={76}
                            paddingAngle={2}
                            stroke="none"
                          >
                            {healthChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState compact title="No monitor data" message="Create monitors to populate this chart." />
                    )}
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "UP", value: summary?.up ?? statusCounts.UP, className: "bg-emerald-500" },
                      { label: "DEGRADED", value: summary?.degraded ?? statusCounts.DEGRADED, className: "bg-amber-500" },
                      { label: "DOWN", value: summary?.down ?? statusCounts.DOWN, className: "bg-rose-500" },
                      {
                        label: "UNKNOWN",
                        value: summary?.unknown ?? statusCounts.PENDING + statusCounts.DISABLED,
                        className: "bg-slate-400",
                      },
                    ].map((item) => (
                      <div className="flex items-center justify-between gap-3" key={item.label}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${item.className}`} />
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-950">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel
                title="Recent response trend"
                description="Last checks across all monitors"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/results">View results</Link>}
              >
                <div className="h-64 p-5">
                  {responseTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={responseTrendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="response" radius={[4, 4, 0, 0]}>
                          {responseTrendData.map((entry, index) => (
                            <Cell
                              key={`${entry.name}-${index}`}
                              fill={
                                entry.status === "DOWN"
                                  ? statusChartColors.DOWN
                                  : entry.status === "DEGRADED"
                                    ? statusChartColors.DEGRADED
                                    : statusChartColors.UP
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState compact title="No recent checks" message="Run checks to see response time trends." />
                  )}
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Panel
                title="Attention list"
                description="Down, degraded, or incident-backed monitors"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/monitors">View monitors</Link>}
              >
                {attentionMonitors.length === 0 ? (
                  <EmptyState title="No urgent monitors" message="All enabled monitors are currently healthy." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {attentionMonitors.map((monitor) => {
                      const status = getMonitorStatus(monitor);
                      return (
                        <Link
                          key={monitor.id}
                          to={`/monitors/${monitor.id}`}
                          className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 md:grid-cols-[1fr_120px_140px]"
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <StatusBadge status={status} />
                              <p className="truncate text-sm font-semibold text-slate-950">{monitor.name}</p>
                            </div>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {monitor.type} · {getTarget(monitor.config)}
                            </p>
                          </div>
                          <div className="text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">24h uptime</p>
                            <p>{formatPercent(monitor.uptime24h)}</p>
                          </div>
                          <div className="text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">Last check</p>
                            <p>{formatDateTime(monitor.latestResult?.checkedAt)}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel
                title="Open incidents"
                description="Oldest active items first"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/incidents?status=OPEN">View all</Link>}
              >
                {incidents.length === 0 ? (
                  <EmptyState title="No open incidents" message="Nothing is currently waiting for incident handling." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {incidents.map((incident) => (
                      <Link
                        key={incident.id}
                        to={`/monitors/${incident.monitor.id}`}
                        className="block px-5 py-4 transition hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-950">{incident.monitor.name}</p>
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            {formatDuration(incident.startedAt)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {incident.message ?? "Incident is open"}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Group health"
                description="Business or site-level view"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/groups">Groups</Link>}
              >
                {groupWidgets.length === 0 ? (
                  <EmptyState title="No groups yet" message="Create groups to see business or device-level health." />
                ) : (
                  <div className="space-y-3 p-5">
                    {groupWidgets.map((group) => (
                      <Link
                        key={group.id}
                        to={`/groups/${group.id}`}
                        className="block rounded-lg border border-slate-200 p-4 transition hover:border-cyan-200 hover:bg-cyan-50/30"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{group.name}</p>
                            <p className="text-xs text-slate-500">{group.monitorCount} monitors</p>
                          </div>
                          <span className="text-lg font-semibold text-slate-950">
                            {group.health === null ? "-" : `${group.health}%`}
                          </span>
                        </div>
                        <HealthBar
                          className="mt-3"
                          up={group.up}
                          degraded={group.degraded}
                          down={group.down}
                          unknown={group.pending}
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          {group.up} up, {group.degraded} degraded, {group.down} down
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Monitor types" description="Inventory coverage by checker">
                {typeBreakdown.length === 0 ? (
                  <EmptyState title="No monitors yet" message="Add monitors to see inventory coverage." />
                ) : (
                  <div className="space-y-4 p-5">
                    {typeBreakdown.map((item, index) => (
                      <div key={item.type}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${typeAccentClasses[index % typeAccentClasses.length]}`} />
                            <span className="text-sm font-medium text-slate-700">{item.type}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-950">{item.count}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${typeAccentClasses[index % typeAccentClasses.length]}`}
                            style={{ width: `${totalMonitors > 0 ? (item.count / totalMonitors) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="24h risk ranking" description="Most unstable monitors">
                {topRiskMonitors.length === 0 ? (
                  <EmptyState title="No risk data yet" message="Recent checks will populate this ranking." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {topRiskMonitors.map((monitor) => (
                      <Link
                        key={monitor.id}
                        to={`/monitors/${monitor.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{monitor.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {monitor.downCount24h} down / {monitor.checkCount24h} checks
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-950">
                          {formatPercent(monitor.uptime24h)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel
              title="Recent problem checks"
              description="Latest non-UP results"
              action={<Link className="text-sm font-semibold text-cyan-700" to="/results">View results</Link>}
            >
              {recentProblemResults.length === 0 ? (
                <EmptyState title="No recent failures" message="Latest checks are not reporting down or degraded states." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentProblemResults.map((result) => (
                    <Link
                      key={result.id}
                      to={`/monitors/${result.monitor.id}`}
                      className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 sm:grid-cols-[1fr_110px_150px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={result.status} />
                          <p className="truncate text-sm font-semibold text-slate-950">{result.monitor.name}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {result.message ?? getTarget(result.monitor.config)}
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-slate-600">
                        {formatResponseTime(result.responseTimeMs)}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(result.checkedAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200/70" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-200/70" />
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "cyan" | "emerald" | "rose" | "slate";
}) {
  const toneClasses = {
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-3xl font-semibold tracking-normal text-slate-950">{value}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
          Live
        </span>
      </div>
      <p className="mt-3 truncate text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: DashboardStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[status]}`} />
      {status}
    </span>
  );
}

function HealthBar({
  up,
  degraded,
  down,
  unknown,
  className = "",
}: {
  up: number;
  degraded: number;
  down: number;
  unknown: number;
  className?: string;
}) {
  const total = up + degraded + down + unknown;
  const segments = [
    { value: up, className: "bg-emerald-500" },
    { value: degraded, className: "bg-amber-500" },
    { value: down, className: "bg-rose-500" },
    { value: unknown, className: "bg-slate-400" },
  ].filter((segment) => segment.value > 0);

  return (
    <div className={`flex h-2 overflow-hidden rounded-full bg-slate-200 ${className}`}>
      {segments.length > 0 ? (
        segments.map((segment, index) => (
          <div
            key={index}
            className={segment.className}
            style={{ width: `${total > 0 ? (segment.value / total) * 100 : 0}%` }}
          />
        ))
      ) : (
        <div className="w-full bg-slate-300" />
      )}
    </div>
  );
}

function EmptyState({
  title,
  message,
  compact = false,
}: {
  title: string;
  message: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-6 text-center" : "px-5 py-10 text-center"}>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

export default DashboardPage;
