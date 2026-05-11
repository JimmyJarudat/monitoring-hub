import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
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

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type MonitorRow = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  interval: number;
  config: Record<string, unknown>;
  latestResult: {
    status: MonitorStatus;
    checkedAt: string;
    responseTimeMs: number | null;
  } | null;
  activeIncident: {
    id: string;
    status: IncidentStatus;
    message: string | null;
    startedAt: string;
    resolvedAt: string | null;
  } | null;
  checkCount24h: number;
  downCount24h: number;
  uptime24h: number | null;
  avgResponseTimeMs: number | null;
};

type IncidentRow = {
  id: string;
  status: IncidentStatus;
  message: string | null;
  startedAt: string;
  resolvedAt: string | null;
  monitor: {
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
    interval: number;
    config: Record<string, unknown>;
  };
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  monitorCount: number;
  monitors: MonitorRow[];
  incidents: IncidentRow[];
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    devices: number;
    up: number;
    degraded: number;
    down: number;
    pending: number;
    openIncidents: number;
    uptime24h: number | null;
    avgResponseTimeMs: number | null;
  };
};

const statusStyles: Record<MonitorStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const incidentStyles: Record<IncidentStatus, string> = {
  OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  ACKNOWLEDGED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatResponseTime = (value: number | null | undefined) =>
  typeof value === "number" ? `${value} ms` : "-";

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

const formatDuration = (startedAt: string, resolvedAt: string | null) => {
  const start = new Date(startedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const diffMinutes = Math.max(Math.floor((end - start) / 60000), 0);
  const days = Math.floor(diffMinutes / (24 * 60));
  const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const GroupDetailPage = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { api } = useApi();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadGroup = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);

    try {
      const response = await api.get<ApiResponse<GroupDetail>>(`/groups/${id}`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setGroup(response.data.data);
    } catch {
      toast.error(t("groups.detailLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [api, id, t]);

  const locale = i18n.language === "th" ? "th-TH" : "en-US";

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  const topNoisyMonitors = useMemo(() => {
    return [...(group?.monitors ?? [])]
      .sort((a, b) => {
        if (b.downCount24h !== a.downCount24h) return b.downCount24h - a.downCount24h;
        return (b.activeIncident ? 1 : 0) - (a.activeIncident ? 1 : 0);
      })
      .slice(0, 5);
  }, [group]);

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {t("groups.loadingSummary")}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-full bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-950">{t("groups.notFound")}</h1>
          <Link className="mt-4 inline-flex text-sm font-semibold text-cyan-700" to="/groups">
            {t("groups.backToGroups")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: group.color ?? "#22c55e" }}
            />
            <p className="text-sm font-medium text-cyan-700">{t("groups.detailSubtitle")}</p>
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">{group.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {group.description || t("groups.detailDescriptionFallback")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="button"
            onClick={() => void loadGroup()}
          >
            {t("common.refresh")}
          </button>
          <Link
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            to="/groups"
          >
            {t("common.back")}
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("groups.detailSummaryMonitors"), value: group.summary.total, tone: "text-slate-950" },
          { label: t("groups.detailSummaryOpenIncidents"), value: group.summary.openIncidents, tone: "text-rose-700" },
          {
            label: t("groups.detailSummaryUptime"),
            value: group.summary.uptime24h === null ? "-" : `${group.summary.uptime24h}%`,
            tone: "text-emerald-700",
          },
          {
            label: t("groups.detailSummaryAvgResponse"),
            value:
              group.summary.avgResponseTimeMs === null ? "-" : `${group.summary.avgResponseTimeMs} ms`,
            tone: "text-cyan-700",
          },
        ].map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">{t("groups.healthBreakdown")}</h2>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "UP", value: group.summary.up, tone: "text-emerald-700" },
                { label: "DEGRADED", value: group.summary.degraded, tone: "text-amber-700" },
                { label: "DOWN", value: group.summary.down, tone: "text-rose-700" },
                { label: t("groups.statusPending"), value: group.summary.pending, tone: "text-slate-600" },
                { label: t("common.disabled"), value: group.summary.disabled, tone: "text-slate-500" },
                { label: t("groups.summaryDevices"), value: group.summary.devices, tone: "text-cyan-700" },
              ].map((item) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={item.label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">{t("groups.monitorsInGroup")}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("groups.colMonitor")}</th>
                    <th className="px-4 py-3">{t("common.status")}</th>
                    <th className="px-4 py-3">{t("groups.detailSummaryUptime")}</th>
                    <th className="px-4 py-3">{t("groups.detailSummaryAvgResponse")}</th>
                    <th className="px-4 py-3">{t("groups.detailSummaryOpenIncidents")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {group.monitors.map((monitor) => (
                    <tr className="transition hover:bg-slate-50" key={monitor.id}>
                      <td className="px-4 py-3">
                        <Link
                          className="font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                          to={`/monitors/${monitor.id}`}
                        >
                          {monitor.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {monitor.type} · {getTarget(monitor.config)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {monitor.latestResult ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[monitor.latestResult.status]}`}
                          >
                            {monitor.latestResult.status}
                          </span>
                        ) : (
                          <span className="text-slate-400">PENDING</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {monitor.uptime24h === null ? "-" : `${monitor.uptime24h}%`}
                        {monitor.checkCount24h > 0 ? (
                          <div className="text-xs text-slate-400">{t("groups.checksCount", { count: monitor.checkCount24h })}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatResponseTime(monitor.avgResponseTimeMs)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {monitor.activeIncident ? (
                          <div>
                            <div className="text-xs font-semibold text-rose-700">OPEN</div>
                            <div className="truncate text-xs text-slate-500" title={monitor.activeIncident.message ?? undefined}>
                              {monitor.activeIncident.message ?? "-"}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">{t("groups.quickLinks")}</h2>
            <div className="mt-4 grid gap-2">
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                to={`/devices?groupId=${group.id}`}
              >
                {t("groups.linkDevices")}
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                to={`/interfaces?groupId=${group.id}`}
              >
                {t("groups.linkInterfaces")}
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                to={`/monitors?groupId=${group.id}`}
              >
                {t("groups.linkMonitors")}
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                to={`/results?groupId=${group.id}`}
              >
                {t("groups.linkResults")}
              </Link>
              <Link
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                to={`/incidents?groupId=${group.id}`}
              >
                {t("groups.linkIncidents")}
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">{t("groups.topNoisyMonitors")}</h2>
            <div className="mt-4 space-y-3">
              {topNoisyMonitors.length === 0 ? (
                <p className="text-sm text-slate-500">{t("groups.noMonitorsInGroup")}</p>
              ) : null}
              {topNoisyMonitors.map((monitor) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={monitor.id}>
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                      to={`/monitors/${monitor.id}`}
                    >
                      {monitor.name}
                    </Link>
                    <span className="text-xs text-slate-500">{t("groups.downPer24h", { count: monitor.downCount24h })}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {monitor.type} · {getTarget(monitor.config)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">{t("groups.recentIncidents")}</h2>
            <div className="mt-4 space-y-3">
              {group.incidents.length === 0 ? (
                <p className="text-sm text-slate-500">{t("groups.noIncidentsInGroup")}</p>
              ) : null}
              {group.incidents.map((incident) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={incident.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${incidentStyles[incident.status]}`}
                    >
                      {incident.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDuration(incident.startedAt, incident.resolvedAt)}
                    </span>
                  </div>
                  <Link
                    className="mt-3 block font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                    to={`/monitors/${incident.monitor.id}`}
                  >
                    {incident.monitor.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(incident.startedAt, locale)}</p>
                  <p className="mt-2 text-sm text-slate-600">{incident.message ?? "-"}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default GroupDetailPage;
