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

type DeviceMetadata = {
  host?: string;
  cpuUsedPct?: number;
  memTotalKb?: number;
  memUsedKb?: number;
  memUsedPct?: number;
  uptimeSeconds?: number;
  osDescr?: string;
  load1?: number;
  load5?: number;
  load15?: number;
  disks?: Array<{
    mount: string;
    totalKb: number;
    usedKb: number;
    usedPct: number;
  }>;
  interfaces?: Array<{
    name: string;
    operStatus: number;
    inOctets: number;
    outOctets: number;
    inErrors: number;
    outErrors: number;
  }>;
};

type DeviceMetricSeries = {
  metricGroup: "SYSTEM" | "DISK" | "NET";
  metricKey: string;
  instance: string | null;
  unit: string;
  points: Array<{ collectedAt: string; value: number }>;
};

type DeviceMetricsResponse = {
  monitor: { id: string; name: string; type: MonitorType };
  sampleCount: number;
  series: DeviceMetricSeries[];
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
  { label: "Day", value: "24h" },
  { label: "Week", value: "7d" },
  { label: "Month", value: "30d" },
  { label: "Custom", value: "custom" },
];

const deviceAnalysisOptions: Array<{ label: string; value: TimeRangePreset }> = [
  { label: "Day", value: "24h" },
  { label: "Week", value: "7d" },
  { label: "Month", value: "30d" },
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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatPercent = (value: number | null | undefined) =>
  isFiniteNumber(value) ? `${value.toFixed(1)}%` : "-";

const formatKb = (value: number | null | undefined) => {
  if (!isFiniteNumber(value)) return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} MB`;
  return `${value.toFixed(0)} KB`;
};

const formatUptime = (seconds: number | null | undefined) => {
  if (!isFiniteNumber(seconds)) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatBytes = (value: number | null | undefined) => {
  if (!isFiniteNumber(value)) return "-";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value.toFixed(0)} B`;
};

