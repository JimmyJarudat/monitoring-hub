import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
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

type MapStatus = MonitorStatus | "PENDING" | "DISABLED";
type FocusFilter = "ALL" | "ISSUES" | "DEVICES";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message: string };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type MonitorResult = {
  id?: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message?: string | null;
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

type GroupMonitor = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  interval: number;
  config: Record<string, unknown>;
  latestResult: MonitorResult | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  monitorCount: number;
  monitors: GroupMonitor[];
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
    interval: number;
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

type StatusMapData = {
  summary: MonitorSummary;
  monitors: MonitorRow[];
  groups: GroupRow[];
  incidents: IncidentRow[];
};

type MapNode = {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  enabled: boolean;
  status: MapStatus;
  responseTimeMs: number | null;
  checkedAt: string | null;
  uptime24h: number | null;
  downCount24h: number;
  checkCount24h: number;
  activeIncident: ActiveIncident | null;
};

type MapGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  nodes: MapNode[];
  health: number | null;
  counts: Record<MapStatus, number>;
};

const statusStyles: Record<MapStatus, string> = {
  UP: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DOWN: "border-rose-200 bg-rose-50 text-rose-700",
  DEGRADED: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING: "border-slate-200 bg-slate-100 text-slate-600",
  DISABLED: "border-slate-200 bg-slate-50 text-slate-400",
};

const statusDotStyles: Record<MapStatus, string> = {
  UP: "bg-emerald-500",
  DOWN: "bg-rose-500",
  DEGRADED: "bg-amber-500",
  PENDING: "bg-slate-400",
  DISABLED: "bg-slate-300",
};

const nodeBorderStyles: Record<MapStatus, string> = {
  UP: "border-emerald-200 hover:border-emerald-300",
  DOWN: "border-rose-300 hover:border-rose-400",
  DEGRADED: "border-amber-300 hover:border-amber-400",
  PENDING: "border-slate-200 hover:border-slate-300",
  DISABLED: "border-slate-200 opacity-70 hover:border-slate-300",
};

const focusOptions: Array<{ labelKey: string; value: FocusFilter }> = [
  { labelKey: "statusMap.focusAll", value: "ALL" },
  { labelKey: "statusMap.focusIssues", value: "ISSUES" },
  { labelKey: "statusMap.focusDevices", value: "DEVICES" },
];

