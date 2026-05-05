import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type MonitorType = "PING" | "TCP" | "HTTP" | "DOCKER" | "DATABASE";

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
  checkedAt: string;
};

type MonitorRow = {
  id: string;
  name: string;
  type: MonitorType;
  config: Record<string, unknown>;
  interval: number;
  enabled: boolean;
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

const getTarget = (monitor: MonitorRow) => {
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

const getOpenUrl = (monitor: MonitorRow) => {
  const config = monitor.config;

  if (typeof config.url === "string") return config.url;
  if (typeof config.portainerUrl === "string") return config.portainerUrl;

  return null;
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

const toConfigText = (config: Record<string, unknown>) => {
  return JSON.stringify(config, null, 2);
};

const MonitorsPage = () => {
  const { api } = useApi();
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
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
    configText: "{}",
  });

  const fetchMonitors = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await api.get<ApiResponse<MonitorRow[]>>("/monitors");

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setMonitors(response.data.data);
    } catch {
      toast.error("โหลด monitor ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchMonitors();
  }, [fetchMonitors]);

  const summary = useMemo(() => {
    const latestStatuses = monitors.map((monitor) => monitor.latestResult?.status ?? "PENDING");

    return [
      { label: "Total", value: monitors.length, className: "text-slate-950" },
      {
        label: "Up",
        value: latestStatuses.filter((status) => status === "UP").length,
        className: "text-emerald-600",
      },
      {
        label: "Degraded",
        value: latestStatuses.filter((status) => status === "DEGRADED").length,
        className: "text-amber-600",
      },
      {
        label: "Down",
        value: latestStatuses.filter((status) => status === "DOWN").length,
        className: "text-rose-600",
      },
    ];
  }, [monitors]);

  const handleCheckNow = async (monitor: MonitorRow) => {
    setOpenMenu(null);
    setBusyId(monitor.id);

    try {
      const response = await api.post<ApiResponse<MonitorResult>>(`/monitors/${monitor.id}/check`);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(`เช็ก ${monitor.name} แล้ว`);
      await fetchMonitors();
    } catch {
      toast.error("สั่งเช็กไม่สำเร็จ");
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

      toast.success(monitor.enabled ? "ปิด monitor แล้ว" : "เปิด monitor แล้ว");
      await fetchMonitors();
    } catch {
      toast.error("เปลี่ยนสถานะไม่สำเร็จ");
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
      configText: toConfigText(monitor.config),
    });
  };

  const handleUpdateMonitor = async () => {
    if (!editingMonitor) return;

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

    setBusyId(editingMonitor.id);

    try {
      const response = await api.patch<ApiResponse<MonitorRow>>(`/monitors/${editingMonitor.id}`, {
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
      setEditingMonitor(null);
      await fetchMonitors();
    } catch {
      toast.error("แก้ไข monitor ไม่สำเร็จ");
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

      toast.success("ลบ monitor แล้ว");
      setDeletingMonitor(null);
      await fetchMonitors();
    } catch {
      toast.error("ลบ monitor ไม่สำเร็จ");
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
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Monitors</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            สถานะล่าสุด, ประวัติ down ล่าสุด, และ uptime 24 ชั่วโมงของ monitor ทั้งหมด
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void fetchMonitors()}
            disabled={isLoading}
          >
            Refresh
          </button>
          <Link
            className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            to="/monitors/new"
          >
            Add Monitor
          </Link>
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Active monitor inventory</h2>
          <p className="text-xs text-slate-500">{isLoading ? "Loading..." : `${monitors.length} monitors`}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Response</th>
                <th className="px-4 py-3">Last checked</th>
                <th className="px-4 py-3">Last down</th>
                <th className="px-4 py-3">24h uptime</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!isLoading && monitors.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={8}>
                    ยังไม่มี monitor
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
                        {monitor.type} · every {monitor.interval}s
                      </div>
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
                        <div className="text-xs text-rose-600">{monitor.downCount24h} down / 24h</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {monitor.uptime24h === null ? "-" : `${monitor.uptime24h}%`}
                      {monitor.checkCount24h > 0 ? (
                        <div className="text-xs text-slate-400">{monitor.checkCount24h} checks</div>
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
                            Open
                          </a>
                        ) : null}
                        <Link
                          className="rounded-md border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50"
                          to={`/monitors/${monitor.id}`}
                        >
                          View
                        </Link>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editingMonitor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Edit monitor</h2>
              <p className="mt-1 text-sm text-slate-500">{editingMonitor.name}</p>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Name</span>
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
                onClick={() => setEditingMonitor(null)}
                disabled={busyId === editingMonitor.id}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleUpdateMonitor()}
                disabled={busyId === editingMonitor.id}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingMonitor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Delete monitor</h2>
              <p className="mt-1 text-sm text-slate-500">
                ลบ monitor นี้พร้อมผลตรวจและข้อมูลที่เกี่ยวข้อง
              </p>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-600">
                ต้องการลบ <span className="font-semibold text-slate-950">{deletingMonitor.name}</span>{" "}
                ใช่ไหม?
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setDeletingMonitor(null)}
                disabled={busyId === deletingMonitor.id}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDeleteMonitor()}
                disabled={busyId === deletingMonitor.id}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openMenu ? (
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
                    Check now
                  </button>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => void handleToggleEnabled(activeMonitor)}
                    disabled={isMenuBusy}
                  >
                    {activeMonitor.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="flex w-full items-center rounded-md px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => openEditModal(activeMonitor)}
                    disabled={isMenuBusy}
                  >
                    Edit
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
                    Delete
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
