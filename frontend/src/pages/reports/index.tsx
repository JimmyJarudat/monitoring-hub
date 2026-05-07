import { useCallback, useEffect, useMemo, useState } from "react";
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
type IncidentStatus = "OPEN" | "RESOLVED";
type TimeRangePreset = "day" | "week" | "month" | "custom";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

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

type MonitorResultRow = {
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
    interval: number;
    config: Record<string, unknown>;
  };
};

type ResultsResponse = {
  items: MonitorResultRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<MonitorStatus, number>;
};

type IncidentRow = {
  id: string;
  status: IncidentStatus;
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
  monitorId: string;
  alertRuleId: string | null;
  monitor: {
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
    interval: number;
    config: Record<string, unknown>;
  };
  alertRule: {
    id: string;
    metric: string;
    operator: string;
    threshold: number;
    severity: string;
    enabled: boolean;
  } | null;
};

type IncidentsResponse = {
  items: IncidentRow[];
  page: number;
  limit: number;
  hasMore: boolean;
  statusCounts: Record<IncidentStatus, number>;
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
    latestResult: {
      status: MonitorStatus;
      responseTimeMs: number | null;
      checkedAt: string;
    } | null;
  }>;
};

type ReportsData = {
  summary: MonitorSummary;
  results: MonitorResultRow[];
  incidents: IncidentRow[];
  groups: GroupRow[];
};

type MonitorReportRow = {
  id: string;
  monitor: string;
  type: MonitorType;
  checks: number;
  uptime: number | null;
  down: number;
  degraded: number;
  avgResponse: number | null;
  lastStatus: MonitorStatus | null;
};

type GroupReportRow = {
  id: string;
  name: string;
  monitorCount: number;
  checks: number;
  up: number;
  down: number;
  degraded: number;
  incidents: number;
  uptime: number | null;
  avgResponse: number | null;
};

type ReportExportPayload = {
  generatedAt: string;
  range: {
    label: string;
    from: string;
    to: string;
  };
  summary: {
    reportUptime: number | null;
    checks: number;
    up: number;
    degraded: number;
    down: number;
    incidents: number;
    openIncidents: number;
    resolvedIncidents: number;
    avgResponseMs: number | null;
    fleetUptime24h: number | null;
    fleetAvgResponseMs: number | null;
  };
  monitorRanking: MonitorReportRow[];
  groupSummary: GroupReportRow[];
  incidents: Array<{
    id: string;
    monitor: string;
    type: MonitorType;
    status: IncidentStatus;
    startedAt: string;
    resolvedAt: string | null;
    duration: string;
    severity: string | null;
    message: string | null;
  }>;
  resultSamples: Array<{
    id: string;
    monitor: string;
    type: MonitorType;
    status: MonitorStatus;
    responseTimeMs: number | null;
    checkedAt: string;
    message: string | null;
  }>;
};

const presetDurationsMs: Record<Exclude<TimeRangePreset, "custom">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const timeRangeOptions: Array<{ label: string; value: TimeRangePreset }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Custom", value: "custom" },
];

const statusColors: Record<MonitorStatus | "UNKNOWN", string> = {
  UP: "#059669",
  DEGRADED: "#d97706",
  DOWN: "#e11d48",
  UNKNOWN: "#94a3b8",
};

const statusBadgeStyles: Record<MonitorStatus | IncidentStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
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

const formatChartTime = (value: string) => {
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  }).format(new Date(value));
};