const getMonitorStatus = (monitor: { enabled: boolean; latestResult: MonitorResult | null }): MapStatus => {
  if (!monitor.enabled) return "DISABLED";
  return monitor.latestResult?.status ?? "PENDING";
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

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
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

const toNode = (monitor: MonitorRow | GroupMonitor, incident?: ActiveIncident | null): MapNode => {
  const status = getMonitorStatus(monitor);

  return {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    target: getTarget(monitor.config),
    enabled: monitor.enabled,
    status,
    responseTimeMs: monitor.latestResult?.responseTimeMs ?? null,
    checkedAt: monitor.latestResult?.checkedAt ?? null,
    uptime24h: "uptime24h" in monitor ? monitor.uptime24h : null,
    downCount24h: "downCount24h" in monitor ? monitor.downCount24h : 0,
    checkCount24h: "checkCount24h" in monitor ? monitor.checkCount24h : 0,
    activeIncident: incident ?? ("activeIncident" in monitor ? monitor.activeIncident : null),
  };
};

const getGroupCounts = (nodes: MapNode[]) => {
  return nodes.reduce(
    (counts, node) => {
      counts[node.status] += 1;
      return counts;
    },
    { UP: 0, DOWN: 0, DEGRADED: 0, PENDING: 0, DISABLED: 0 } satisfies Record<MapStatus, number>,
  );
};

const getGroupHealth = (nodes: MapNode[]) => {
  const enabled = nodes.filter((node) => node.status !== "DISABLED");
  if (enabled.length === 0) return null;
  return Math.round((enabled.filter((node) => node.status === "UP").length / enabled.length) * 100);
};

const isDeviceType = (type: MonitorType) => type === "SNMP" || type === "SYSTEM";
const isIssueStatus = (status: MapStatus) => status === "DOWN" || status === "DEGRADED";

const StatusMapPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [focus, setFocus] = useState<FocusFilter>("ALL");
  const [selectedGroupId, setSelectedGroupId] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatusMapData = useCallback(async (): Promise<StatusMapData> => {
    const [summaryRes, monitorsRes, groupsRes, incidentsRes] = await Promise.all([
      api.get<ApiResponse<MonitorSummary>>("/monitors/summary"),
      api.get<ApiResponse<MonitorRow[]>>("/monitors"),
      api.get<ApiResponse<GroupRow[]>>("/groups"),
      api.get<ApiResponse<IncidentsResponse>>("/incidents", {
        params: { status: "OPEN", limit: 20 },
      }),
    ]);

    if (!summaryRes.data.success) throw new Error(summaryRes.data.message);
    if (!monitorsRes.data.success) throw new Error(monitorsRes.data.message);
    if (!groupsRes.data.success) throw new Error(groupsRes.data.message);
    if (!incidentsRes.data.success) throw new Error(incidentsRes.data.message);

    return {
      summary: summaryRes.data.data,
      monitors: monitorsRes.data.data,
      groups: groupsRes.data.data,
      incidents: incidentsRes.data.data.items,
    };
  }, [api]);

  const applyStatusMapData = useCallback((data: StatusMapData) => {
    setSummary(data.summary);
    setMonitors(data.monitors);
    setGroups(data.groups);
    setIncidents(data.incidents);
  }, []);

  const loadStatusMap = useCallback(async () => {
    setIsLoading(true);
    try {
      applyStatusMapData(await fetchStatusMapData());
    } catch {
      toast.error(t("statusMap.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [applyStatusMapData, fetchStatusMapData]);

  useEffect(() => {
    let isCurrent = true;

    fetchStatusMapData()
      .then((data) => {
        if (isCurrent) applyStatusMapData(data);
      })
      .catch(() => {
        if (isCurrent) toast.error(t("statusMap.loadError"));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [applyStatusMapData, fetchStatusMapData]);

  const incidentByMonitorId = useMemo(() => {
    return incidents.reduce<Record<string, ActiveIncident>>((acc, incident) => {
      acc[incident.monitor.id] = {
        id: incident.id,
        status: incident.status,
        message: incident.message,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
      };
      return acc;
    }, {});
  }, [incidents]);

  const mapGroups = useMemo<MapGroup[]>(() => {
    const monitorById = new Map(monitors.map((monitor) => [monitor.id, monitor]));
    const groupedIds = new Set<string>();

    const lanes = groups.map((group) => {
      const nodes = group.monitors.map((monitor) => {
        groupedIds.add(monitor.id);
        return toNode(monitorById.get(monitor.id) ?? monitor, incidentByMonitorId[monitor.id]);
      });

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        nodes,
        health: getGroupHealth(nodes),
        counts: getGroupCounts(nodes),
      };
    });

    const ungroupedNodes = monitors
      .filter((monitor) => !groupedIds.has(monitor.id))
      .map((monitor) => toNode(monitor, incidentByMonitorId[monitor.id]));

    if (ungroupedNodes.length > 0) {
      lanes.push({
        id: "UNGROUPED",
        name: t("statusMap.ungrouped"),
        description: t("statusMap.ungroupedDescription"),
        color: null,
        nodes: ungroupedNodes,
        health: getGroupHealth(ungroupedNodes),
        counts: getGroupCounts(ungroupedNodes),
      });
    }

    return lanes.sort((a, b) => {
      const issueDelta = b.counts.DOWN + b.counts.DEGRADED - (a.counts.DOWN + a.counts.DEGRADED);
      return issueDelta || b.nodes.length - a.nodes.length || a.name.localeCompare(b.name);
    });
  }, [groups, incidentByMonitorId, monitors]);

  const filteredGroups = useMemo(() => {
    return mapGroups
      .filter((group) => selectedGroupId === "ALL" || group.id === selectedGroupId)
      .map((group) => {
        const nodes = group.nodes.filter((node) => {
          if (focus === "ISSUES") return isIssueStatus(node.status) || node.activeIncident;
          if (focus === "DEVICES") return isDeviceType(node.type);
          return true;
        });

        return {
          ...group,
          nodes,
          health: getGroupHealth(nodes),
          counts: getGroupCounts(nodes),
        };
      })
      .filter((group) => group.nodes.length > 0);
  }, [focus, mapGroups, selectedGroupId]);

  const totals = useMemo(() => {
    const nodes = mapGroups.flatMap((group) => group.nodes);
    const counts = getGroupCounts(nodes);

    return {
      nodes,
      counts,
      health: getGroupHealth(nodes),
      issues: counts.DOWN + counts.DEGRADED,
      devices: nodes.filter((node) => isDeviceType(node.type)).length,
    };
  }, [mapGroups]);

  const criticalNodes = useMemo(() => {
    return totals.nodes
      .filter((node) => isIssueStatus(node.status) || node.activeIncident)
      .sort((a, b) => {
        const score = (node: MapNode) =>
          node.status === "DOWN" ? 0 : node.status === "DEGRADED" ? 1 : node.activeIncident ? 2 : 3;
        return score(a) - score(b) || b.downCount24h - a.downCount24h;
      })
      .slice(0, 8);
  }, [totals.nodes]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-700">{t("statusMap.subtitle")}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("statusMap.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              {t("statusMap.description")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void loadStatusMap()}
              disabled={isLoading}
            >
              {isLoading ? t("dashboard.refreshing") : t("common.refresh")}
            </button>
            <Link
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              to="/monitors"
            >
              {t("statusMap.monitorInventory")}
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label={t("statusMap.mapHealth")} value={formatPercent(totals.health)} detail={t("statusMap.healthyNodes", { count: totals.counts.UP })} tone="emerald" />
          <SummaryCard label={t("statusMap.issues")} value={totals.issues} detail={t("statusMap.issueDetail", { down: totals.counts.DOWN, degraded: totals.counts.DEGRADED })} tone={totals.issues > 0 ? "rose" : "emerald"} />
          <SummaryCard label={t("statusMap.openIncidents")} value={summary?.openIncidents ?? incidents.length} detail={t("statusMap.loadedQueue", { count: incidents.length })} tone={(summary?.openIncidents ?? incidents.length) > 0 ? "rose" : "slate"} />
          <SummaryCard label={t("statusMap.devices")} value={totals.devices} detail={t("statusMap.devicesDetail")} tone="cyan" />
          <SummaryCard label={t("statusMap.uptime24h")} value={formatPercent(summary?.uptime24h)} detail={t("statusMap.avgResponse", { value: formatResponseTime(summary?.avgResponseTimeMs) })} tone="slate" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[1fr_260px_340px] xl:items-end">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{t("statusMap.controlsTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("statusMap.controlsDescription")}
              </p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">{t("devices.group")}</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
              >
                <option value="ALL">{t("devices.allGroups")}</option>
                {mapGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-sm font-medium text-slate-700">{t("statusMap.focus")}</span>
              <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-md border border-slate-300 bg-white">
                {focusOptions.map((option) => {
                  const isActive = focus === option.value;

                  return (
                    <button
                      key={option.value}
                      className={[
                        "px-3 py-2 text-sm font-semibold transition",
                        isActive ? "bg-cyan-50 text-cyan-700" : "text-slate-600 hover:bg-slate-50",
                      ].join(" ")}
                      type="button"
                      onClick={() => setFocus(option.value)}
                    >
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {isLoading ? (
          <StatusMapSkeleton />
        ) : (
          <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">{t("statusMap.topologyLanes")}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("statusMap.showingNodes", { nodes: filteredGroups.reduce((total, group) => total + group.nodes.length, 0), lanes: filteredGroups.length })}
                    </p>
                  </div>
                  <StatusLegend />
                </div>

                {filteredGroups.length === 0 ? (
                  <EmptyState title={t("statusMap.noNodes")} message={t("statusMap.noNodesMessage")} />
                ) : (
                  <div className="space-y-5 p-5">
                    {filteredGroups.map((group) => (
                      <MapLane key={group.id} group={group} locale={locale} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4">
              <Panel title={t("statusMap.priorityQueue")} description={t("statusMap.priorityDescription")}>
                {criticalNodes.length === 0 ? (
                  <EmptyState title={t("statusMap.noPriority")} message={t("statusMap.noPriorityMessage")} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {criticalNodes.map((node) => (
                      <Link
                        key={node.id}
                        className="block px-5 py-4 transition hover:bg-slate-50"
                        to={`/monitors/${node.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-950">{node.name}</p>
                          <StatusBadge status={node.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {node.type} · {node.target}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {t("statusMap.nodeHealthLine", { down: node.downCount24h, checks: node.checkCount24h, uptime: formatPercent(node.uptime24h) })}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t("statusMap.openIncidents")} description={t("statusMap.openIncidentsDescription")}>
                {incidents.length === 0 ? (
                  <EmptyState title={t("dashboard.noOpenIncidentsTitle")} message={t("statusMap.incidentQueueClear")} />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {incidents.slice(0, 8).map((incident) => (
                      <Link
                        key={incident.id}
                        className="block px-5 py-4 transition hover:bg-slate-50"
                        to={`/monitors/${incident.monitor.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-950">{incident.monitor.name}</p>
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            {formatDuration(incident.startedAt)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {incident.message ?? t("dashboard.incidentIsOpen")}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </aside>
          </section>
        )}
      </div>
    </div>
  );
};

function MapLane({ group, locale }: { group: MapGroup; locale: string }) {
  const { t } = useTranslation();
  const issueCount = group.counts.DOWN + group.counts.DEGRADED;
  const laneTone =
    group.counts.DOWN > 0
      ? "border-rose-200 bg-rose-50/40"
      : group.counts.DEGRADED > 0
        ? "border-amber-200 bg-amber-50/40"
        : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-lg border ${laneTone}`}>
      <div className="flex flex-col gap-3 border-b border-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: group.color ?? "#06b6d4" }}
            />
            <Link
              className="truncate text-sm font-semibold text-slate-950 underline-offset-2 hover:text-cyan-800 hover:underline"
              to={group.id === "UNGROUPED" ? "/monitors" : `/groups/${group.id}`}
            >
              {group.name}
            </Link>
            {issueCount > 0 ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                {t("statusMap.issueCount", { count: issueCount })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{group.description ?? t("statusMap.monitorLane")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-slate-950">
            {group.health === null ? "-" : `${group.health}%`}
          </span>
          <div className="w-36">
            <HealthBar counts={group.counts} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
        {group.nodes.map((node) => (
          <MapNodeCard key={node.id} node={node} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function MapNodeCard({ node, locale }: { node: MapNode; locale: string }) {
  const { t } = useTranslation();
  return (
    <Link
      className={[
        "block rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        nodeBorderStyles[node.status],
      ].join(" ")}
      to={`/monitors/${node.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{node.name}</p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {node.type} · {node.enabled ? t("statusMap.active") : t("common.disabled")}
          </p>
        </div>
        <StatusBadge status={node.status} />
      </div>

      <p className="mt-3 truncate text-xs text-slate-500">{node.target}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <NodeMetric label={t("statusMap.response")} value={formatResponseTime(node.responseTimeMs)} />
        <NodeMetric label={t("statusMap.uptime")} value={formatPercent(node.uptime24h)} />
        <NodeMetric label={t("statusMap.down24h")} value={node.downCount24h} />
      </div>

      {node.activeIncident ? (
        <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-2 text-xs font-medium text-rose-700">
          {t("statusMap.incidentOpenFor", { duration: formatDuration(node.activeIncident.startedAt) })}
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-400">{t("statusMap.lastCheck", { time: formatDateTime(node.checkedAt, locale) })}</p>
      )}
    </Link>
  );
}

function NodeMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5">
      <p className="truncate text-[11px] text-slate-400">{label}</p>
      <p className="truncate font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MapStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[status]}`} />
      {status}
    </span>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {(["UP", "DEGRADED", "DOWN", "PENDING", "DISABLED"] as MapStatus[]).map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  );
}

function HealthBar({ counts }: { counts: Record<MapStatus, number> }) {
  const total = counts.UP + counts.DEGRADED + counts.DOWN + counts.PENDING + counts.DISABLED;
  const segments = [
    { value: counts.UP, className: "bg-emerald-500" },
    { value: counts.DEGRADED, className: "bg-amber-500" },
    { value: counts.DOWN, className: "bg-rose-500" },
    { value: counts.PENDING, className: "bg-slate-400" },
    { value: counts.DISABLED, className: "bg-slate-300" },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-200">
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
  const { t } = useTranslation();
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
          {t("dashboard.live")}
        </span>
      </div>
      <p className="mt-2 truncate text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatusMapSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="h-[560px] animate-pulse rounded-lg bg-slate-200/70" />
      <div className="space-y-4">
        <div className="h-72 animate-pulse rounded-lg bg-slate-200/70" />
        <div className="h-72 animate-pulse rounded-lg bg-slate-200/70" />
      </div>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
    </div>
  );
}

export default StatusMapPage;
