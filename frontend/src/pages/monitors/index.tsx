import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
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

type MonitorResult = {
  id: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  checkedAt: string;
};

type MonitorRow = {
  id: string;
  name: string;
  type: MonitorType;
  config: Record<string, unknown>;
  interval: number;
  enabled: boolean;
  activeWindowEnabled: boolean;
  activeWindowDays: number[] | null;
  activeWindowFrom: string | null;
  activeWindowTo: string | null;
  activeWindowTimezone: string | null;
  latestResult: MonitorResult | null;
  results?: MonitorResult[];
  lastDownAt: string | null;
  downCount24h: number;
  checkCount24h: number;
  uptime24h: number | null;
  activeIncident: unknown | null;
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

type OpenMenuState = {
  id: string;
  top: number;
  left: number;
  direction: "up" | "down";
};

const statusStyles: Record<MonitorStatus | "PENDING" | "DISABLED", string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING: "bg-slate-100 text-slate-600 ring-slate-400/30",
  DISABLED: "bg-slate-100 text-slate-500 ring-slate-300",
};

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

const getTarget = (monitor: MonitorRow) => {
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

const getOpenUrl = (monitor: MonitorRow) => {
  const config = monitor.config;

  if (typeof config.url === "string") return config.url;
  if (typeof config.portainerUrl === "string") return config.portainerUrl;

  return null;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const formatResponseTime = (value: number | null | undefined) => {
  return typeof value === "number" ? `${value} ms` : "-";
};

const toConfigText = (config: Record<string, unknown>) => {
  return JSON.stringify(config, null, 2);
};

const MonitorsPage = () => {
  const { api } = useApi();
  const { t } = useTranslation();
  const { user } = useSession();
  const isAdmin = isAdminUser(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupFilter, setGroupFilter] = useState<"ALL" | string>(() => {
    const groupId = searchParams.get("groupId")?.trim();
    return groupId ? groupId : "ALL";
  });
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
  const [editingMonitor, setEditingMonitor] = useState<MonitorRow | null>(null);
  const [deletingMonitor, setDeletingMonitor] = useState<MonitorRow | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  const fetchMonitors = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await api.get<ApiResponse<MonitorRow[]>>("/monitors", {
        params: {
          groupId: groupFilter === "ALL" ? undefined : groupFilter,
        },
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setMonitors(response.data.data);
    } catch {
      toast.error(t("monitors.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [api, groupFilter, t]);

  useEffect(() => {
    void fetchMonitors();
  }, [fetchMonitors]);

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

  const summary = useMemo(() => {
    const latestStatuses = monitors.map((monitor) => monitor.latestResult?.status ?? "PENDING");

    return [
      { label: t("monitors.summaryTotal"), value: monitors.length, className: "text-slate-950" },
      {
        label: t("monitors.summaryUp"),
        value: latestStatuses.filter((status) => status === "UP").length,
        className: "text-emerald-600",
      },
      {
        label: t("monitors.summaryDegraded"),
        value: latestStatuses.filter((status) => status === "DEGRADED").length,
        className: "text-amber-600",
      },
      {
        label: t("monitors.summaryDown"),
        value: latestStatuses.filter((status) => status === "DOWN").length,
        className: "text-rose-600",
      },
    ];
  }, [monitors, t]);

  const handleCheckNow = async (monitor: MonitorRow) => {
    setOpenMenu(null);
    setBusyId(monitor.id);

    try {
      const response = await api.post<ApiResponse<MonitorResult | null>>(`/monitors/${monitor.id}/check`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      if (response.data.data === null) {
        toast.info("Skipped because monitor is outside active window");
      } else {
        toast.success(t("monitors.checkSuccess", { name: monitor.name }));
      }
      await fetchMonitors();
    } catch {
      toast.error(t("monitors.checkError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleEnabled = async (monitor: MonitorRow) => {
    setOpenMenu(null);
    setBusyId(monitor.id);

    try {
      const response = await api.patch<ApiResponse<MonitorRow>>(`/monitors/${monitor.id}`, {
        enabled: !monitor.enabled,
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(monitor.enabled ? t("monitors.disableSuccess") : t("monitors.enableSuccess"));
      await fetchMonitors();
    } catch {
      toast.error(t("monitors.toggleError"));
    } finally {
      setBusyId(null);
    }
  };

  const openEditModal = (monitor: MonitorRow) => {
    setOpenMenu(null);
    setEditingMonitor(monitor);
    setEditForm({
      name: monitor.name,
      type: monitor.type,
      interval: String(monitor.interval),
      enabled: monitor.enabled,
      activeWindowEnabled: monitor.activeWindowEnabled,
      activeWindowDays: Array.isArray(monitor.activeWindowDays)
        ? monitor.activeWindowDays
        : [1, 2, 3, 4, 5],
      activeWindowFrom: monitor.activeWindowFrom ?? "08:00",
      activeWindowTo: monitor.activeWindowTo ?? "17:00",
      activeWindowTimezone: monitor.activeWindowTimezone ?? "Asia/Bangkok",
      configText: toConfigText(monitor.config),
    });
  };

  const toggleEditActiveWindowDay = (day: number) => {
    setEditForm((current) => {
      const days = current.activeWindowDays.includes(day)
        ? current.activeWindowDays.filter((item) => item !== day)
        : [...current.activeWindowDays, day].sort((a, b) => a - b);
      return { ...current, activeWindowDays: days };
    });
  };

  const handleUpdateMonitor = async () => {
    if (!editingMonitor) return;

    const interval = Number(editForm.interval);

    if (!editForm.name.trim()) {
      toast.error(t("monitors.validationName"));
      return;
    }

    if (!Number.isFinite(interval) || interval < 10) {
      toast.error(t("monitors.validationInterval"));
      return;
    }

    let config: Record<string, unknown>;

    try {
      const parsed = JSON.parse(editForm.configText) as unknown;

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error(t("monitors.validationConfigObject"));
        return;
      }

      config = parsed as Record<string, unknown>;
    } catch {
      toast.error(t("monitors.validationConfigJson"));
      return;
    }

    setBusyId(editingMonitor.id);

    try {
      const response = await api.patch<ApiResponse<MonitorRow>>(`/monitors/${editingMonitor.id}`, {
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
      });

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("monitors.updateSuccess"));
      setEditingMonitor(null);
      await fetchMonitors();
    } catch {
      toast.error(t("monitors.updateError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteMonitor = async () => {
    if (!deletingMonitor) return;

    setOpenMenu(null);
    setBusyId(deletingMonitor.id);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(
        `/monitors/${deletingMonitor.id}`,
      );

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("monitors.deleteSuccess"));
      setDeletingMonitor(null);
      await fetchMonitors();
    } catch {
      toast.error(t("monitors.deleteError"));
    } finally {
      setBusyId(null);
    }
  };

  const toggleMenu = (monitorId: string) => {
    if (openMenu?.id === monitorId) {
      setOpenMenu(null);
      return;
    }

    const button = menuButtonRefs.current[monitorId];
    const rect = button?.getBoundingClientRect();
    const menuHeight = 170;
    const menuWidth = 176;
    const spacing = 8;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - (rect?.bottom ?? 0);
    const spaceAbove = rect?.top ?? 0;
    const shouldOpenUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    if (!rect) return;

    const top = shouldOpenUpward ? rect.top - spacing : rect.bottom + spacing;
    const unclampedLeft = rect.right - menuWidth;
    const left = Math.min(Math.max(unclampedLeft, 8), viewportWidth - menuWidth - 8);

    setOpenMenu({
      id: monitorId,
      top,
      left,
      direction: shouldOpenUpward ? "up" : "down",
    });
  };

  useEffect(() => {
    if (!openMenu) return;

    const handleWindowChange = () => {
      setOpenMenu(null);
    };

    window.addEventListener("scroll", handleWindowChange, true);
    window.addEventListener("resize", handleWindowChange);

    return () => {
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [openMenu]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("monitors.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("monitors.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("monitors.description")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchMonitors()}
            disabled={isLoading}
          >
            {t("common.refresh")}
          </button>
          {isAdmin ? (
            <Link
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              to="/monitors/new"
            >
              {t("monitors.addMonitor")}
            </Link>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4" key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.className}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t("monitors.group")}</span>
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
          <p className="text-sm text-slate-500">
            {t("monitors.groupFilterHint")}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">{t("monitors.inventoryTitle")}</h2>
          <p className="text-xs text-slate-500">
            {isLoading ? t("common.loading") : t("monitors.countMonitors", { count: monitors.length })}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("monitors.colName")}</th>
                <th className="px-4 py-3">{t("monitors.colTarget")}</th>
                <th className="px-4 py-3">{t("monitors.colStatus")}</th>
                <th className="px-4 py-3">{t("monitors.colResponse")}</th>
                <th className="px-4 py-3">{t("monitors.colLastChecked")}</th>
                <th className="px-4 py-3">{t("monitors.colLastDown")}</th>
                <th className="px-4 py-3">{t("monitors.colUptime")}</th>
                <th className="px-4 py-3 text-right">{t("monitors.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!isLoading && monitors.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={8}>
                    {t("monitors.noMonitors")}
                  </td>
                </tr>
              ) : null}

              {monitors.map((monitor) => {
                const latestStatus = monitor.enabled
                  ? monitor.latestResult?.status ?? "PENDING"
                  : "DISABLED";
                const latestResult = monitor.latestResult ?? monitor.results?.[0] ?? null;
                const isBusy = busyId === monitor.id;
                const openUrl = getOpenUrl(monitor);
                const target = getTarget(monitor);

                return (
                  <tr className="transition hover:bg-slate-50" key={monitor.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        className="font-medium text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                        to={`/monitors/${monitor.id}`}
                      >
                        {monitor.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {monitor.type} · {t("monitors.intervalEvery", { interval: monitor.interval })}
                      </div>
                      {monitor.activeWindowEnabled ? (
                        <div className="mt-1">
                          <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-600/20">
                            {t("activeWindow.badge")}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {openUrl ? (
                        <a
                          className="text-cyan-700 underline-offset-2 transition hover:text-cyan-900 hover:underline"
                          href={openUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {target}
                        </a>
                      ) : (
                        target
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[latestStatus]}`}
                      >
                        {latestStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatResponseTime(latestResult?.responseTimeMs)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(latestResult?.checkedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div>{formatDateTime(monitor.lastDownAt)}</div>
                      {monitor.downCount24h > 0 ? (
                        <div className="text-xs text-rose-600">
                          {t("monitors.downPer24h", { count: monitor.downCount24h })}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {monitor.uptime24h === null ? "-" : `${monitor.uptime24h}%`}
                      {monitor.checkCount24h > 0 ? (
                        <div className="text-xs text-slate-400">
                          {t("monitors.checksCount", { count: monitor.checkCount24h })}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {openUrl ? (
                          <a
                            className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                            href={openUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {t("common.open")}
                          </a>
                        ) : null}
                        <Link
                          className="rounded-md border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
                          to={`/monitors/${monitor.id}`}
                        >
                          {t("common.view")}
                        </Link>
                        {isAdmin ? (
                          <div className="relative">
                            <button
                              aria-expanded={openMenu?.id === monitor.id}
                              aria-label={`More actions for ${monitor.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              type="button"
                              ref={(element) => {
                                menuButtonRefs.current[monitor.id] = element;
                              }}
                              onClick={() => toggleMenu(monitor.id)}
                              disabled={isBusy}
                            >
                              <span className="text-lg leading-none">⋮</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && editingMonitor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("monitors.editTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{editingMonitor.name}</p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("common.name")}</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="text"
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
                    type="number"
                    min={10}
                    value={editForm.interval}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, interval: event.target.value }))
                    }
                  />
                </label>

                <label className="flex items-center gap-3 sm:col-span-2">
                  <input
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    type="checkbox"
                    checked={editForm.enabled}
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
                              setEditForm((current) => ({ ...current, activeWindowFrom: event.target.value }))
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
                              setEditForm((current) => ({ ...current, activeWindowTo: event.target.value }))
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

                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">{t("monitors.configJson")}</span>
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
                onClick={() => setEditingMonitor(null)}
                disabled={busyId === editingMonitor.id}
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleUpdateMonitor()}
                disabled={busyId === editingMonitor.id}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && deletingMonitor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("monitors.deleteTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("monitors.deleteDesc")}
              </p>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-600">
                {t("monitors.deleteConfirm", { name: deletingMonitor.name })}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setDeletingMonitor(null)}
                disabled={busyId === deletingMonitor.id}
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDeleteMonitor()}
                disabled={busyId === deletingMonitor.id}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && openMenu ? (
        <>
          <button
            aria-label="Close actions menu"
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            type="button"
            onClick={() => setOpenMenu(null)}
          />
          <div
            className={`fixed z-40 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg transition-all duration-200 ${
              openMenu.direction === "up"
                ? "-translate-y-full origin-bottom-right"
                : "origin-top-right"
            }`}
            style={{ left: openMenu.left, top: openMenu.top }}
          >
            {(() => {
              const activeMonitor = monitors.find((monitor) => monitor.id === openMenu.id);
              const isMenuBusy = busyId === openMenu.id;

              if (!activeMonitor) return null;

              return (
                <>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void handleCheckNow(activeMonitor)}
                    disabled={isMenuBusy || !activeMonitor.enabled}
                  >
                    {t("monitors.checkNow")}
                  </button>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void handleToggleEnabled(activeMonitor)}
                    disabled={isMenuBusy}
                  >
                    {activeMonitor.enabled ? t("common.disable") : t("common.enable")}
                  </button>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => openEditModal(activeMonitor)}
                    disabled={isMenuBusy}
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setDeletingMonitor(activeMonitor);
                    }}
                    disabled={isMenuBusy}
                  >
                    {t("common.delete")}
                  </button>
                </>
              );
            })()}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default MonitorsPage;