const formatPercent = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value}%` : "-";
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const formatDuration = (startedAt: string, resolvedAt: string | null) => {
  const startMs = new Date(startedAt).getTime();
  const endMs = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const diffMs = Math.max(endMs - startMs, 0);
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (rows.length === 0) {
    toast.info("ไม่มีข้อมูลสำหรับ export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","));
  const csv = [headers.join(","), ...body].join("\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
};

const downloadJson = (filename: string, payload: ReportExportPayload) => {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
};

const escapeHtml = (value: unknown) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const statusCellClass = (status: MonitorStatus | IncidentStatus | null) => {
  if (status === "UP" || status === "RESOLVED") return "status-up";
  if (status === "DEGRADED") return "status-degraded";
  if (status === "DOWN" || status === "OPEN") return "status-down";
  return "status-muted";
};

const tableRows = (rows: Array<Record<string, unknown>>) => {
  if (rows.length === 0) {
    return '<tr><td class="empty" colspan="8">No data</td></tr>';
  }

  const headers = Object.keys(rows[0]);
  const head = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  const body = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((header) => {
            const value = row[header];
            const className = header.toLowerCase().includes("status")
              ? ` class="${statusCellClass(value as MonitorStatus | IncidentStatus | null)}"`
              : "";
            return `<td${className}>${escapeHtml(value)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  return `${head}${body}`;
};