const formatBitsPerSecond = (value: number | null | undefined) => {
  if (!isFiniteNumber(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} Gbps`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mbps`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} Kbps`;
  return `${value.toFixed(0)} bps`;
};

const getChartCeiling = (values: number[]) => {
  const sanitized = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (sanitized.length === 0) return 1;

  const sorted = [...sanitized].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1] ?? 1;
  const percentile95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? max;

  if (percentile95 > 0 && max > percentile95 * 5) {
    return Math.max(percentile95 * 1.2, 1);
  }

  return Math.max(max * 1.1, 1);
};

const buildRatePoints = (points: Array<{ collectedAt: string; value: number }>) => {
  const sorted = [...points].sort(
    (a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime(),
  );
  const rates: Array<{ checkedAt: string; timeLabel: string; rateBps: number }> = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const elapsedSeconds =
      (new Date(current.collectedAt).getTime() - new Date(previous.collectedAt).getTime()) / 1000;

    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) continue;

    const delta = current.value - previous.value;
    const rateBps = delta >= 0 ? (delta * 8) / elapsedSeconds : 0;

    rates.push({
      checkedAt: current.collectedAt,
      timeLabel: formatShortTime(current.collectedAt),
      rateBps,
    });
  }

  return rates;
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
  const [metricSeries, setMetricSeries] = useState<DeviceMetricSeries[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

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

  const fetchDeviceMetrics = useCallback(async () => {
    if (!id || !monitor || (monitor.type !== "SYSTEM" && monitor.type !== "SNMP")) {
      setMetricSeries([]);
      return;
    }

    setMetricsLoading(true);

    try {
      const response = await api.get<ApiResponse<DeviceMetricsResponse>>(`/monitors/${id}/metrics`, {
        params: { from: appliedFrom, to: appliedTo, limit: 5000 },
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setMetricSeries(response.data.data.series);
    } catch {
      toast.error("โหลด device metrics ไม่สำเร็จ");
    } finally {
      setMetricsLoading(false);
    }
  }, [api, appliedFrom, appliedTo, id, monitor]);

  useEffect(() => {
    void fetchDeviceMetrics();
  }, [fetchDeviceMetrics]);

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

  const isDeviceMonitor = monitor?.type === "SYSTEM" || monitor?.type === "SNMP";
  const latestMetadata = (latestResult?.metadata as DeviceMetadata | null) ?? null;

  const utilizationChartData = useMemo(() => {
    const cpuSeries = metricSeries.find(
      (series) => series.metricKey === "cpu.used_pct" && series.metricGroup === "SYSTEM",
    );
    const memSeries = metricSeries.find(
      (series) => series.metricKey === "memory.used_pct" && series.metricGroup === "SYSTEM",
    );
    const uptimeSeries = metricSeries.find(
      (series) => series.metricKey === "system.uptime_seconds" && series.metricGroup === "SYSTEM",
    );
    const bucket = new Map<
      string,
      {
        checkedAt: string;
        timeLabel: string;
        cpu?: number;
        memory?: number;
        uptimeSeconds?: number;
      }
    >();

    for (const series of [cpuSeries, memSeries, uptimeSeries]) {
      for (const point of series?.points ?? []) {
        const current = bucket.get(point.collectedAt) ?? {
          checkedAt: point.collectedAt,
          timeLabel: formatShortTime(point.collectedAt),
        };

        if (series?.metricKey === "cpu.used_pct") current.cpu = point.value;
        if (series?.metricKey === "memory.used_pct") current.memory = point.value;
        if (series?.metricKey === "system.uptime_seconds") current.uptimeSeconds = point.value;

        bucket.set(point.collectedAt, current);
      }
    }

    return Array.from(bucket.values()).sort(
      (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime(),
    );
  }, [metricSeries]);

  const diskSeries = useMemo(
    () =>
      metricSeries
        .filter((series) => series.metricGroup === "DISK" && series.metricKey === "disk.used_pct")
        .sort((a, b) => {
          const latestA = a.points[a.points.length - 1]?.value ?? 0;
          const latestB = b.points[b.points.length - 1]?.value ?? 0;
          return latestB - latestA;
        })
        .slice(0, 4),
    [metricSeries],
  );

  const diskChartData = useMemo(() => {
    const bucket = new Map<string, Record<string, string | number | undefined>>();

    for (const series of diskSeries) {
      const key = series.instance ?? series.metricKey;

      for (const point of series.points) {
        const current = bucket.get(point.collectedAt) ?? {
          checkedAt: point.collectedAt,
          timeLabel: formatShortTime(point.collectedAt),
        };
        current[key] = point.value;
        bucket.set(point.collectedAt, current);
      }
    }

    return Array.from(bucket.values()).sort(
      (a, b) => new Date(String(a.checkedAt)).getTime() - new Date(String(b.checkedAt)).getTime(),
    );
  }, [diskSeries]);

  const interfaceAnalytics = useMemo(() => {
    const seriesByInterface = new Map<
      string,
      {
        inSeries?: DeviceMetricSeries;
        outSeries?: DeviceMetricSeries;
        inErrors?: DeviceMetricSeries;
        outErrors?: DeviceMetricSeries;
        operStatus?: DeviceMetricSeries;
      }
    >();

    for (const series of metricSeries.filter((item) => item.metricGroup === "NET")) {
      const instance = series.instance ?? "unknown";
      const current = seriesByInterface.get(instance) ?? {};

      if (series.metricKey === "net.in_octets") current.inSeries = series;
      if (series.metricKey === "net.out_octets") current.outSeries = series;
      if (series.metricKey === "net.in_errors") current.inErrors = series;
      if (series.metricKey === "net.out_errors") current.outErrors = series;
      if (series.metricKey === "net.oper_status") current.operStatus = series;

      seriesByInterface.set(instance, current);
    }

    const totalsBucket = new Map<
      string,
      { checkedAt: string; timeLabel: string; rxRateBps: number; txRateBps: number }
    >();
    const perInterface = Array.from(seriesByInterface.entries())
      .map(([name, current]) => {
        const rxRates = current.inSeries ? buildRatePoints(current.inSeries.points) : [];
        const txRates = current.outSeries ? buildRatePoints(current.outSeries.points) : [];

        for (const point of rxRates) {
          const bucket = totalsBucket.get(point.checkedAt) ?? {
            checkedAt: point.checkedAt,
            timeLabel: point.timeLabel,
            rxRateBps: 0,
            txRateBps: 0,
          };
          bucket.rxRateBps += point.rateBps;
          totalsBucket.set(point.checkedAt, bucket);
        }

        for (const point of txRates) {
          const bucket = totalsBucket.get(point.checkedAt) ?? {
            checkedAt: point.checkedAt,
            timeLabel: point.timeLabel,
            rxRateBps: 0,
            txRateBps: 0,
          };
          bucket.txRateBps += point.rateBps;
          totalsBucket.set(point.checkedAt, bucket);
        }

        const latestRxRate = rxRates[rxRates.length - 1]?.rateBps ?? 0;
        const latestTxRate = txRates[txRates.length - 1]?.rateBps ?? 0;
        const latestInErrors = current.inErrors?.points[current.inErrors.points.length - 1]?.value ?? 0;
        const latestOutErrors =
          current.outErrors?.points[current.outErrors.points.length - 1]?.value ?? 0;
        const latestOperStatus =
          current.operStatus?.points[current.operStatus.points.length - 1]?.value ?? 0;

        return {
          name,
          rxRates,
          txRates,
          latestRxRate,
          latestTxRate,
          latestInErrors,
          latestOutErrors,
          latestOperStatus,
          totalRateBps: latestRxRate + latestTxRate,
        };
      })
      .sort((a, b) => b.totalRateBps - a.totalRateBps);

    const totalTrafficRateData = Array.from(totalsBucket.values()).sort(
      (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime(),
    );

    const interfaceTrafficChartData = (() => {
      const topInterfaces = perInterface.slice(0, 4);
      const bucket = new Map<string, Record<string, string | number | undefined>>();

      for (const iface of topInterfaces) {
        for (const point of iface.rxRates) {
          const current = bucket.get(point.checkedAt) ?? {
            checkedAt: point.checkedAt,
            timeLabel: point.timeLabel,
          };
          current[`${iface.name} RX`] = point.rateBps;
          bucket.set(point.checkedAt, current);
        }

        for (const point of iface.txRates) {
          const current = bucket.get(point.checkedAt) ?? {
            checkedAt: point.checkedAt,
            timeLabel: point.timeLabel,
          };
          current[`${iface.name} TX`] = point.rateBps;
          bucket.set(point.checkedAt, current);
        }
      }

      return Array.from(bucket.values()).sort(
        (a, b) => new Date(String(a.checkedAt)).getTime() - new Date(String(b.checkedAt)).getTime(),
      );
    })();

    return {
      totalTrafficRateData,
      interfaceTrafficChartData,
      topInterfaces: perInterface.slice(0, 8),
    };
  }, [metricSeries]);

  const totalTrafficRateCeiling = useMemo(
    () =>
      getChartCeiling(
        interfaceAnalytics.totalTrafficRateData.flatMap((point) => [point.rxRateBps, point.txRateBps]),
      ),
    [interfaceAnalytics.totalTrafficRateData],
  );

  const interfaceTrafficRateCeiling = useMemo(
    () =>
      getChartCeiling(
        interfaceAnalytics.interfaceTrafficChartData.flatMap((point) =>
          Object.entries(point)
            .filter(([key, value]) => key !== "checkedAt" && key !== "timeLabel" && typeof value === "number")
            .map(([, value]) => Number(value)),
        ),
      ),
    [interfaceAnalytics.interfaceTrafficChartData],
  );

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
      navigate("/monitors", { replace: true });
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
          <Link className="mt-4 inline-flex text-sm font-semibold text-cyan-700" to="/monitors">
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
            to="/monitors"
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
          {isDeviceMonitor ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">Device metrics</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      CPU, memory, disk และ network counters สำหรับอุปกรณ์/เซิร์ฟเวอร์
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <div className="flex flex-wrap gap-2">
                      {deviceAnalysisOptions.map((option) => {
                        const isActive = timeRange === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={[
                              "rounded-md border px-3 py-1.5 text-xs font-semibold transition",
                              isActive
                                ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                                : "border-slate-300 text-slate-600 hover:bg-slate-100",
                            ].join(" ")}
                            onClick={() => handleTimeRangeChange(option.value)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400">
                      {metricsLoading ? "Loading metrics..." : `${metricSeries.length} series in selected range`}
                    </p>
                  </div>
                </div>

                {timeRange === "custom" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
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
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">CPU</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatPercent(latestMetadata?.cpuUsedPct)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      load {isFiniteNumber(latestMetadata?.load1) ? latestMetadata?.load1?.toFixed(2) : "-"} /{" "}
                      {isFiniteNumber(latestMetadata?.load5) ? latestMetadata?.load5?.toFixed(2) : "-"} /{" "}
                      {isFiniteNumber(latestMetadata?.load15) ? latestMetadata?.load15?.toFixed(2) : "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Memory</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatPercent(latestMetadata?.memUsedPct)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatKb(latestMetadata?.memUsedKb)} / {formatKb(latestMetadata?.memTotalKb)}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Uptime</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {formatUptime(latestMetadata?.uptimeSeconds)}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500" title={latestMetadata?.osDescr}>
                      {latestMetadata?.osDescr ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Interfaces</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {latestMetadata?.interfaces?.length ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {latestMetadata?.disks?.length ?? 0} disks tracked
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 2xl:grid-cols-2">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-950">CPU and memory</h2>
                  </div>
                  <div className="h-72 p-4">
                    {utilizationChartData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        ยังไม่มี time-series metrics
                      </div>
                    ) : (
                      <ResponsiveContainer height="100%" width="100%">
                        <LineChart data={utilizationChartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                          <XAxis dataKey="timeLabel" minTickGap={24} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} width={56} />
                          <Tooltip
                            formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                            labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(payload[0].payload.checkedAt) : "")}
                          />
                          <Line dataKey="cpu" name="CPU" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                          <Line dataKey="memory" name="Memory" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-slate-950">Traffic rate</h2>
                      <span className="text-xs text-slate-400">Aggregated across interfaces</span>
                    </div>
                  </div>
                  <div className="h-72 p-4">
                    {interfaceAnalytics.totalTrafficRateData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        ยังไม่มี traffic rate
                      </div>
                    ) : (
                      <ResponsiveContainer height="100%" width="100%">
                        <LineChart
                          data={interfaceAnalytics.totalTrafficRateData}
                          margin={{ bottom: 8, left: 0, right: 12, top: 12 }}
                        >
                          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                          <XAxis dataKey="timeLabel" minTickGap={24} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                          <YAxis
                            domain={[0, totalTrafficRateCeiling]}
                            tick={{ fill: "#64748b", fontSize: 12 }}
                            tickFormatter={(value) => formatBitsPerSecond(Number(value))}
                            tickLine={false}
                            width={72}
                          />
                          <Tooltip
                            formatter={(value, name) => [formatBitsPerSecond(Number(value)), String(name)]}
                            labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(payload[0].payload.checkedAt) : "")}
                          />
                          <Line dataKey="rxRateBps" name="RX total" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                          <Line dataKey="txRateBps" name="TX total" stroke="#ea580c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-950">Top interface traffic</h2>
                </div>
                <div className="h-72 p-4">
                  {interfaceAnalytics.interfaceTrafficChartData.length === 0 ||
                  interfaceAnalytics.topInterfaces.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      ยังไม่มีข้อมูล traffic ต่อ interface
                    </div>
                  ) : (
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart
                        data={interfaceAnalytics.interfaceTrafficChartData}
                        margin={{ bottom: 8, left: 0, right: 12, top: 12 }}
                      >
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="timeLabel"
                          minTickGap={24}
                          tick={{ fill: "#64748b", fontSize: 12 }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, interfaceTrafficRateCeiling]}
                          tick={{ fill: "#64748b", fontSize: 12 }}
                          tickFormatter={(value) => formatBitsPerSecond(Number(value))}
                          tickLine={false}
                          width={72}
                        />
                        <Tooltip
                          formatter={(value, name) => [formatBitsPerSecond(Number(value)), name]}
                          labelFormatter={(_, payload) =>
                            payload?.[0]?.payload?.checkedAt
                              ? formatDateTime(String(payload[0].payload.checkedAt))
                              : ""
                          }
                        />
                        {interfaceAnalytics.topInterfaces.slice(0, 4).flatMap((iface, index) => {
                          const colors = [
                            ["#1d4ed8", "#60a5fa"],
                            ["#c2410c", "#fb923c"],
                            ["#047857", "#34d399"],
                            ["#7c3aed", "#c084fc"],
                          ];
                          const palette = colors[index % colors.length];
                          return [
                            <Line
                              key={`${iface.name}-rx`}
                              dataKey={`${iface.name} RX`}
                              name={`${iface.name} RX`}
                              stroke={palette[0]}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />,
                            <Line
                              key={`${iface.name}-tx`}
                              dataKey={`${iface.name} TX`}
                              name={`${iface.name} TX`}
                              stroke={palette[1]}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                            />,
                          ];
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-950">Disk usage</h2>
                </div>
                <div className="h-72 p-4">
                  {diskChartData.length === 0 || diskSeries.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      ยังไม่มี disk metrics
                    </div>
                  ) : (
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart data={diskChartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="timeLabel" minTickGap={24} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} width={56} />
                        <Tooltip
                          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                          labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(String(payload[0].payload.checkedAt)) : "")}
                        />
                        {diskSeries.map((series, index) => {
                          const key = series.instance ?? series.metricKey;
                          const colors = ["#16a34a", "#dc2626", "#9333ea", "#0ea5e9"];
                          return (
                            <Line
                              key={key}
                              dataKey={key}
                              name={key}
                              stroke={colors[index % colors.length]}
                              strokeWidth={2}
                              dot={{ r: 2 }}
                              connectNulls
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-950">Latest interfaces</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Interface</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">RX rate</th>
                        <th className="px-4 py-3">TX rate</th>
                        <th className="px-4 py-3">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!interfaceAnalytics.topInterfaces.length ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                            ยังไม่มีข้อมูล interface
                          </td>
                        </tr>
                      ) : (
                        interfaceAnalytics.topInterfaces.map((iface) => (
                          <tr className="hover:bg-slate-50" key={iface.name}>
                            <td className="px-4 py-3 font-medium text-slate-800">{iface.name}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {iface.latestOperStatus === 1 ? "UP" : iface.latestOperStatus > 0 ? "DOWN" : "-"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{formatBitsPerSecond(iface.latestRxRate)}</td>
                            <td className="px-4 py-3 text-slate-600">{formatBitsPerSecond(iface.latestTxRate)}</td>
                            <td className="px-4 py-3 text-slate-600">
                              in {Math.round(iface.latestInErrors)} · out {Math.round(iface.latestOutErrors)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

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
                    <option value="TLS_CERT">TLS_CERT</option>
                    <option value="DNS">DNS</option>
                    <option value="SNMP">SNMP</option>
                    <option value="SYSTEM">SYSTEM</option>
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
