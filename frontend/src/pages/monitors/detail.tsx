import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type MonitorType = "PING" | "TCP" | "HTTP" | "DOCKER" | "DATABASE";
type IncidentStatus = "OPEN" | "RESOLVED";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type MonitorResult = {
  id: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  metadata?: Record<string, unknown> | null;
  checkedAt: string;
};

type AlertRule = {
  id: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  enabled: boolean;
};

type Incident = {
  id: string;
  status: IncidentStatus;
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
};

type MonitorDetail = {
  id: string;
  name: string;
  type: MonitorType;
  config: Record<string, unknown>;
  interval: number;
  enabled: boolean;
  results: MonitorResult[];
  hasMoreResults: boolean;
  alertRules: AlertRule[];
  incidents: Incident[];
  createdAt: string;
  updatedAt: string;
};

type EditForm = {
  name: string;
  type: MonitorType;
  interval: string;
  enabled: boolean;
  configText: string;
};

type TimeRangePreset = "1h" | "6h" | "24h" | "7d" | "30d" | "custom";

const timeRangeOptions: Array<{ label: string; value: TimeRangePreset }> = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "Custom", value: "custom" },
];

const presetDurationsMs: Record<Exclude<TimeRangePreset, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
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

const statusStyles: Record<MonitorStatus | "PENDING" | "DISABLED", string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING: "bg-slate-100 text-slate-600 ring-slate-400/30",
  DISABLED: "bg-slate-100 text-slate-500 ring-slate-300",
};