const downloadExcel = (filename: string, payload: ReportExportPayload) => {
  const summaryRows = [
    { Metric: "Report uptime", Value: formatPercent(payload.summary.reportUptime) },
    { Metric: "Checks", Value: payload.summary.checks },
    { Metric: "UP", Value: payload.summary.up },
    { Metric: "DEGRADED", Value: payload.summary.degraded },
    { Metric: "DOWN", Value: payload.summary.down },
    { Metric: "Incidents", Value: payload.summary.incidents },
    { Metric: "Open incidents", Value: payload.summary.openIncidents },
    { Metric: "Resolved incidents", Value: payload.summary.resolvedIncidents },
    { Metric: "Average response", Value: formatResponseTime(payload.summary.avgResponseMs) },
    { Metric: "Fleet uptime 24h", Value: formatPercent(payload.summary.fleetUptime24h) },
  ];

  const workbook = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; }
    .title { background: #0f172a; color: #ffffff; font-size: 22px; font-weight: 700; }
    .subtitle { background: #164e63; color: #ecfeff; font-size: 12px; }
    .section { background: #06b6d4; color: #ffffff; font-size: 14px; font-weight: 700; }
    table { border-collapse: collapse; margin-bottom: 18px; width: 100%; }
    th { background: #e2e8f0; color: #334155; font-weight: 700; border: 1px solid #cbd5e1; padding: 8px; }
    td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .summary td:first-child { background: #f1f5f9; font-weight: 700; }
    .status-up { background: #dcfce7; color: #166534; font-weight: 700; }
    .status-degraded { background: #fef3c7; color: #92400e; font-weight: 700; }
    .status-down { background: #ffe4e6; color: #be123c; font-weight: 700; }
    .status-muted { background: #f1f5f9; color: #64748b; font-weight: 700; }
    .empty { color: #64748b; font-style: italic; text-align: center; }
  </style>
</head>
<body>
  <table>
    <tr><td class="title" colspan="10">Monitoring Hub Report</td></tr>
    <tr><td class="subtitle" colspan="10">Generated at ${escapeHtml(formatDateTime(payload.generatedAt))}</td></tr>
    <tr><td class="subtitle" colspan="10">Range: ${escapeHtml(payload.range.label)} (${escapeHtml(formatDateTime(payload.range.from))} - ${escapeHtml(formatDateTime(payload.range.to))})</td></tr>
  </table>

  <table class="summary">
    <tr><td class="section" colspan="2">Executive Summary</td></tr>
    ${tableRows(summaryRows)}
  </table>

  <table>
    <tr><td class="section" colspan="8">Monitor Reliability Ranking</td></tr>
    ${tableRows(
      payload.monitorRanking.map((row) => ({
        Monitor: row.monitor,
        Type: row.type,
        Checks: row.checks,
        Uptime: formatPercent(row.uptime),
        Down: row.down,
        Degraded: row.degraded,
        "Avg Response": formatResponseTime(row.avgResponse),
        "Last Status": row.lastStatus ?? "",
      })),
    )}
  </table>

  <table>
    <tr><td class="section" colspan="9">Group Summary</td></tr>
    ${tableRows(
      payload.groupSummary.map((row) => ({
        Group: row.name,
        Monitors: row.monitorCount,
        Checks: row.checks,
        Uptime: formatPercent(row.uptime),
        UP: row.up,
        Down: row.down,
        Degraded: row.degraded,
        Incidents: row.incidents,
        "Avg Response": formatResponseTime(row.avgResponse),
      })),
    )}
  </table>

  <table>
    <tr><td class="section" colspan="8">Incident Report</td></tr>
    ${tableRows(
      payload.incidents.map((row) => ({
        Monitor: row.monitor,
        Type: row.type,
        Status: row.status,
        Started: formatDateTime(row.startedAt),
        Resolved: formatDateTime(row.resolvedAt),
        Duration: row.duration,
        Severity: row.severity ?? "",
        Message: row.message ?? "",
      })),
    )}
  </table>

  <table>
    <tr><td class="section" colspan="7">Result Samples</td></tr>
    ${tableRows(
      payload.resultSamples.map((row) => ({
        Monitor: row.monitor,
        Type: row.type,
        Status: row.status,
        "Response Time": formatResponseTime(row.responseTimeMs),
        "Checked At": formatDateTime(row.checkedAt),
        Message: row.message ?? "",
      })),
    )}
  </table>
</body>
</html>`;

  downloadBlob(filename, new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" }));
};

const ReportsPage = () => {
  const { api } = useApi();
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("week");
  const [customFrom, setCustomFrom] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() - presetDurationsMs.week)),
  );
  const [customTo, setCustomTo] = useState(() => toDateTimeLocalValue(new Date()));
  const [appliedFrom, setAppliedFrom] = useState(() =>
    new Date(Date.now() - presetDurationsMs.week).toISOString(),
  );
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString());
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [results, setResults] = useState<MonitorResultRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReportsData = useCallback(async (): Promise<ReportsData> => {
    const [summaryRes, resultsRes, incidentsRes, groupsRes] = await Promise.all([
      api.get<ApiResponse<MonitorSummary>>("/monitors/summary"),
      api.get<ApiResponse<ResultsResponse>>("/monitors/results", {
        params: { from: appliedFrom, to: appliedTo, limit: 200 },
      }),
      api.get<ApiResponse<IncidentsResponse>>("/incidents", {
        params: { from: appliedFrom, to: appliedTo, limit: 200 },
      }),
      api.get<ApiResponse<GroupRow[]>>("/groups"),
    ]);

    if (!summaryRes.data.success) throw new Error(summaryRes.data.message);
    if (!resultsRes.data.success) throw new Error(resultsRes.data.message);
    if (!incidentsRes.data.success) throw new Error(incidentsRes.data.message);
    if (!groupsRes.data.success) throw new Error(groupsRes.data.message);

    return {
      summary: summaryRes.data.data,
      results: resultsRes.data.data.items,
      incidents: incidentsRes.data.data.items,
      groups: groupsRes.data.data,
    };
  }, [api, appliedFrom, appliedTo]);

  const applyReportsData = useCallback((data: ReportsData) => {
    setSummary(data.summary);
    setResults(data.results);
    setIncidents(data.incidents);
    setGroups(data.groups);
  }, []);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      applyReportsData(await fetchReportsData());
    } catch {
      toast.error("โหลด reports ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [applyReportsData, fetchReportsData]);

  useEffect(() => {
    let isCurrent = true;

    fetchReportsData()
      .then((data) => {
        if (isCurrent) applyReportsData(data);
      })
      .catch(() => {
        if (isCurrent) toast.error("โหลด reports ไม่สำเร็จ");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [applyReportsData, fetchReportsData]);

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

  const reportSummary = useMemo(() => {
    const responseTimes = results
      .map((result) => result.responseTimeMs)
      .filter((value): value is number => typeof value === "number");
    const up = results.filter((result) => result.status === "UP").length;
    const degraded = results.filter((result) => result.status === "DEGRADED").length;
    const down = results.filter((result) => result.status === "DOWN").length;
    const checks = results.length;

    return {
      checks,
      up,
      degraded,
      down,
      uptime: checks > 0 ? Math.round((up / checks) * 10000) / 100 : null,
      avgResponse:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
          : null,
      openIncidents: incidents.filter((incident) => incident.status === "OPEN").length,
      resolvedIncidents: incidents.filter((incident) => incident.status === "RESOLVED").length,
    };
  }, [incidents, results]);

  const statusChartData = useMemo(() => {
    return [
      { name: "UP", value: reportSummary.up, color: statusColors.UP },
      { name: "DEGRADED", value: reportSummary.degraded, color: statusColors.DEGRADED },
      { name: "DOWN", value: reportSummary.down, color: statusColors.DOWN },
    ].filter((item) => item.value > 0);
  }, [reportSummary]);

  const responseTrendData = useMemo(() => {
    return [...results]
      .reverse()
      .slice(-20)
      .map((result) => ({
        name: formatChartTime(result.checkedAt),
        response: result.responseTimeMs ?? 0,
        status: result.status,
      }));
  }, [results]);

  const monitorRanking = useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        type: MonitorType;
        checks: number;
        up: number;
        degraded: number;
        down: number;
        responseTimes: number[];
        lastStatus: MonitorStatus | null;
      }
    >();

    for (const result of results) {
      const current =
        grouped.get(result.monitor.id) ??
        {
          id: result.monitor.id,
          name: result.monitor.name,
          type: result.monitor.type,
          checks: 0,
          up: 0,
          degraded: 0,
          down: 0,
          responseTimes: [],
          lastStatus: null,
        };

      current.checks += 1;
      current[result.status.toLowerCase() as "up" | "degraded" | "down"] += 1;
      if (typeof result.responseTimeMs === "number") current.responseTimes.push(result.responseTimeMs);
      if (!current.lastStatus) current.lastStatus = result.status;
      grouped.set(result.monitor.id, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        id: item.id,
        monitor: item.name,
        type: item.type,
        checks: item.checks,
        uptime: item.checks > 0 ? Math.round((item.up / item.checks) * 10000) / 100 : null,
        down: item.down,
        degraded: item.degraded,
        avgResponse:
          item.responseTimes.length > 0
            ? Math.round(item.responseTimes.reduce((total, value) => total + value, 0) / item.responseTimes.length)
            : null,
        lastStatus: item.lastStatus,
      }))
      .sort((a, b) => b.down - a.down || b.degraded - a.degraded || (a.uptime ?? 100) - (b.uptime ?? 100))
      .slice(0, 10);
  }, [results]);

  const groupReports = useMemo<GroupReportRow[]>(() => {
    return groups
      .map((group) => {
        const monitorIds = new Set(group.monitors.map((monitor) => monitor.id));
        const groupResults = results.filter((result) => monitorIds.has(result.monitor.id));
        const up = groupResults.filter((result) => result.status === "UP").length;
        const down = groupResults.filter((result) => result.status === "DOWN").length;
        const degraded = groupResults.filter((result) => result.status === "DEGRADED").length;
        const groupIncidents = incidents.filter((incident) => monitorIds.has(incident.monitor.id));
        const responseTimes = groupResults
          .map((result) => result.responseTimeMs)
          .filter((value): value is number => typeof value === "number");

        return {
          id: group.id,
          name: group.name,
          monitorCount: group.monitorCount,
          checks: groupResults.length,
          up,
          down,
          degraded,
          incidents: groupIncidents.length,
          uptime: groupResults.length > 0 ? Math.round((up / groupResults.length) * 10000) / 100 : null,
          avgResponse:
            responseTimes.length > 0
              ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
              : null,
        };
      })
      .sort((a, b) => b.down - a.down || b.incidents - a.incidents || b.checks - a.checks)
      .slice(0, 8);
  }, [groups, incidents, results]);

  const activeRangeLabel = useMemo(() => {
    if (timeRange === "custom") return `${formatDateTime(appliedFrom)} - ${formatDateTime(appliedTo)}`;
    return timeRangeOptions.find((option) => option.value === timeRange)?.label ?? "Week";
  }, [appliedFrom, appliedTo, timeRange]);

  const exportPayload = useMemo<ReportExportPayload>(() => {
    return {
      generatedAt: new Date().toISOString(),
      range: {
        label: activeRangeLabel,
        from: appliedFrom,
        to: appliedTo,
      },
      summary: {
        reportUptime: reportSummary.uptime,
        checks: reportSummary.checks,
        up: reportSummary.up,
        degraded: reportSummary.degraded,
        down: reportSummary.down,
        incidents: incidents.length,
        openIncidents: reportSummary.openIncidents,
        resolvedIncidents: reportSummary.resolvedIncidents,
        avgResponseMs: reportSummary.avgResponse,
        fleetUptime24h: summary?.uptime24h ?? null,
        fleetAvgResponseMs: summary?.avgResponseTimeMs ?? null,
      },
      monitorRanking,
      groupSummary: groupReports,
      incidents: incidents.map((incident) => ({
        id: incident.id,
        monitor: incident.monitor.name,
        type: incident.monitor.type,
        status: incident.status,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
        duration: formatDuration(incident.startedAt, incident.resolvedAt),
        severity: incident.alertRule?.severity ?? null,
        message: incident.message,
      })),
      resultSamples: results.map((result) => ({
        id: result.id,
        monitor: result.monitor.name,
        type: result.monitor.type,
        status: result.status,
        responseTimeMs: result.responseTimeMs,
        checkedAt: result.checkedAt,
        message: result.message,
      })),
    };
  }, [
    activeRangeLabel,
    appliedFrom,
    appliedTo,
    groupReports,
    incidents,
    monitorRanking,
    reportSummary,
    results,
    summary,
  ]);

  const exportRows = useMemo(() => {
    return monitorRanking.map((item) => ({
      monitor: item.monitor,
      type: item.type,
      checks: item.checks,
      uptime: item.uptime ?? "",
      down: item.down,
      degraded: item.degraded,
      avg_response_ms: item.avgResponse ?? "",
      last_status: item.lastStatus ?? "",
    }));
  }, [monitorRanking]);

  const exportDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-700">Overview</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Reports</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              สรุป uptime, incident, response time และ monitor ที่มีความเสี่ยงตามช่วงเวลาที่เลือก
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void loadReports()}
              disabled={isLoading}
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => downloadCsv(`monitor-report-${exportDate}.csv`, exportRows)}
              disabled={exportRows.length === 0}
            >
              Export CSV
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => downloadJson(`monitor-report-${exportDate}.json`, exportPayload)}
              disabled={results.length === 0 && incidents.length === 0}
            >
              Export JSON
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => downloadExcel(`monitor-report-${exportDate}.xls`, exportPayload)}
              disabled={results.length === 0 && incidents.length === 0}
            >
              Export Excel
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Report window</h2>
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

            {timeRange === "custom" ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
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
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="datetime-local"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
                <button
                  className="rounded-md border border-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                  type="button"
                  onClick={handleApplyCustomRange}
                >
                  Apply
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {isLoading ? (
          <ReportsSkeleton />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Report uptime" value={formatPercent(reportSummary.uptime)} detail={`${reportSummary.checks} checks in range`} tone="emerald" />
              <SummaryCard label="Down checks" value={reportSummary.down} detail={`${reportSummary.degraded} degraded checks`} tone={reportSummary.down > 0 ? "rose" : "slate"} />
              <SummaryCard label="Incidents" value={incidents.length} detail={`${reportSummary.openIncidents} open, ${reportSummary.resolvedIncidents} resolved`} tone={reportSummary.openIncidents > 0 ? "rose" : "cyan"} />
              <SummaryCard label="Avg response" value={formatResponseTime(reportSummary.avgResponse)} detail={`24h fleet avg ${formatResponseTime(summary?.avgResponseTimeMs)}`} tone="cyan" />
              <SummaryCard label="Fleet uptime 24h" value={formatPercent(summary?.uptime24h)} detail={`${summary?.total ?? 0} enabled monitors`} tone="slate" />
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <Panel title="Status mix" description="Result distribution in the selected window">
                <div className="grid gap-4 p-5 sm:grid-cols-[180px_1fr] sm:items-center">
                  <div className="h-44">
                    {statusChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusChartData} dataKey="value" innerRadius={48} outerRadius={76} paddingAngle={2} stroke="none">
                            {statusChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState compact title="No checks" message="No results found in this report window." />
                    )}
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "UP", value: reportSummary.up, className: "bg-emerald-500" },
                      { label: "DEGRADED", value: reportSummary.degraded, className: "bg-amber-500" },
                      { label: "DOWN", value: reportSummary.down, className: "bg-rose-500" },
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

              <Panel title="Response trend" description="Latest response samples in the report window">
                <div className="h-64 p-5">
                  {responseTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={responseTrendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar dataKey="response" radius={[4, 4, 0, 0]}>
                          {responseTrendData.map((entry, index) => (
                            <Cell key={`${entry.name}-${index}`} fill={statusColors[entry.status]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState compact title="No response data" message="Response time will appear once checks exist." />
                  )}
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Panel
                title="Monitor reliability ranking"
                description="Sorted by down checks, degraded checks, and uptime"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/results">View results</Link>}
              >
                {monitorRanking.length === 0 ? (
                  <EmptyState title="No monitor data" message="No monitor checks found in this report window." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Monitor</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Uptime</th>
                          <th className="px-4 py-3">Down</th>
                          <th className="px-4 py-3">Avg response</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monitorRanking.map((item) => (
                          <tr className="transition hover:bg-slate-50" key={item.id}>
                            <td className="px-4 py-3">
                              <Link className="font-medium text-cyan-700 underline-offset-2 hover:text-cyan-900 hover:underline" to={`/monitors/${item.id}`}>
                                {item.monitor}
                              </Link>
                              <p className="text-xs text-slate-500">{item.type} · {item.checks} checks</p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {item.lastStatus ? <StatusBadge status={item.lastStatus} /> : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatPercent(item.uptime)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-rose-700">{item.down}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatResponseTime(item.avgResponse)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel
                title="Incident report"
                description="Recent incidents within the report window"
                action={<Link className="text-sm font-semibold text-cyan-700" to="/incidents">View incidents</Link>}
              >
                {incidents.length === 0 ? (
                  <EmptyState title="No incidents" message="No incidents were found in this report window." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {incidents.slice(0, 8).map((incident) => (
                      <Link className="block px-5 py-4 transition hover:bg-slate-50" key={incident.id} to={`/monitors/${incident.monitor.id}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-950">{incident.monitor.name}</p>
                          <StatusBadge status={incident.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(incident.startedAt)} · {formatDuration(incident.startedAt, incident.resolvedAt)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{incident.message ?? "Incident recorded"}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel title="Group summary" description="Report metrics grouped by monitor group">
              {groupReports.length === 0 ? (
                <EmptyState title="No group report" message="Create monitor groups or run checks to populate this section." />
              ) : (
                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                  {groupReports.map((group) => (
                    <Link className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-cyan-200 hover:bg-cyan-50/30" key={group.id} to={`/groups/${group.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{group.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{group.monitorCount} monitors · {group.checks} checks</p>
                        </div>
                        <span className="text-lg font-semibold text-slate-950">{formatPercent(group.uptime)}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${group.uptime ?? 0}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {group.down} down · {group.degraded} degraded · {group.incidents} incidents
                      </p>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
          Live
        </span>
      </div>
      <p className="mt-2 truncate text-sm text-slate-500">{detail}</p>
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
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: MonitorStatus | IncidentStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusBadgeStyles[status]}`}>
      {status}
    </span>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[...Array(5)].map((_, index) => (
          <div className="h-28 animate-pulse rounded-lg bg-slate-200/70" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg bg-slate-200/70" />
        <div className="h-80 animate-pulse rounded-lg bg-slate-200/70" />
      </div>
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

export default ReportsPage;
