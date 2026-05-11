import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  ReferenceLine,
} from "recharts";
import { toast } from "react-toastify";
import { useSession } from "@/contexts/session.context";
import { useApi } from "@/hooks/useApi";
import { isAdminUser } from "@/utils/permissions";

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
type CredentialType = "SNMP_COMMUNITY" | "USERNAME_PASSWORD" | "API_TOKEN" | "SSH_KEY" | "CLOUDFLARE_ACCESS";
type IncidentStatus = "OPEN" | "RESOLVED";
type AlertOperator = "GT" | "LT" | "EQ" | "NEQ";
type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
type ChannelType = "LINE" | "SLACK" | "DISCORD" | "EMAIL" | "TELEGRAM";

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
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
  channels?: Array<{
    channel: {
      id: string;
      name: string;
      type: ChannelType;
      enabled: boolean;
    };
  }>;
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
  credential?: {
    id: string;
    name: string;
    type: string;
  } | null;
  config: Record<string, unknown>;
  interval: number;
  enabled: boolean;
  activeWindowEnabled: boolean;
  activeWindowDays: number[] | null;
  activeWindowFrom: string | null;
  activeWindowTo: string | null;
  activeWindowTimezone: string | null;
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
    inDiscards: number;
    inErrors: number;
    outDiscards: number;
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

type CredentialRow = {
  id: string;
  name: string;
  type: CredentialType;
  username: string | null;
  secret: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  usageCount: number;
  monitors: Array<{
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
  }>;
};

type EditForm = {
  name: string;
  type: MonitorType;
  interval: string;
  enabled: boolean;
  activeWindowEnabled: boolean;
  activeWindowDays: number[];
  activeWindowFrom: string;
  activeWindowTo: string;
  activeWindowTimezone: string;
  configText: string;
};
type ThresholdForm = {
  cpuPct: string;
  ramPct: string;
  diskPct: string;
};
type AlertRuleForm = {
  metric: string;
  operator: AlertOperator;
  threshold: string;
  severity: AlertSeverity;
  enabled: boolean;
  channelIds: string[];
};

type NotificationChannelOption = {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
};

type TimeRangePreset = "1h" | "6h" | "24h" | "7d" | "30d" | "custom";

const timeRangeOptions: Array<{ labelKey: string; value: TimeRangePreset }> = [
  { labelKey: "monitorDetail.range1h", value: "1h" },
  { labelKey: "monitorDetail.range6h", value: "6h" },
  { labelKey: "monitorDetail.rangeDay", value: "24h" },
  { labelKey: "monitorDetail.rangeWeek", value: "7d" },
  { labelKey: "monitorDetail.rangeMonth", value: "30d" },
  { labelKey: "monitorDetail.rangeCustom", value: "custom" },
];

const ACTIVE_WINDOW_DAYS = [
  { value: 1, key: "common.days.mon" },
  { value: 2, key: "common.days.tue" },
  { value: 3, key: "common.days.wed" },
  { value: 4, key: "common.days.thu" },
  { value: 5, key: "common.days.fri" },
  { value: 6, key: "common.days.sat" },
  { value: 0, key: "common.days.sun" },
];

const ACTIVE_WINDOW_TIMEZONES = [
  "Asia/Bangkok",
  "UTC",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Ho_Chi_Minh",
  "Asia/Jakarta",
  "Europe/London",
  "America/New_York",
];

