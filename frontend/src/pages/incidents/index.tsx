import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useSession } from "@/contexts/session.context";
import { useApi } from "@/hooks/useApi";
import { isAdminUser } from "@/utils/permissions";

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
type GroupOption = { id: string; name: string; color?: string | null; monitorCount?: number };

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
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; username: string; email: string } | null;
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

const presetDurationsMs: Record<Exclude<TimeRangePreset, "custom">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const statusStyles: Record<IncidentStatus, string> = {
  OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  ACKNOWLEDGED: "bg-amber-50 text-amber-700 ring-amber-600/20",
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
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  return new Intl.DateTimeFormat(locale, {
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

const typeOptions: Array<{ label: string; value: "ALL" | MonitorType }> = [
  { label: "All types", value: "ALL" },
  { label: "PING", value: "PING" },
  { label: "TCP", value: "TCP" },
  { label: "HTTP", value: "HTTP" },
  { label: "TLS_CERT", value: "TLS_CERT" },
  { label: "DNS", value: "DNS" },
  { label: "SNMP", value: "SNMP" },
  { label: "SYSTEM", value: "SYSTEM" },
  { label: "DOCKER", value: "DOCKER" },
  { label: "DATABASE", value: "DATABASE" },
];

const IncidentsPage = () => {
  const { api, del, patch } = useApi();
  const { t } = useTranslation();
  const { user } = useSession();
  const isAdmin = isAdminUser(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("week");
  const [statusFilter, setStatusFilter] = useState<"ALL" | IncidentStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | MonitorType>("ALL");
  const [groupFilter, setGroupFilter] = useState<"ALL" | string>(() => {
    const groupId = searchParams.get("groupId")?.trim();
    return groupId ? groupId : "ALL";
  });
  const [groups, setGroups] = useState<GroupOption[]>([]);
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
    ACKNOWLEDGED: 0,
    RESOLVED: 0,
  });
  const [page, setPage] = useState(1);

  const timeRangeOptions = useMemo(
    () => [
      { label: t("incidents.rangeDay"), value: "day" as TimeRangePreset },
      { label: t("incidents.rangeWeek"), value: "week" as TimeRangePreset },
      { label: t("incidents.rangeMonth"), value: "month" as TimeRangePreset },
      { label: t("incidents.rangeCustom"), value: "custom" as TimeRangePreset },
    ],
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { label: t("incidents.statusAll"), value: "ALL" as "ALL" | IncidentStatus },
      { label: t("incidents.statusOpen"), value: "OPEN" as IncidentStatus },
      { label: t("incidents.statusAcknowledged"), value: "ACKNOWLEDGED" as IncidentStatus },
      { label: t("incidents.statusResolved"), value: "RESOLVED" as IncidentStatus },
    ],
    [t],
  );

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
            groupId: groupFilter === "ALL" ? undefined : groupFilter,
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
        toast.error(t("incidents.loadError"));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [api, appliedFrom, appliedTo, groupFilter, statusFilter, typeFilter, t],
  );

  useEffect(() => {
    void fetchIncidents(1, "replace");
  }, [fetchIncidents]);

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const response = await api.get<ApiResponse<GroupOption[]>>("/groups");
        if (!response.data.success) {
          toast.error(response.data.message);
          return;
        }
        setGroups(response.data.data);
      } catch {
        toast.error(t("monitors.loadGroupsError"));
      }
    };

    void loadGroups();
  }, [api, t]);

  useEffect(() => {
    const currentValue = searchParams.get("groupId")?.trim() || "ALL";
    if (currentValue === groupFilter) return;

    const next = new URLSearchParams(searchParams);
    if (groupFilter === "ALL") {
      next.delete("groupId");
    } else {
      next.set("groupId", groupFilter);
    }
    setSearchParams(next, { replace: true });
  }, [groupFilter, searchParams, setSearchParams]);

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
      toast.error(t("incidents.validationRange"));
      return;
    }

    if (new Date(from).getTime() > new Date(to).getTime()) {
      toast.error(t("incidents.validationRangeOrder"));
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

      toast.success(
        status === "RESOLVED"
          ? "Incident resolved"
          : status === "ACKNOWLEDGED"
            ? "Incident acknowledged"
            : "Incident reopened",
      );
      await fetchIncidents(1, "replace");
    } catch {
      toast.error(t("incidents.updateError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteIncident = async (incident: IncidentRow) => {
    const confirmed = window.confirm(
      t("incidents.deleteConfirm", { name: incident.monitor.name, time: formatDateTime(incident.startedAt) }),
    );

    if (!confirmed) return;

    setBusyId(incident.id);

    try {
      const response = await del<ApiResponse<{ message: string }>>(`/incidents/${incident.id}`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("incidents.deleteSuccess"));
      await fetchIncidents(1, "replace");
    } catch {
      toast.error(t("incidents.deleteError"));
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    return {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status === "OPEN").length,
      acknowledged: incidents.filter((incident) => incident.status === "ACKNOWLEDGED").length,
      resolved: incidents.filter((incident) => incident.status === "RESOLVED").length,
    };
  }, [incidents]);

  const activeRangeLabel = useMemo(() => {
    if (timeRange === "custom") {
      return `${formatDateTime(appliedFrom)} - ${formatDateTime(appliedTo)}`;
    }
    return timeRangeOptions.find((option) => option.value === timeRange)?.label ?? t("incidents.rangeWeek");
  }, [appliedFrom, appliedTo, timeRange, timeRangeOptions, t]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("incidents.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("incidents.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {t("incidents.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            type="button"
            onClick={() => void fetchIncidents(1, "replace")}
          >
            {t("common.refresh")}
          </button>
          <Link
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            to="/results"
          >
            {t("incidents.viewResults")}
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("incidents.summaryDisplayed"), value: summary.total, tone: "text-slate-950" },
          { label: t("incidents.summaryOpen"), value: summary.open, tone: "text-rose-700" },
          { label: t("incidents.summaryAcknowledged"), value: summary.acknowledged, tone: "text-amber-700" },
          { label: t("incidents.summaryResolved"), value: summary.resolved, tone: "text-emerald-700" },
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
              <h2 className="text-sm font-semibold text-slate-950">{t("incidents.filtersTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("incidents.currentRange")} <span className="font-medium text-slate-700">{activeRangeLabel}</span>
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
              <span className="text-sm font-medium text-slate-700">{t("incidents.filterStatus")}</span>
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
              <span className="text-sm font-medium text-slate-700">{t("incidents.filterType")}</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "ALL" | MonitorType)}
              >
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === "ALL" ? t("incidents.typeAll") : option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">{t("incidents.filterGroup")}</span>
              <select
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
              >
                <option value="ALL">{t("monitors.allGroups")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            {timeRange === "custom" ? (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("incidents.filterFrom")}</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="datetime-local"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("incidents.filterTo")}</span>
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
                      {t("incidents.apply")}
                    </button>
                  </div>
                </label>
              </>
            ) : (
              <div className="lg:col-span-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">{t("incidents.quickSnapshot")}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {t("incidents.pageIncidents")}
                    <span className="ml-2 text-rose-700">OPEN {statusCounts.OPEN}</span>
                    <span className="ml-3 text-amber-700">
                      ACK {statusCounts.ACKNOWLEDGED}
                    </span>
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
            <h2 className="text-sm font-semibold text-slate-950">{t("incidents.queueTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {t("incidents.showingRows", { count: incidents.length, page })}
            </p>
          </div>
          {isLoading ? <p className="text-xs text-slate-400">{t("common.loading")}</p> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("incidents.colStarted")}</th>
                <th className="px-4 py-3">{t("incidents.colMonitor")}</th>
                <th className="px-4 py-3">{t("incidents.colStatus")}</th>
                <th className="px-4 py-3">{t("incidents.colDuration")}</th>
                <th className="px-4 py-3">{t("incidents.colResolved")}</th>
                <th className="px-4 py-3">{t("incidents.colAlertRule")}</th>
                <th className="px-4 py-3">{t("incidents.colMessage")}</th>
                <th className="px-4 py-3 text-right">{t("incidents.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!isLoading && incidents.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={8}>
                    {t("incidents.noIncidents")}
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
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[incident.status]}`}
                      >
                        {t(`incidents.statusLabels.${incident.status}`)}
                      </span>
                      {incident.acknowledgedAt ? (
                        <div className="mt-1 text-xs text-amber-700">
                          {t("incidents.acknowledgedBy", {
                            user: incident.acknowledgedBy?.username ?? "-",
                            time: formatDateTime(incident.acknowledgedAt),
                          })}
                        </div>
                      ) : null}
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
                              {incident.alertRule.enabled ? t("incidents.alertEnabled") : t("incidents.alertDisabled")}
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
                      {isAdmin ? (
                        <div className="flex justify-end gap-2">
                          {incident.status === "OPEN" ? (
                            <>
                              <button
                                className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                                onClick={() => void handleSetIncidentStatus(incident, "ACKNOWLEDGED")}
                                disabled={isBusy}
                              >
                                {t("incidents.acknowledge")}
                              </button>
                              <button
                                className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                                onClick={() => void handleSetIncidentStatus(incident, "RESOLVED")}
                                disabled={isBusy}
                              >
                                {t("incidents.resolve")}
                              </button>
                            </>
                          ) : (
                            <>
                              {incident.status === "ACKNOWLEDGED" ? (
                                <button
                                  className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  type="button"
                                  onClick={() => void handleSetIncidentStatus(incident, "RESOLVED")}
                                  disabled={isBusy}
                                >
                                  {t("incidents.resolve")}
                                </button>
                              ) : null}
                              <button
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                type="button"
                                onClick={() => void handleSetIncidentStatus(incident, "OPEN")}
                                disabled={isBusy}
                              >
                                {t("incidents.reopen")}
                              </button>
                            </>
                          )}

                          <button
                            className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            onClick={() => void handleDeleteIncident(incident)}
                            disabled={isBusy}
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{t("incidents.readOnly")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">
            {t("incidents.footerHint")}
          </p>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchIncidents(page + 1, "append")}
            disabled={!hasMore || isLoading || isLoadingMore}
          >
            {isLoadingMore ? t("common.loading") : hasMore ? t("incidents.loadMore") : t("incidents.noMore")}
          </button>
        </div>
      </section>
    </div>
  );
};

export default IncidentsPage;