const incidentStyles: Record<IncidentStatus, string> = {
  OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const statusColors: Record<MonitorStatus, string> = {
  UP: "#059669",
  DEGRADED: "#d97706",
  DOWN: "#e11d48",
};

const availabilityCellClasses: Record<MonitorStatus | "NO_DATA", string> = {
  UP: "bg-emerald-500/85",
  DEGRADED: "bg-amber-500/85",
  DOWN: "bg-rose-500/85",
  NO_DATA: "bg-slate-200",
};

const statusValues: Record<MonitorStatus, number> = {
  DOWN: 1,
  DEGRADED: 2,
  UP: 3,
};

const statusPriority: Record<MonitorStatus, number> = {
  DOWN: 3,
  DEGRADED: 2,
  UP: 1,
};

const formatStatusValue = (value: number) => {
  if (value === 3) return "UP";
  if (value === 2) return "DEGRADED";
  if (value === 1) return "DOWN";

  return "";
};

const getTarget = (monitor: MonitorDetail) => {
  const config = monitor.config;

  if (typeof config.url === "string") return config.url;
  if (typeof config.host === "string" && typeof config.port === "number") {
    return `${config.host}:${config.port}`;
  }
  if (typeof config.host === "string") return config.host;
  if (typeof config.portainerUrl === "string") return config.portainerUrl;
  if (typeof config.filename === "string") return config.filename;
  if (config.type === "sqlite" && typeof config.database === "string") return config.database;

  return "-";
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const formatShortTime = (value: string) => {
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatDayLabel = (value: string) => {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
};

const toConfigText = (config: Record<string, unknown>) => {
  return JSON.stringify(config, null, 2);
};

const MonitorDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api } = useApi();
  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [resultsLimit, setResultsLimit] = useState(20);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("24h");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - presetDurationsMs["24h"])),
  );
  const [customTo, setCustomTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [appliedFrom, setAppliedFrom] = useState(() =>
    new Date(Date.now() - presetDurationsMs["24h"]).toISOString(),
  );
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString());
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    type: "HTTP",
    interval: "60",
    enabled: true,
    configText: "{}",
  });

  const fetchMonitor = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);

    try {
      const response = await api.get<ApiResponse<MonitorDetail>>(`/monitors/${id}`, {
        params: { resultsLimit, from: appliedFrom, to: appliedTo },
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setMonitor(response.data.data);
    } catch {
      toast.error("โหลด monitor ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [api, appliedFrom, appliedTo, id, resultsLimit]);

  useEffect(() => {
    void fetchMonitor();
  }, [fetchMonitor]);

  const handleLoadMoreResults = () => {
    setResultsLimit((current) => Math.min(current + 20, 200));
  };

  const handleTimeRangeChange = (value: TimeRangePreset) => {
    setTimeRange(value);
    setResultsLimit(20);

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

    setResultsLimit(20);
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const latestResult = monitor?.results[0] ?? null;
  const latestStatus = monitor
    ? monitor.enabled
      ? latestResult?.status ?? "PENDING"
      : "DISABLED"
    : "PENDING";

  const resultSummary = useMemo(() => {
    const results = monitor?.results ?? [];
    const upCount = results.filter((result) => result.status === "UP").length;
    const downCount = results.filter((result) => result.status === "DOWN").length;
    const responseTimes = results
      .map((result) => result.responseTimeMs)
      .filter((value): value is number => typeof value === "number");

    return {
      total: results.length,
      upCount,
      downCount,
      avgResponse:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
          : null,
    };
  }, [monitor]);

  const chartData = useMemo(() => {
    return [...(monitor?.results ?? [])].reverse().map((result) => ({
      id: result.id,
      checkedAt: result.checkedAt,
      timeLabel: formatShortTime(result.checkedAt),
      responseTime: result.responseTimeMs,
      status: result.status,
      statusValue: statusValues[result.status],
      message: result.message ?? "-",
      color: statusColors[result.status],
    }));
  }, [monitor]);

  const availabilityMap = useMemo(() => {
    const bucketMap = new Map<string, { status: MonitorStatus; count: number }>();

    for (const result of monitor?.results ?? []) {
      const date = new Date(result.checkedAt);
      const dayKey = date.toISOString().slice(0, 10);
      const hour = date.getHours();
      const key = `${dayKey}-${hour}`;
      const current = bucketMap.get(key);

      if (!current || statusPriority[result.status] >= statusPriority[current.status]) {
        bucketMap.set(key, {
          status: result.status,
          count: (current?.count ?? 0) + 1,
        });
      } else {
        bucketMap.set(key, {
          status: current.status,
          count: current.count + 1,
        });
      }
    }

    const dayKeys = Array.from(
      new Set((monitor?.results ?? []).map((result) => new Date(result.checkedAt).toISOString().slice(0, 10))),
    ).sort();

    const rows = dayKeys.map((dayKey) => ({
      dayKey,
      dayLabel: formatDayLabel(dayKey),
      cells: Array.from({ length: 24 }, (_, hour) => {
        const bucket = bucketMap.get(`${dayKey}-${hour}`);

        return {
          hour,
          status: bucket?.status ?? "NO_DATA",
          checks: bucket?.count ?? 0,
        };
      }),
    }));

    return {
      rows,
      hours: Array.from({ length: 24 }, (_, hour) => hour),
    };
  }, [monitor]);

  const openEditModal = () => {
    if (!monitor) return;

    setEditForm({
      name: monitor.name,
      type: monitor.type,
      interval: String(monitor.interval),
      enabled: monitor.enabled,
      configText: toConfigText(monitor.config),
    });
    setIsEditing(true);
  };

  const handleCheckNow = async () => {
    if (!monitor) return;

    setIsBusy(true);

    try {
      const response = await api.post<ApiResponse<MonitorResult>>(`/monitors/${monitor.id}/check`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(`เช็ก ${monitor.name} แล้ว`);
      await fetchMonitor();
    } catch {
      toast.error("สั่งเช็กไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!monitor) return;

    setIsBusy(true);

    try {
      const response = await api.patch<ApiResponse<MonitorDetail>>(`/monitors/${monitor.id}`, {
        enabled: !monitor.enabled,
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(monitor.enabled ? "ปิด monitor แล้ว" : "เปิด monitor แล้ว");
      await fetchMonitor();
    } catch {
      toast.error("เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateMonitor = async () => {
    if (!monitor) return;

    const interval = Number(editForm.interval);

    if (!editForm.name.trim()) {
      toast.error("กรุณาระบุชื่อ monitor");
      return;
    }

    if (!Number.isFinite(interval) || interval < 10) {
      toast.error("interval ต้องมากกว่าหรือเท่ากับ 10 วินาที");
      return;
    }

    let config: Record<string, unknown>;

    try {
      const parsed = JSON.parse(editForm.configText) as unknown;

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("config ต้องเป็น JSON object");
        return;
      }

      config = parsed as Record<string, unknown>;
    } catch {
      toast.error("config JSON ไม่ถูกต้อง");
      return;
    }

    setIsBusy(true);

    try {
      const response = await api.patch<ApiResponse<MonitorDetail>>(`/monitors/${monitor.id}`, {
        name: editForm.name.trim(),
        type: editForm.type,
        interval,
        enabled: editForm.enabled,
        config,
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success("แก้ไข monitor แล้ว");
      setIsEditing(false);
      await fetchMonitor();
    } catch {
      toast.error("แก้ไข monitor ไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteMonitor = async () => {
    if (!monitor) return;

    const confirmed = window.confirm(`ต้องการลบ ${monitor.name} ใช่ไหม?`);
    if (!confirmed) return;

    setIsBusy(true);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(`/monitors/${monitor.id}`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success("ลบ monitor แล้ว");
      navigate("/dashboard/monitors", { replace: true });
    } catch {
      toast.error("ลบ monitor ไม่สำเร็จ");
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading monitor...
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-950">ไม่พบ monitor</h1>
          <Link className="mt-4 inline-flex text-sm font-semibold text-cyan-700" to="/dashboard/monitors">
            Back to Monitors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-cyan-700">Monitor Detail</p>
          <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">{monitor.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {monitor.type} target {getTarget(monitor)} · every {monitor.interval}s
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            to="/dashboard/monitors"
          >
            Back
          </Link>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchMonitor()}
            disabled={isBusy}
          >
            Refresh
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleCheckNow()}
            disabled={isBusy || !monitor.enabled}
          >
            Check now
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleToggleEnabled()}
            disabled={isBusy}
          >
            {monitor.enabled ? "Disable" : "Enable"}
          </button>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={openEditModal}
            disabled={isBusy}
          >
            Edit
          </button>
          <button
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleDeleteMonitor()}
            disabled={isBusy}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Status</p>
          <span
            className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[latestStatus]}`}
          >
            {latestStatus}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Last response</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {formatResponseTime(latestResult?.responseTimeMs)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Last checked</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {formatDateTime(latestResult?.checkedAt)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Recent checks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{resultSummary.total}</p>
          <p className="mt-1 text-xs text-slate-500">
            {resultSummary.upCount} up · {resultSummary.downCount} down · avg{" "}
            {formatResponseTime(resultSummary.avgResponse)}
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">Availability map</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    มองภาพรวมตามวันและชั่วโมงเพื่อดูช่วงที่ระบบล่มหรือเสื่อมคุณภาพ
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/85" />
                    Up
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/85" />
                    Degraded
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/85" />
                    Down
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                    No data
                  </span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto px-4 py-4">
              {availabilityMap.rows.length === 0 ? (
                <div className="flex h-36 items-center justify-center text-sm text-slate-500">
                  ยังไม่มีข้อมูลพอสำหรับ availability map
                </div>
              ) : (
                <div className="min-w-[820px]">
                  <div
                    className="grid items-center gap-1"
                    style={{ gridTemplateColumns: "110px repeat(24, minmax(0, 1fr))" }}
                  >
                    <div />
                    {availabilityMap.hours.map((hour) => (
                      <div
                        className="text-center text-[11px] font-medium text-slate-400"
                        key={`hour-${hour}`}
                      >
                        {hour.toString().padStart(2, "0")}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {availabilityMap.rows.map((row) => (
                      <div
                        className="grid items-center gap-1"
                        key={row.dayKey}
                        style={{ gridTemplateColumns: "110px repeat(24, minmax(0, 1fr))" }}
                      >
                        <div className="pr-2 text-xs font-medium text-slate-600">{row.dayLabel}</div>
                        {row.cells.map((cell) => (
                          <div
                            className={`h-6 rounded-sm ${availabilityCellClasses[cell.status]}`}
                            key={`${row.dayKey}-${cell.hour}`}
                            title={`${row.dayLabel} ${cell.hour
                              .toString()
                              .padStart(2, "0")}:00 - ${cell.status === "NO_DATA" ? "No data" : cell.status}${cell.checks > 0 ? ` (${cell.checks} checks)` : ""}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">Response time</h2>
              </div>
              <div className="h-72 p-4">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    ยังไม่มีข้อมูลสำหรับกราฟ
                  </div>
                ) : (
                  <ResponsiveContainer height="100%" width="100%">
                    <LineChart data={chartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timeLabel"
                        minTickGap={24}
                        tick={{ fill: "#64748b", fontSize: 12 }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#64748b", fontSize: 12 }}
                        tickFormatter={(value) => `${value}ms`}
                        tickLine={false}
                        width={56}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "responseTime" ? formatResponseTime(Number(value)) : value,
                          "Response",
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.checkedAt
                            ? formatDateTime(payload[0].payload.checkedAt)
                            : ""
                        }
                      />
                      <Line
                        connectNulls={false}
                        dataKey="responseTime"
                        dot={{ r: 3, strokeWidth: 2 }}
                        name="Response"
                        stroke="#0891b2"
                        strokeWidth={2}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">Status timeline</h2>
              </div>
              <div className="h-72 p-4">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    ยังไม่มีข้อมูลสำหรับกราฟ
                  </div>
                ) : (
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart data={chartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timeLabel"
                        minTickGap={24}
                        tick={{ fill: "#64748b", fontSize: 12 }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 3]}
                        ticks={[1, 2, 3]}
                        tick={{ fill: "#64748b", fontSize: 12 }}
                        tickFormatter={formatStatusValue}
                        tickLine={false}
                        width={84}
                      />
                      <Tooltip
                        formatter={(_, __, item) => [item.payload.status, "Status"]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.checkedAt
                            ? formatDateTime(payload[0].payload.checkedAt)
                            : ""
                        }
                      />
                      <Bar dataKey="statusValue" name="Status" radius={[4, 4, 0, 0]}>
                        {chartData.map((point) => (
                          <Cell fill={point.color} key={point.id} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-sm font-semibold text-slate-950">Recent results</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={timeRange}
                    onChange={(event) => handleTimeRangeChange(event.target.value as TimeRangePreset)}
                  >
                    {timeRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {timeRange === "custom" ? (
                    <>
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        type="datetime-local"
                        value={customFrom}
                        onChange={(event) => setCustomFrom(event.target.value)}
                      />
                      <input
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        type="datetime-local"
                        value={customTo}
                        onChange={(event) => setCustomTo(event.target.value)}
                      />
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        type="button"
                        onClick={handleApplyCustomRange}
                      >
                        Apply
                      </button>
                    </>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    Showing {monitor.results.length} results
                  </span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Response</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Checked at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monitor.results.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                        ยังไม่มีผลตรวจ
                      </td>
                    </tr>
                  ) : null}
                  {monitor.results.map((result) => (
                    <tr className="hover:bg-slate-50" key={result.id}>
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
                      <td className="max-w-md px-4 py-3 text-slate-600">
                        <span className="break-words">{result.message ?? "-"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(result.checkedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {monitor.hasMoreResults ? (
              <div className="border-t border-slate-200 px-4 py-3 text-center">
                <button
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={handleLoadMoreResults}
                  disabled={isBusy || isLoading || resultsLimit >= 200}
                >
                  Load more results
                </button>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Incidents</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {monitor.incidents.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">ยังไม่มี incident</div>
              ) : null}
              {monitor.incidents.map((incident) => (
                <div className="grid gap-2 px-4 py-3 md:grid-cols-[120px_1fr_180px]" key={incident.id}>
                  <span
                    className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${incidentStyles[incident.status]}`}
                  >
                    {incident.status}
                  </span>
                  <div className="text-sm text-slate-700">{incident.message ?? "-"}</div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(incident.startedAt)}
                    {incident.resolvedAt ? ` - ${formatDateTime(incident.resolvedAt)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Configuration</h2>
            <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {toConfigText(monitor.config)}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Alert rules</h2>
            <div className="mt-3 divide-y divide-slate-100">
              {monitor.alertRules.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">ยังไม่มี alert rule</div>
              ) : null}
              {monitor.alertRules.map((rule) => (
                <div className="py-3" key={rule.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{rule.metric}</p>
                    <span className="text-xs font-medium text-slate-500">
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {rule.operator} {rule.threshold} · {rule.severity}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {isEditing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Edit monitor</h2>
              <p className="mt-1 text-sm text-slate-500">{monitor.name}</p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Name</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Type</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={editForm.type}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        type: event.target.value as MonitorType,
                      }))
                    }
                  >
                    <option value="HTTP">HTTP</option>
                    <option value="PING">PING</option>
                    <option value="TCP">TCP</option>
                    <option value="DATABASE">DATABASE</option>
                    <option value="DOCKER">DOCKER</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Interval</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    min={10}
                    type="number"
                    value={editForm.interval}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, interval: event.target.value }))
                    }
                  />
                </label>

                <label className="flex items-center gap-3 sm:col-span-2">
                  <input
                    checked={editForm.enabled}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    type="checkbox"
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">Enabled</span>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Config JSON</span>
                  <textarea
                    className="mt-2 min-h-52 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={editForm.configText}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, configText: event.target.value }))
                    }
                    spellCheck={false}
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleUpdateMonitor()}
                disabled={isBusy}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MonitorDetailPage;