const deviceAnalysisOptions: Array<{ labelKey: string; value: TimeRangePreset }> = [
  { labelKey: "monitorDetail.rangeDay", value: "24h" },
  { labelKey: "monitorDetail.rangeWeek", value: "7d" },
  { labelKey: "monitorDetail.rangeMonth", value: "30d" },
  { labelKey: "monitorDetail.rangeCustom", value: "custom" },
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

const credentialTypeLabelKeys: Record<CredentialType, string> = {
  SNMP_COMMUNITY: "credentials.typeSnmpCommunity",
  USERNAME_PASSWORD: "credentials.typeUsernamePassword",
  API_TOKEN: "credentials.typeApiToken",
  SSH_KEY: "credentials.typeSshKey",
  CLOUDFLARE_ACCESS: "credentials.typeCloudflareAccess",
};

const channelTypeLabels: Record<ChannelType, string> = {
  LINE: "LINE",
  SLACK: "Slack",
  DISCORD: "Discord",
  EMAIL: "Email",
  TELEGRAM: "Telegram",
};

const alertMetricLabels: Record<string, string> = {
  status: "Monitor status",
  response_time: "Response time",
  "cpu.used_pct": "CPU usage",
  "memory.used_pct": "RAM usage",
  "disk.used_pct": "Disk usage",
};

const statusThresholdLabels: Record<number, string> = {
  1: "DOWN",
  2: "DEGRADED",
  3: "UP",
};

const emptyAlertRuleForm = (): AlertRuleForm => ({
  metric: "status",
  operator: "NEQ",
  threshold: "3",
  severity: "CRITICAL",
  enabled: true,
  channelIds: [],
});

const getCompatibleCredentialTypes = (
  type: MonitorType,
  config: Record<string, unknown>,
): CredentialType[] => {
  if (type === "SNMP" || type === "SYSTEM") return ["SNMP_COMMUNITY"];
  if (type === "HTTP") {
    const auth = config.auth;
    if (typeof auth === "object" && auth !== null && !Array.isArray(auth)) {
      const authType = (auth as { type?: unknown }).type;
      if (authType === "basic") return ["USERNAME_PASSWORD"];
      if (authType === "bearer") return ["API_TOKEN"];
    }
  }
  if (type === "DOCKER") return ["API_TOKEN"];
  if (type === "DATABASE") {
    const databaseType = config.type;
    if (typeof databaseType === "string" && databaseType !== "sqlite") {
      return ["USERNAME_PASSWORD"];
    }
  }

  return [];
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

const formatDateTime = (value: string | null | undefined, locale = "th-TH") => {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const formatShortTime = (value: string, locale = "th-TH") => {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatDayLabel = (value: string, locale = "th-TH") => {
  return new Intl.DateTimeFormat(locale, {
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

const WARN_PCT = 75;
const CRITICAL_PCT = 90;

const thresholdCardClass = (pct: number | null | undefined) => {
  if (!isFiniteNumber(pct)) return "border-slate-200 bg-slate-50";
  if (pct >= CRITICAL_PCT) return "border-red-200 bg-red-50";
  if (pct >= WARN_PCT) return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
};

const thresholdValueClass = (pct: number | null | undefined) => {
  if (!isFiniteNumber(pct)) return "text-slate-950";
  if (pct >= CRITICAL_PCT) return "text-red-700";
  if (pct >= WARN_PCT) return "text-amber-700";
  return "text-slate-950";
};

const computeSeriesAnomaly = (
  values: number[],
  latest: number | null | undefined,
  anomalyText: (latest: string, mean: string, stdDev: string) => string,
): string | null => {
  if (!isFiniteNumber(latest) || values.length < 8) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev < 3) return null;
  if (latest > mean + 2 * stdDev)
    return anomalyText(latest.toFixed(1), mean.toFixed(1), stdDev.toFixed(1));
  return null;
};

const formatPercent = (value: number | null | undefined) =>
  isFiniteNumber(value) ? `${value.toFixed(1)}%` : "-";

const formatAlertThreshold = (metric: string, threshold: number) => {
  if (metric === "status") return statusThresholdLabels[threshold] ?? String(threshold);
  if (metric === "response_time") return `${threshold.toLocaleString()} ms`;
  if (metric.endsWith("_pct")) return `${threshold}%`;
  return String(threshold);
};

const operatorSymbols: Record<AlertOperator, string> = { GT: ">", LT: "<", EQ: "=", NEQ: "≠" };

const formatCurrentRuleValue = (metric: string, value: number) => {
  if (metric === "status") return formatStatusValue(value);
  if (metric === "response_time") return `${value.toLocaleString()} ms`;
  if (metric.endsWith("_pct")) return `${value.toFixed(1)}%`;
  return String(value);
};

const evaluateAlertRule = (
  rule: AlertRule,
  latestResult: { status?: string; responseTimeMs?: number | null } | null,
  latestMetadata: DeviceMetadata | null,
): { currentValue: number | null; isFiring: boolean } => {
  let currentValue: number | null = null;

  if (rule.metric === "status") {
    const s = latestResult?.status;
    if (s === "UP") currentValue = 3;
    else if (s === "DEGRADED") currentValue = 2;
    else if (s === "DOWN") currentValue = 1;
  } else if (rule.metric === "response_time") {
    currentValue = latestResult?.responseTimeMs ?? null;
  } else if (rule.metric === "cpu.used_pct") {
    currentValue = latestMetadata?.cpuUsedPct ?? null;
  } else if (rule.metric === "memory.used_pct") {
    currentValue = latestMetadata?.memUsedPct ?? null;
  } else if (rule.metric === "disk.used_pct") {
    const disks = latestMetadata?.disks;
    if (disks && disks.length > 0) {
      currentValue = Math.max(...disks.map((d) => d.usedPct));
    }
  }

  if (currentValue === null) return { currentValue: null, isFiring: false };

  let isFiring = false;
  if (rule.operator === "GT") isFiring = currentValue > rule.threshold;
  else if (rule.operator === "LT") isFiring = currentValue < rule.threshold;
  else if (rule.operator === "EQ") isFiring = currentValue === rule.threshold;
  else if (rule.operator === "NEQ") isFiring = currentValue !== rule.threshold;

  return { currentValue, isFiring };
};

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

const buildRatePoints = (points: Array<{ collectedAt: string; value: number }>, locale: string) => {
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
      timeLabel: formatShortTime(current.collectedAt, locale),
      rateBps,
    });
  }

  return rates;
};

const parseThresholdConfig = (config: Record<string, unknown>): ThresholdForm => {
  const raw = config.alertThresholds;
  const asObj = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const toText = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? String(value) : "");
  return {
    cpuPct: toText((asObj as { cpuPct?: unknown }).cpuPct),
    ramPct: toText((asObj as { ramPct?: unknown }).ramPct),
    diskPct: toText((asObj as { diskPct?: unknown }).diskPct),
  };
};

const MonitorDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api } = useApi();
  const { user } = useSession();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const isAdmin = isAdminUser(user);
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
    activeWindowEnabled: false,
    activeWindowDays: [1, 2, 3, 4, 5],
    activeWindowFrom: "08:00",
    activeWindowTo: "17:00",
    activeWindowTimezone: "Asia/Bangkok",
    configText: "{}",
  });
  const [metricSeries, setMetricSeries] = useState<DeviceMetricSeries[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannelOption[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [selectedEditCredentialId, setSelectedEditCredentialId] = useState("");
  const [thresholdForm, setThresholdForm] = useState<ThresholdForm>({
    cpuPct: "",
    ramPct: "",
    diskPct: "",
  });
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [alertRuleForm, setAlertRuleForm] = useState<AlertRuleForm>(() => emptyAlertRuleForm());

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
      toast.error(t("monitorDetail.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [api, appliedFrom, appliedTo, id, resultsLimit, t]);

  useEffect(() => {
    void fetchMonitor();
  }, [fetchMonitor]);

  useEffect(() => {
    if (!isAdmin) {
      setCredentials([]);
      setCredentialsLoaded(true);
      setNotificationChannels([]);
      setChannelsLoaded(true);
      return;
    }

    const loadCredentials = async () => {
      try {
        const response = await api.get<ApiResponse<CredentialRow[]>>("/credentials");
        if (response.data.success) {
          setCredentials(response.data.data);
        }
      } catch {
        // keep editor usable even if credentials inventory fails to load
      } finally {
        setCredentialsLoaded(true);
      }
    };

    void loadCredentials();
  }, [api, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadChannels = async () => {
      try {
        const response = await api.get<ApiResponse<NotificationChannelOption[]>>("/channels");
        if (response.data.success) {
          setNotificationChannels(response.data.data);
        }
      } catch {
        // rule editor still works; user can add channels later
      } finally {
        setChannelsLoaded(true);
      }
    };

    void loadChannels();
  }, [api, isAdmin]);

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
      toast.error(t("monitorDetail.loadMetricsError"));
    } finally {
      setMetricsLoading(false);
    }
  }, [api, appliedFrom, appliedTo, id, monitor, t]);

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
      toast.error(t("monitorDetail.validationRange"));
      return;
    }

    if (new Date(from).getTime() > new Date(to).getTime()) {
      toast.error(t("monitorDetail.validationRangeOrder"));
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
      timeLabel: formatShortTime(result.checkedAt, locale),
      responseTime: result.responseTimeMs,
      status: result.status,
      statusValue: statusValues[result.status],
      message: result.message ?? "-",
      color: statusColors[result.status],
    }));
  }, [locale, monitor]);

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
      dayLabel: formatDayLabel(dayKey, locale),
      cells: Array.from({ length: 24 }, (_, hour) => {
        const bucket = bucketMap.get(`${dayKey}-${hour}`);

        return {
          hour,
          status: (bucket?.status ?? "NO_DATA") as MonitorStatus | "NO_DATA",
          checks: bucket?.count ?? 0,
        };
      }),
    }));

    return {
      rows,
      hours: Array.from({ length: 24 }, (_, hour) => hour),
    };
  }, [locale, monitor]);

  const isDeviceMonitor = monitor?.type === "SYSTEM" || monitor?.type === "SNMP";
  const latestMetadata = (latestResult?.metadata as DeviceMetadata | null) ?? null;
  const fallbackCredentialConfig = monitor?.config ?? {};
  const parsedEditConfig = useMemo(() => {
    try {
      const parsed = JSON.parse(editForm.configText) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignored until save
    }

    return null;
  }, [editForm.configText]);
  const compatibleCredentialTypes = useMemo(
    () => getCompatibleCredentialTypes(editForm.type, parsedEditConfig ?? fallbackCredentialConfig),
    [editForm.type, fallbackCredentialConfig, parsedEditConfig],
  );
  const availableCredentials = useMemo(
    () => credentials.filter((credential) => compatibleCredentialTypes.includes(credential.type)),
    [compatibleCredentialTypes, credentials],
  );
  const availableAlertMetrics = useMemo(() => {
    const base = ["status", "response_time"];
    if (monitor?.type === "SYSTEM" || monitor?.type === "SNMP") {
      return [...base, "cpu.used_pct", "memory.used_pct", "disk.used_pct"];
    }
    return base;
  }, [monitor?.type]);

  useEffect(() => {
    if (!credentialsLoaded) return;
    if (!selectedEditCredentialId) return;
    if (availableCredentials.some((credential) => credential.id === selectedEditCredentialId)) return;
    setSelectedEditCredentialId("");
  }, [availableCredentials, credentialsLoaded, selectedEditCredentialId]);

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
          timeLabel: formatShortTime(point.collectedAt, locale),
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
  }, [locale, metricSeries]);

  const cpuAnomalyHint = useMemo(
    () =>
      computeSeriesAnomaly(
        utilizationChartData.map((p) => p.cpu).filter(isFiniteNumber),
        latestMetadata?.cpuUsedPct,
        (latest, mean, stdDev) => t("monitorDetail.anomalyHint", { latest, mean, stdDev }),
      ),
    [utilizationChartData, latestMetadata, t],
  );

  const memAnomalyHint = useMemo(
    () =>
      computeSeriesAnomaly(
        utilizationChartData.map((p) => p.memory).filter(isFiniteNumber),
        latestMetadata?.memUsedPct,
        (latest, mean, stdDev) => t("monitorDetail.anomalyHint", { latest, mean, stdDev }),
      ),
    [utilizationChartData, latestMetadata, t],
  );

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
          timeLabel: formatShortTime(point.collectedAt, locale),
        };
        current[key] = point.value;
        bucket.set(point.collectedAt, current);
      }
    }

    return Array.from(bucket.values()).sort(
      (a, b) => new Date(String(a.checkedAt)).getTime() - new Date(String(b.checkedAt)).getTime(),
    );
  }, [diskSeries, locale]);

  const interfaceAnalytics = useMemo(() => {
    const seriesByInterface = new Map<
      string,
      {
        inSeries?: DeviceMetricSeries;
        outSeries?: DeviceMetricSeries;
        inDiscards?: DeviceMetricSeries;
        inErrors?: DeviceMetricSeries;
        outDiscards?: DeviceMetricSeries;
        outErrors?: DeviceMetricSeries;
        operStatus?: DeviceMetricSeries;
      }
    >();

    for (const series of metricSeries.filter((item) => item.metricGroup === "NET")) {
      const instance = series.instance ?? "unknown";
      const current = seriesByInterface.get(instance) ?? {};

      if (series.metricKey === "net.in_octets") current.inSeries = series;
      if (series.metricKey === "net.out_octets") current.outSeries = series;
      if (series.metricKey === "net.in_discards") current.inDiscards = series;
      if (series.metricKey === "net.in_errors") current.inErrors = series;
      if (series.metricKey === "net.out_discards") current.outDiscards = series;
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
        const rxRates = current.inSeries ? buildRatePoints(current.inSeries.points, locale) : [];
        const txRates = current.outSeries ? buildRatePoints(current.outSeries.points, locale) : [];

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
        const latestInDiscards =
          current.inDiscards?.points[current.inDiscards.points.length - 1]?.value ?? 0;
        const latestInErrors = current.inErrors?.points[current.inErrors.points.length - 1]?.value ?? 0;
        const latestOutDiscards =
          current.outDiscards?.points[current.outDiscards.points.length - 1]?.value ?? 0;
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
          latestInDiscards,
          latestInErrors,
          latestOutDiscards,
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
  }, [locale, metricSeries]);

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
      activeWindowEnabled: monitor.activeWindowEnabled,
      activeWindowDays: Array.isArray(monitor.activeWindowDays) && monitor.activeWindowDays.length
        ? monitor.activeWindowDays
        : [1, 2, 3, 4, 5],
      activeWindowFrom: monitor.activeWindowFrom ?? "08:00",
      activeWindowTo: monitor.activeWindowTo ?? "17:00",
      activeWindowTimezone: monitor.activeWindowTimezone ?? "Asia/Bangkok",
      configText: toConfigText(monitor.config),
    });
    setSelectedEditCredentialId(monitor.credential?.id ?? "");
    setThresholdForm(parseThresholdConfig(monitor.config));
    setIsEditing(true);
  };

  const toggleEditActiveWindowDay = (day: number) => {
    setEditForm((current) => {
      const days = current.activeWindowDays.includes(day)
        ? current.activeWindowDays.filter((item) => item !== day)
        : [...current.activeWindowDays, day].sort((a, b) => a - b);
      return { ...current, activeWindowDays: days };
    });
  };

  const handleCheckNow = async () => {
    if (!monitor) return;

    setIsBusy(true);

    try {
      const response = await api.post<ApiResponse<MonitorResult | null>>(`/monitors/${monitor.id}/check`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      if (response.data.data === null) {
        toast.info("Skipped because monitor is outside active window");
      } else {
        toast.success(t("monitorDetail.checkSuccess", { name: monitor.name }));
      }
      await fetchMonitor();
    } catch {
      toast.error(t("monitorDetail.checkError"));
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

      toast.success(monitor.enabled ? t("monitorDetail.disableSuccess") : t("monitorDetail.enableSuccess"));
      await fetchMonitor();
    } catch {
      toast.error(t("monitorDetail.toggleError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateMonitor = async () => {
    if (!monitor) return;

    const interval = Number(editForm.interval);

    if (!editForm.name.trim()) {
      toast.error(t("monitorDetail.validationName"));
      return;
    }

    if (!Number.isFinite(interval) || interval < 10) {
      toast.error(t("monitorDetail.validationInterval"));
      return;
    }

    let config: Record<string, unknown>;

    try {
      const parsed = JSON.parse(editForm.configText) as unknown;

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error(t("monitorDetail.validationConfigObject"));
        return;
      }

      config = parsed as Record<string, unknown>;
    } catch {
      toast.error(t("monitorDetail.validationConfigJson"));
      return;
    }

    if (editForm.type === "SYSTEM" || editForm.type === "SNMP") {
      const toNumberOrNull = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      };
      const cpuPct = toNumberOrNull(thresholdForm.cpuPct);
      const ramPct = toNumberOrNull(thresholdForm.ramPct);
      const diskPct = toNumberOrNull(thresholdForm.diskPct);
      const values = [cpuPct, ramPct, diskPct].filter((value) => value !== null);
      if (values.some((value) => Number.isNaN(value))) {
        toast.error(t("monitorDetail.validationThresholdNumber"));
        return;
      }
      if (values.some((value) => (value as number) < 1 || (value as number) > 100)) {
        toast.error(t("monitorDetail.validationThresholdRange"));
        return;
      }
      const thresholdConfig: Record<string, number> = {};
      if (cpuPct !== null) thresholdConfig.cpuPct = cpuPct as number;
      if (ramPct !== null) thresholdConfig.ramPct = ramPct as number;
      if (diskPct !== null) thresholdConfig.diskPct = diskPct as number;
      if (Object.keys(thresholdConfig).length > 0) {
        config.alertThresholds = thresholdConfig;
      } else {
        delete config.alertThresholds;
      }
    }

    setIsBusy(true);

    try {
      const response = await api.patch<ApiResponse<MonitorDetail>>(`/monitors/${monitor.id}`, {
        name: editForm.name.trim(),
        type: editForm.type,
        interval,
        enabled: editForm.enabled,
        activeWindowEnabled: editForm.activeWindowEnabled,
        activeWindowDays: editForm.activeWindowDays,
        activeWindowFrom: editForm.activeWindowFrom,
        activeWindowTo: editForm.activeWindowTo,
        activeWindowTimezone: editForm.activeWindowTimezone,
        config,
        credentialId: selectedEditCredentialId,
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("monitorDetail.updateSuccess"));
      setIsEditing(false);
      await fetchMonitor();
    } catch {
      toast.error(t("monitorDetail.updateError"));
    } finally {
      setIsBusy(false);
    }
  };

  const openCreateRule = (metric = "status") => {
    const next = emptyAlertRuleForm();
    next.metric = metric;
    if (metric === "status") {
      next.operator = "NEQ";
      next.threshold = "3";
      next.severity = "CRITICAL";
    } else if (metric === "response_time") {
      next.operator = "GT";
      next.threshold = "2000";
      next.severity = "WARNING";
    } else {
      next.operator = "GT";
      next.threshold = "90";
      next.severity = metric === "disk.used_pct" ? "CRITICAL" : "WARNING";
    }
    setEditingRule(null);
    setAlertRuleForm(next);
    setIsRuleModalOpen(true);
  };

  const openEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    setAlertRuleForm({
      metric: rule.metric,
      operator: rule.operator,
      threshold: String(rule.threshold),
      severity: rule.severity,
      enabled: rule.enabled,
      channelIds: rule.channels?.map((item) => item.channel.id) ?? [],
    });
    setIsRuleModalOpen(true);
  };

  const handleRuleMetricChange = (metric: string) => {
    setAlertRuleForm((current) => {
      if (metric === "status") {
        return { ...current, metric, operator: "NEQ", threshold: "3" };
      }
      if (metric === "response_time") {
        return { ...current, metric, operator: "GT", threshold: current.metric === "status" ? "2000" : current.threshold };
      }
      return { ...current, metric, operator: "GT", threshold: current.metric === "status" ? "90" : current.threshold };
    });
  };

  const toggleRuleChannel = (channelId: string) => {
    setAlertRuleForm((current) => ({
      ...current,
      channelIds: current.channelIds.includes(channelId)
        ? current.channelIds.filter((id) => id !== channelId)
        : [...current.channelIds, channelId],
    }));
  };

  const handleSaveRule = async () => {
    if (!monitor) return;
    if (!availableAlertMetrics.includes(alertRuleForm.metric)) {
      toast.error(t("monitorDetail.validationMetricUnsupported"));
      return;
    }

    const threshold = Number(alertRuleForm.threshold);
    if (!Number.isFinite(threshold)) {
      toast.error(t("monitorDetail.validationThresholdNumber"));
      return;
    }
    if (alertRuleForm.metric === "status" && ![1, 2, 3].includes(threshold)) {
      toast.error(t("monitorDetail.validationStatusThreshold"));
      return;
    }
    if (alertRuleForm.metric.endsWith("_pct") && (threshold < 0 || threshold > 100)) {
      toast.error(t("monitorDetail.validationPercentThreshold"));
      return;
    }

    setIsBusy(true);
    try {
      const payload = {
        metric: alertRuleForm.metric,
        operator: alertRuleForm.operator,
        threshold,
        severity: alertRuleForm.severity,
        enabled: alertRuleForm.enabled,
        channelIds: alertRuleForm.channelIds,
      };
      const response = editingRule
        ? await api.patch<ApiResponse<AlertRule>>(`/monitors/${monitor.id}/alert-rules/${editingRule.id}`, payload)
        : await api.post<ApiResponse<AlertRule>>(`/monitors/${monitor.id}/alert-rules`, payload);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(editingRule ? t("monitorDetail.ruleUpdateSuccess") : t("monitorDetail.ruleCreateSuccess"));
      setIsRuleModalOpen(false);
      setEditingRule(null);
      await fetchMonitor();
    } catch {
      toast.error(t("monitorDetail.ruleSaveError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteRule = async (rule: AlertRule) => {
    if (!monitor) return;
    if (!window.confirm(t("monitorDetail.ruleDeleteConfirm", { metric: t(`monitorDetail.metrics.${rule.metric}`, { defaultValue: rule.metric }) }))) return;

    setIsBusy(true);
    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(
        `/monitors/${monitor.id}/alert-rules/${rule.id}`,
      );
      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }
      toast.success(t("monitorDetail.ruleDeleteSuccess"));
      await fetchMonitor();
    } catch {
      toast.error(t("monitorDetail.ruleDeleteError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteMonitor = async () => {
    if (!monitor) return;

    const confirmed = window.confirm(t("monitorDetail.deleteConfirm", { name: monitor.name }));
    if (!confirmed) return;

    setIsBusy(true);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(`/monitors/${monitor.id}`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("monitorDetail.deleteSuccess"));
      navigate("/monitors", { replace: true });
    } catch {
      toast.error(t("monitorDetail.deleteError"));
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {t("monitorDetail.loading")}
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-950">{t("monitorDetail.notFound")}</h1>
          <Link className="mt-4 inline-flex text-sm font-semibold text-cyan-700" to="/monitors">
            {t("monitorDetail.backToMonitors")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-cyan-700">{t("monitorDetail.title")}</p>
          <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">{monitor.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {t("monitorDetail.targetSummary", { type: monitor.type, target: getTarget(monitor), interval: monitor.interval })}
          </p>
          {monitor.activeWindowEnabled ? (
            <div className="mt-2">
              <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
                {t("activeWindow.badge")}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            to="/monitors"
          >
            {t("common.back")}
          </Link>
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchMonitor()}
            disabled={isBusy}
          >
            {t("common.refresh")}
          </button>
          {monitor.type === "SNMP" || monitor.type === "SYSTEM" ? (
            <Link
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              to={`/interfaces?deviceId=${monitor.id}`}
            >
              {t("monitorDetail.viewInterfaces")}
            </Link>
          ) : null}
          {isAdmin ? (
            <>
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleCheckNow()}
                disabled={isBusy || !monitor.enabled}
              >
                {t("monitors.checkNow")}
              </button>
              <button
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleToggleEnabled()}
                disabled={isBusy}
              >
                {monitor.enabled ? t("common.disable") : t("common.enable")}
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={openEditModal}
                disabled={isBusy}
              >
                {t("common.edit")}
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDeleteMonitor()}
                disabled={isBusy}
              >
                {t("common.delete")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t("common.status")}</p>
          <span
            className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[latestStatus]}`}
          >
            {latestStatus}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t("monitorDetail.lastResponse")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {formatResponseTime(latestResult?.responseTimeMs)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t("monitorDetail.lastChecked")}</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {formatDateTime(latestResult?.checkedAt, locale)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t("monitorDetail.recentChecks")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{resultSummary.total}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("monitorDetail.recentSummary", {
              up: resultSummary.upCount,
              down: resultSummary.downCount,
              avg: formatResponseTime(resultSummary.avgResponse),
            })}
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
                    <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.deviceMetrics")}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("monitorDetail.deviceMetricsDescription")}
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
                            {t(option.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400">
                      {metricsLoading
                        ? t("monitorDetail.loadingMetrics")
                        : t("monitorDetail.seriesInRange", { count: metricSeries.length })}
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
                      {t("monitorDetail.apply")}
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className={`rounded-md border p-3 ${thresholdCardClass(latestMetadata?.cpuUsedPct)}`}>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-slate-500">CPU</p>
                      {cpuAnomalyHint ? (
                        <span className="text-[10px] font-semibold text-amber-600" title={cpuAnomalyHint}>
                          {t("monitorDetail.anomaly")}
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-1 text-lg font-semibold ${thresholdValueClass(latestMetadata?.cpuUsedPct)}`}>
                      {formatPercent(latestMetadata?.cpuUsedPct)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      load {isFiniteNumber(latestMetadata?.load1) ? latestMetadata?.load1?.toFixed(2) : "-"} /{" "}
                      {isFiniteNumber(latestMetadata?.load5) ? latestMetadata?.load5?.toFixed(2) : "-"} /{" "}
                      {isFiniteNumber(latestMetadata?.load15) ? latestMetadata?.load15?.toFixed(2) : "-"}
                    </p>
                  </div>
                  <div className={`rounded-md border p-3 ${thresholdCardClass(latestMetadata?.memUsedPct)}`}>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs text-slate-500">Memory</p>
                      {memAnomalyHint ? (
                        <span className="text-[10px] font-semibold text-amber-600" title={memAnomalyHint}>
                          {t("monitorDetail.anomaly")}
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-1 text-lg font-semibold ${thresholdValueClass(latestMetadata?.memUsedPct)}`}>
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
                      {t("monitorDetail.disksTracked", { count: latestMetadata?.disks?.length ?? 0 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 2xl:grid-cols-2">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.cpuMemory")}</h2>
                  </div>
                  <div className="h-72 p-4">
                    {utilizationChartData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        {t("monitorDetail.noTimeSeries")}
                      </div>
                    ) : (
                      <ResponsiveContainer height="100%" width="100%">
                        <LineChart data={utilizationChartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                          <XAxis dataKey="timeLabel" minTickGap={24} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} width={56} />
                          <ReferenceLine y={WARN_PCT} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "75%", position: "insideTopRight", fontSize: 10, fill: "#d97706" }} />
                          <ReferenceLine y={CRITICAL_PCT} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "90%", position: "insideTopRight", fontSize: 10, fill: "#dc2626" }} />
                          <Tooltip
                            formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                            labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(payload[0].payload.checkedAt, locale) : "")}
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
                      <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.trafficRate")}</h2>
                      <span className="text-xs text-slate-400">{t("monitorDetail.trafficRateDescription")}</span>
                    </div>
                  </div>
                  <div className="h-72 p-4">
                    {interfaceAnalytics.totalTrafficRateData.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        {t("monitorDetail.noTrafficRate")}
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
                            labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(payload[0].payload.checkedAt, locale) : "")}
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
                  <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.topInterfaceTraffic")}</h2>
                </div>
                <div className="h-72 p-4">
                  {interfaceAnalytics.interfaceTrafficChartData.length === 0 ||
                  interfaceAnalytics.topInterfaces.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      {t("monitorDetail.noInterfaceTraffic")}
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
                              ? formatDateTime(String(payload[0].payload.checkedAt), locale)
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
                  <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.diskUsage")}</h2>
                </div>
                <div className="h-72 p-4">
                  {diskChartData.length === 0 || diskSeries.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      {t("monitorDetail.noDiskMetrics")}
                    </div>
                  ) : (
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart data={diskChartData} margin={{ bottom: 8, left: 0, right: 12, top: 12 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="timeLabel" minTickGap={24} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(value) => `${value}%`} tickLine={false} width={56} />
                        <ReferenceLine y={WARN_PCT} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "75%", position: "insideTopRight", fontSize: 10, fill: "#d97706" }} />
                        <ReferenceLine y={CRITICAL_PCT} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "90%", position: "insideTopRight", fontSize: 10, fill: "#dc2626" }} />
                        <Tooltip
                          formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                          labelFormatter={(_, payload) => (payload?.[0]?.payload?.checkedAt ? formatDateTime(String(payload[0].payload.checkedAt), locale) : "")}
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
                  <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.latestInterfaces")}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">{t("monitorDetail.interface")}</th>
                        <th className="px-4 py-3">{t("common.status")}</th>
                        <th className="px-4 py-3">{t("monitorDetail.rxRate")}</th>
                        <th className="px-4 py-3">{t("monitorDetail.txRate")}</th>
                        <th className="px-4 py-3">{t("monitorDetail.errors")}</th>
                        <th className="px-4 py-3">{t("monitorDetail.discards")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!interfaceAnalytics.topInterfaces.length ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                            {t("monitorDetail.noInterfaces")}
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
                              {t("monitorDetail.inOut", { in: Math.round(iface.latestInErrors), out: Math.round(iface.latestOutErrors) })}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {t("monitorDetail.inOut", { in: Math.round(iface.latestInDiscards), out: Math.round(iface.latestOutDiscards) })}
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
                  <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.availabilityMap")}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("monitorDetail.availabilityMapDescription")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/85" />
                    {t("monitorDetail.up")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/85" />
                    {t("monitorDetail.degraded")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/85" />
                    {t("monitorDetail.down")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                    {t("common.noData")}
                  </span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto px-4 py-4">
              {availabilityMap.rows.length === 0 ? (
                <div className="flex h-36 items-center justify-center text-sm text-slate-500">
                  {t("monitorDetail.noAvailability")}
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
                              .padStart(2, "0")}:00 - ${cell.status === "NO_DATA" ? t("common.noData") : cell.status}${cell.checks > 0 ? ` (${t("monitorDetail.checksCount", { count: cell.checks })})` : ""}`}
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
                <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.responseTime")}</h2>
              </div>
              <div className="h-72 p-4">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {t("monitorDetail.noChartData")}
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
                          t("monitorDetail.response"),
                        ]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.checkedAt
                            ? formatDateTime(payload[0].payload.checkedAt, locale)
                            : ""
                        }
                      />
                      <Line
                        connectNulls={false}
                        dataKey="responseTime"
                        dot={{ r: 3, strokeWidth: 2 }}
                        name={t("monitorDetail.response")}
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
                <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.statusTimeline")}</h2>
              </div>
              <div className="h-72 p-4">
                {chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {t("monitorDetail.noChartData")}
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
                        formatter={(_, __, item) => [item.payload.status, t("common.status")]}
                        labelFormatter={(_, payload) =>
                          payload?.[0]?.payload?.checkedAt
                            ? formatDateTime(payload[0].payload.checkedAt, locale)
                            : ""
                        }
                      />
                      <Bar dataKey="statusValue" name={t("common.status")} radius={[4, 4, 0, 0]}>
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
                <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.recentResults")}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={timeRange}
                    onChange={(event) => handleTimeRangeChange(event.target.value as TimeRangePreset)}
                  >
                    {timeRangeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
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
                        {t("monitorDetail.apply")}
                      </button>
                    </>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    {t("monitorDetail.showingResults", { count: monitor.results.length })}
                  </span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("common.status")}</th>
                    <th className="px-4 py-3">{t("monitorDetail.response")}</th>
                    <th className="px-4 py-3">{t("monitorDetail.message")}</th>
                    <th className="px-4 py-3">{t("monitorDetail.checkedAt")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monitor.results.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                        {t("monitorDetail.noResults")}
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
                        <span className="wrap-break-word">{result.message ?? "-"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(result.checkedAt, locale)}
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
                  {t("monitorDetail.loadMoreResults")}
                </button>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.incidents")}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {monitor.incidents.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">{t("monitorDetail.noIncidents")}</div>
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
                    {formatDateTime(incident.startedAt, locale)}
                    {incident.resolvedAt ? ` - ${formatDateTime(incident.resolvedAt, locale)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.configuration")}</h2>
            {monitor.credential ? (
              <div className="mt-4 rounded-md border border-violet-200 bg-violet-50 px-3 py-3 text-sm">
                <div className="font-semibold text-violet-950">{t("monitorDetail.linkedCredential")}</div>
                <div className="mt-1 text-violet-800">
                  {monitor.credential.name} · {monitor.credential.type}
                </div>
                <p className="mt-2 text-xs text-violet-700">
                  {t("monitorDetail.linkedCredentialHint")}
                </p>
              </div>
            ) : null}
            <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {toConfigText(monitor.config)}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">{t("monitorDetail.alertRules")}</h2>
                <p className="mt-1 text-xs text-slate-500">{t("monitorDetail.alertRulesDescription")}</p>
              </div>
              {isAdmin ? (
                <button
                  className="rounded-md bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                  type="button"
                  onClick={() => openCreateRule()}
                >
                  {t("monitorDetail.newRule")}
                </button>
              ) : null}
            </div>
            {isAdmin && isDeviceMonitor ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { label: "CPU", metric: "cpu.used_pct", default: "> 90%", severity: "WARNING" },
                  { label: "RAM", metric: "memory.used_pct", default: "> 90%", severity: "WARNING" },
                  { label: "Disk", metric: "disk.used_pct", default: "> 90%", severity: "CRITICAL" },
                ].map((preset) => (
                  <button
                    key={preset.metric}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:bg-amber-100"
                    type="button"
                    onClick={() => openCreateRule(preset.metric)}
                  >
                    <p className="text-xs font-semibold text-amber-900">+ {preset.label} {t("monitorDetail.threshold")}</p>
                    <p className="mt-0.5 text-[11px] text-amber-700">{t("monitorDetail.alertWhen", { condition: preset.default, severity: preset.severity })}</p>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 divide-y divide-slate-100">
              {monitor.alertRules.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">{t("monitorDetail.noAlertRules")}</div>
              ) : null}
              {monitor.alertRules.map((rule) => {
                const { currentValue, isFiring } = evaluateAlertRule(rule, latestResult, latestMetadata);
                return (
                <div className="py-3" key={rule.id}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {t(`monitorDetail.metrics.${rule.metric}`, { defaultValue: alertMetricLabels[rule.metric] ?? rule.metric })}
                    </p>
                    <div className="flex items-center gap-2">
                      {currentValue !== null && rule.enabled ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isFiring
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {isFiring ? "▲ " : "✓ "}{formatCurrentRuleValue(rule.metric, currentValue)}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {rule.enabled ? t("common.enabled") : t("common.disabled")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {t("monitorDetail.alertWhen", {
                      condition: `${operatorSymbols[rule.operator]} ${formatAlertThreshold(rule.metric, rule.threshold)}`,
                      severity: rule.severity,
                    })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(rule.channels ?? []).length === 0 ? (
                      <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{t("monitorDetail.noChannels")}</span>
                    ) : null}
                    {(rule.channels ?? []).map(({ channel }) => (
                      <span
                        className={`rounded px-2 py-1 text-[11px] ${
                          channel.enabled ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-500"
                        }`}
                        key={channel.id}
                      >
                        {channel.name} · {channelTypeLabels[channel.type]}
                      </span>
                    ))}
                  </div>
                  {isAdmin ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        type="button"
                        onClick={() => openEditRule(rule)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        className="rounded-md border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                        type="button"
                        onClick={() => void handleDeleteRule(rule)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
          </div>
        </aside>
      </section>

      {isAdmin && isEditing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("monitorDetail.editMonitor")}</h2>
              <p className="mt-1 text-sm text-slate-500">{monitor?.name}</p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("common.name")}</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("common.type")}</span>
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
                  <span className="text-sm font-medium text-slate-700">{t("common.interval")}</span>
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

                <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 sm:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-violet-950">{t("monitorDetail.linkedCredential")}</p>
                      <p className="mt-1 text-xs text-violet-800">
                        {t("monitorDetail.changeCredentialHint")}
                      </p>
                    </div>
                    <Link
                      className="text-xs font-semibold text-violet-700 transition hover:text-violet-900"
                      to="/credentials"
                    >
                      {t("monitorDetail.manageCredentials")}
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <label className="block">
                      <span className="text-sm font-medium text-violet-950">{t("monitorDetail.credential")}</span>
                      <select
                        className="mt-2 w-full rounded-md border border-violet-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                        value={selectedEditCredentialId}
                        onChange={(event) => setSelectedEditCredentialId(event.target.value)}
                      >
                        <option value="">{t("monitorDetail.noLinkedCredential")}</option>
                        {availableCredentials.map((credential) => (
                          <option key={credential.id} value={credential.id}>
                            {credential.name} · {t(credentialTypeLabelKeys[credential.type])}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-md border border-violet-200 bg-white px-3 py-3 text-xs text-violet-900">
                      <div className="font-semibold">{t("monitorDetail.compatibleTypes")}</div>
                      <div className="mt-1">
                        {compatibleCredentialTypes.length > 0
                          ? compatibleCredentialTypes.map((type) => t(credentialTypeLabelKeys[type])).join(", ")
                          : t("monitorDetail.noSharedCredentialNeeded")}
                      </div>
                    </div>
                  </div>

                  {compatibleCredentialTypes.length > 0 && availableCredentials.length === 0 ? (
                    <p className="mt-3 text-xs text-violet-800">
                      {t("monitorDetail.noCompatibleCredentials")}
                    </p>
                  ) : null}
                </div>

                <label className="flex items-center gap-3 sm:col-span-2">
                  <input
                    checked={editForm.enabled}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    type="checkbox"
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">{t("common.enabled")}</span>
                </label>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                  <label className="flex items-center gap-3">
                    <input
                      checked={editForm.activeWindowEnabled}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      type="checkbox"
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          activeWindowEnabled: event.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm font-medium text-slate-700">{t("activeWindow.restrict")}</span>
                  </label>

                  {editForm.activeWindowEnabled ? (
                    <div className="mt-4 grid gap-4">
                      <div>
                        <div className="text-sm font-medium text-slate-700">{t("activeWindow.days")}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ACTIVE_WINDOW_DAYS.map((day) => (
                            <label
                              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                              key={day.value}
                            >
                              <input
                                checked={editForm.activeWindowDays.includes(day.value)}
                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                type="checkbox"
                                onChange={() => toggleEditActiveWindowDay(day.value)}
                              />
                              {t(day.key)}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">{t("activeWindow.from")}</span>
                          <input
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                            type="time"
                            value={editForm.activeWindowFrom}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                activeWindowFrom: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">{t("activeWindow.to")}</span>
                          <input
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                            type="time"
                            value={editForm.activeWindowTo}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                activeWindowTo: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">{t("activeWindow.timezone")}</span>
                          <select
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                            value={editForm.activeWindowTimezone}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                activeWindowTimezone: event.target.value,
                              }))
                            }
                          >
                            {ACTIVE_WINDOW_TIMEZONES.map((timezone) => (
                              <option key={timezone} value={timezone}>
                                {timezone}
                              </option>
                            ))}
                            {!ACTIVE_WINDOW_TIMEZONES.includes(editForm.activeWindowTimezone) ? (
                              <option value={editForm.activeWindowTimezone}>
                                {editForm.activeWindowTimezone}
                              </option>
                            ) : null}
                          </select>
                        </label>
                      </div>
                      <p className="text-xs text-slate-500">{t("activeWindow.note")}</p>
                    </div>
                  ) : null}
                </div>

                {editForm.type === "SYSTEM" || editForm.type === "SNMP" ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:col-span-2">
                    <p className="text-sm font-semibold text-amber-900">{t("monitorDetail.deviceAlertThresholds")}</p>
                    <p className="mt-1 text-xs text-amber-800">
                      {t("monitorDetail.deviceAlertThresholdsHint")}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="text-xs font-medium text-amber-900">CPU %</span>
                        <input
                          className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                          min={1}
                          max={100}
                          type="number"
                          value={thresholdForm.cpuPct}
                          onChange={(event) =>
                            setThresholdForm((current) => ({ ...current, cpuPct: event.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-amber-900">RAM %</span>
                        <input
                          className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                          min={1}
                          max={100}
                          type="number"
                          value={thresholdForm.ramPct}
                          onChange={(event) =>
                            setThresholdForm((current) => ({ ...current, ramPct: event.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-amber-900">Disk %</span>
                        <input
                          className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                          min={1}
                          max={100}
                          type="number"
                          value={thresholdForm.diskPct}
                          onChange={(event) =>
                            setThresholdForm((current) => ({ ...current, diskPct: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("monitorDetail.configJson")}</span>
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
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleUpdateMonitor()}
                disabled={isBusy}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && isRuleModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editingRule ? t("monitorDetail.editAlertRule") : t("monitorDetail.createAlertRule")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{monitor?.name}</p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("monitorDetail.metric")}</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={alertRuleForm.metric}
                    onChange={(event) => handleRuleMetricChange(event.target.value)}
                  >
                    {availableAlertMetrics.map((metric) => (
                      <option key={metric} value={metric}>
                        {t(`monitorDetail.metrics.${metric}`, { defaultValue: alertMetricLabels[metric] ?? metric })}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("monitorDetail.operator")}</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={alertRuleForm.operator}
                    onChange={(event) =>
                      setAlertRuleForm((current) => ({
                        ...current,
                        operator: event.target.value as AlertOperator,
                      }))
                    }
                  >
                    <option value="GT">{t("monitorDetail.operatorGt")}</option>
                    <option value="LT">{t("monitorDetail.operatorLt")}</option>
                    <option value="EQ">{t("monitorDetail.operatorEq")}</option>
                    <option value="NEQ">{t("monitorDetail.operatorNeq")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("monitorDetail.threshold")}</span>
                  {alertRuleForm.metric === "status" ? (
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={alertRuleForm.threshold}
                      onChange={(event) =>
                        setAlertRuleForm((current) => ({ ...current, threshold: event.target.value }))
                      }
                    >
                      <option value="3">UP</option>
                      <option value="2">DEGRADED</option>
                      <option value="1">DOWN</option>
                    </select>
                  ) : (
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      min={0}
                      max={alertRuleForm.metric.endsWith("_pct") ? 100 : undefined}
                      type="number"
                      value={alertRuleForm.threshold}
                      onChange={(event) =>
                        setAlertRuleForm((current) => ({ ...current, threshold: event.target.value }))
                      }
                    />
                  )}
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("monitorDetail.severity")}</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={alertRuleForm.severity}
                    onChange={(event) =>
                      setAlertRuleForm((current) => ({
                        ...current,
                        severity: event.target.value as AlertSeverity,
                      }))
                    }
                  >
                    <option value="INFO">{t("monitorDetail.severityInfo")}</option>
                    <option value="WARNING">{t("monitorDetail.severityWarning")}</option>
                    <option value="CRITICAL">{t("monitorDetail.severityCritical")}</option>
                  </select>
                </label>

                <label className="flex items-center gap-3 pt-7">
                  <input
                    checked={alertRuleForm.enabled}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    type="checkbox"
                    onChange={(event) =>
                      setAlertRuleForm((current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">{t("common.enabled")}</span>
                </label>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">{t("monitorDetail.notificationChannels")}</span>
                    <Link className="text-xs font-semibold text-cyan-700 hover:text-cyan-900" to="/channels">
                      {t("monitorDetail.manageChannels")}
                    </Link>
                  </div>
                  <div className="mt-2 grid gap-2">
                    {channelsLoaded && notificationChannels.length === 0 ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                        {t("monitorDetail.noNotificationChannels")}
                      </div>
                    ) : null}
                    {notificationChannels.map((channel) => (
                      <label
                        className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                        key={channel.id}
                      >
                        <span className="min-w-0 text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{channel.name}</span>
                          <span className="ml-2 text-xs text-slate-500">
                            {channelTypeLabels[channel.type]} · {channel.enabled ? t("common.enabled") : t("common.disabled")}
                          </span>
                        </span>
                        <input
                          checked={alertRuleForm.channelIds.includes(channel.id)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          type="checkbox"
                          onChange={() => toggleRuleChannel(channel.id)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                type="button"
                onClick={() => {
                  setIsRuleModalOpen(false);
                  setEditingRule(null);
                }}
                disabled={isBusy}
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                type="button"
                onClick={() => void handleSaveRule()}
                disabled={isBusy}
              >
                {editingRule ? t("monitorDetail.saveRule") : t("monitorDetail.createRule")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MonitorDetailPage;
