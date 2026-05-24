import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/contexts/session.context";
import { isAdminUser } from "@/utils/permissions";
import { formatMonitorTypeLabel } from "@/utils/monitorType";

type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "SNMP" | "SYSTEM" | "DOCKER" | "DATABASE";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string };

type MonitorOption = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
};

type GroupOption = {
  id: string;
  name: string;
  color: string | null;
  monitorCount?: number;
};

type MaintenanceWindow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  monitorId: string | null;
  groupId: string | null;
  monitor: { id: string; name: string; type: MonitorType } | null;
  group: { id: string; name: string; color: string | null } | null;
  targetMonitorCount: number;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  targetType: "monitor" | "group";
  monitorId: string;
  groupId: string;
};

const toLocalInputValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const fromIsoToLocalInputValue = (value: string) => toLocalInputValue(new Date(value));

const emptyForm = (): FormState => {
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  return {
    title: "",
    description: "",
    startsAt: toLocalInputValue(now),
    endsAt: toLocalInputValue(end),
    enabled: true,
    targetType: "monitor",
    monitorId: "",
    groupId: "",
  };
};

const formatDateTime = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const getWindowState = (window: MaintenanceWindow, now = Date.now()) => {
  if (!window.enabled) return "disabled" as const;
  const start = new Date(window.startsAt).getTime();
  const end = new Date(window.endsAt).getTime();
  if (start <= now && end >= now) return "active" as const;
  if (start > now) return "upcoming" as const;
  return "past" as const;
};

const MaintenanceWindowsPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const { user } = useSession();
  const isAdmin = isAdminUser(user);
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingWindow, setEditingWindow] = useState<MaintenanceWindow | null>(null);
  const [deletingWindow, setDeletingWindow] = useState<MaintenanceWindow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [windowsResponse, monitorsResponse, groupsResponse] = await Promise.all([
        api.get<ApiResponse<MaintenanceWindow[]>>("/maintenance-windows"),
        api.get<ApiResponse<MonitorOption[]>>("/monitors"),
        api.get<ApiResponse<GroupOption[]>>("/groups"),
      ]);

      if (!windowsResponse.data.success) {
        toast.error(windowsResponse.data.message);
        return;
      }
      if (!monitorsResponse.data.success) {
        toast.error(monitorsResponse.data.message);
        return;
      }
      if (!groupsResponse.data.success) {
        toast.error(groupsResponse.data.message);
        return;
      }

      setWindows(windowsResponse.data.data);
      setMonitors(monitorsResponse.data.data);
      setGroups(groupsResponse.data.data);
    } catch {
      toast.error(t("maintenance.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const states = windows.map((window) => getWindowState(window));
    return {
      total: windows.length,
      active: states.filter((state) => state === "active").length,
      upcoming: states.filter((state) => state === "upcoming").length,
      disabled: states.filter((state) => state === "disabled").length,
    };
  }, [windows]);

  const closeModal = () => {
    setIsCreateOpen(false);
    setEditingWindow(null);
    setForm(emptyForm());
  };

  const openCreate = () => {
    setEditingWindow(null);
    setForm(emptyForm());
    setIsCreateOpen(true);
  };

  const openEdit = (window: MaintenanceWindow) => {
    setIsCreateOpen(false);
    setEditingWindow(window);
    setForm({
      title: window.title,
      description: window.description ?? "",
      startsAt: fromIsoToLocalInputValue(window.startsAt),
      endsAt: fromIsoToLocalInputValue(window.endsAt),
      enabled: window.enabled,
      targetType: window.groupId ? "group" : "monitor",
      monitorId: window.monitorId ?? "",
      groupId: window.groupId ?? "",
    });
  };

  const handleSubmit = async () => {
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    const targetId = form.targetType === "monitor" ? form.monitorId : form.groupId;

    if (!form.title.trim()) {
      toast.error(t("maintenance.validationTitle"));
      return;
    }
    if (!targetId) {
      toast.error(t("maintenance.validationTarget"));
      return;
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      toast.error(t("maintenance.validationDateRange"));
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      enabled: form.enabled,
      monitorId: form.targetType === "monitor" ? form.monitorId : undefined,
      groupId: form.targetType === "group" ? form.groupId : undefined,
    };

    setBusyId(editingWindow?.id ?? "create");

    try {
      const response = editingWindow
        ? await api.patch<ApiResponse<MaintenanceWindow>>(`/maintenance-windows/${editingWindow.id}`, payload)
        : await api.post<ApiResponse<MaintenanceWindow>>("/maintenance-windows", payload);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(editingWindow ? t("maintenance.updateSuccess") : t("maintenance.createSuccess"));
      closeModal();
      await loadData();
    } catch {
      toast.error(editingWindow ? t("maintenance.updateError") : t("maintenance.createError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingWindow) return;
    setBusyId(deletingWindow.id);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(`/maintenance-windows/${deletingWindow.id}`);
      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(t("maintenance.deleteSuccess"));
      setDeletingWindow(null);
      await loadData();
    } catch {
      toast.error(t("maintenance.deleteError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("maintenance.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("maintenance.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{t("maintenance.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="button"
            onClick={() => void loadData()}
          >
            {t("common.refresh")}
          </button>
          {isAdmin ? (
            <button
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              type="button"
              onClick={openCreate}
            >
              {t("maintenance.newWindow")}
            </button>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("maintenance.summaryTotal"), value: summary.total, tone: "text-slate-950" },
          { label: t("maintenance.summaryActive"), value: summary.active, tone: "text-emerald-700" },
          { label: t("maintenance.summaryUpcoming"), value: summary.upcoming, tone: "text-cyan-700" },
          { label: t("maintenance.summaryDisabled"), value: summary.disabled, tone: "text-slate-500" },
        ].map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">{t("maintenance.listTitle")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? t("common.loading") : t("maintenance.loadedCount", { count: windows.length })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("maintenance.colWindow")}</th>
                <th className="px-4 py-3">{t("maintenance.colTarget")}</th>
                <th className="px-4 py-3">{t("maintenance.colSchedule")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && windows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={5}>
                    {t("maintenance.noWindows")}
                  </td>
                </tr>
              ) : null}
              {windows.map((window) => {
                const state = getWindowState(window);
                const stateClass = {
                  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
                  upcoming: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
                  past: "bg-slate-100 text-slate-500 ring-slate-600/10",
                  disabled: "bg-slate-100 text-slate-400 ring-slate-600/10",
                }[state];

                return (
                  <tr className="transition hover:bg-slate-50" key={window.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{window.title}</div>
                      <div className="mt-1 max-w-md truncate text-xs text-slate-500" title={window.description ?? undefined}>
                        {window.description || t("maintenance.noDescription")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {window.monitor ? (
                        <Link className="font-medium text-cyan-700 hover:underline" to={`/monitors/${window.monitor.id}`}>
                          {window.monitor.name}
                          <span className="ml-2 text-xs text-slate-400">{formatMonitorTypeLabel(window.monitor.type)}</span>
                        </Link>
                      ) : window.group ? (
                        <Link className="inline-flex items-center gap-2 font-medium text-cyan-700 hover:underline" to={`/groups/${window.group.id}`}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: window.group.color ?? "#22c55e" }} />
                          {window.group.name}
                          <span className="text-xs text-slate-400">
                            {t("maintenance.monitorCount", { count: window.targetMonitorCount })}
                          </span>
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div>{formatDateTime(window.startsAt, locale)}</div>
                      <div className="text-xs text-slate-400">{formatDateTime(window.endsAt, locale)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${stateClass}`}>
                        {t(`maintenance.state.${state}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {isAdmin ? (
                        <div className="flex justify-end gap-2">
                          <button
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            type="button"
                            onClick={() => openEdit(window)}
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                            type="button"
                            onClick={() => setDeletingWindow(window)}
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (isCreateOpen || editingWindow) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editingWindow ? t("maintenance.editTitle") : t("maintenance.createTitle")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t("maintenance.modalDescription")}</p>
            </div>
            <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("maintenance.fieldTitle")}</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("common.description")}</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("maintenance.startsAt")}</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("maintenance.endsAt")}</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("maintenance.targetType")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.targetType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      targetType: event.target.value as "monitor" | "group",
                      monitorId: "",
                      groupId: "",
                    }))
                  }
                >
                  <option value="monitor">{t("maintenance.targetMonitor")}</option>
                  <option value="group">{t("maintenance.targetGroup")}</option>
                </select>
              </label>
              {form.targetType === "monitor" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("maintenance.targetMonitor")}</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={form.monitorId}
                    onChange={(event) => setForm((current) => ({ ...current, monitorId: event.target.value }))}
                  >
                    <option value="">{t("maintenance.chooseTarget")}</option>
                    {monitors.map((monitor) => (
                      <option key={monitor.id} value={monitor.id}>
                        {monitor.name} · {formatMonitorTypeLabel(monitor.type)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">{t("maintenance.targetGroup")}</span>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={form.groupId}
                    onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
                  >
                    <option value="">{t("maintenance.chooseTarget")}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                <input
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                {t("common.enabled")}
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={closeModal}
                disabled={busyId !== null}
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busyId !== null}
              >
                {editingWindow ? t("common.save") : t("maintenance.createWindow")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && deletingWindow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("maintenance.deleteTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("maintenance.deleteDescription")}</p>
            </div>
            <div className="p-5 text-sm text-slate-600">
              {t("maintenance.deleteConfirmPrefix")}{" "}
              <span className="font-semibold text-slate-950">{deletingWindow.title}</span>{" "}
              {t("maintenance.deleteConfirmSuffix")}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => setDeletingWindow(null)}
                disabled={busyId === deletingWindow.id}
              >
                {t("common.cancel")}
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDelete()}
                disabled={busyId === deletingWindow.id}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MaintenanceWindowsPage;
