import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type MonitorSummary = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  interval: number;
  config: Record<string, unknown>;
  latestResult?: {
    status: MonitorStatus;
    checkedAt: string;
    responseTimeMs: number | null;
  } | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  monitorCount: number;
  monitors: MonitorSummary[];
};

type GroupForm = {
  name: string;
  description: string;
  color: string;
  monitorIds: string[];
};

const statusStyles: Record<MonitorStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const typeLabel = (type: MonitorType) => {
  if (type === "TLS_CERT") return "TLS";
  return type;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

const GroupsPage = () => {
  const { api } = useApi();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupRow | null>(null);
  const [form, setForm] = useState<GroupForm>({
    name: "",
    description: "",
    color: "#22c55e",
    monitorIds: [],
  });

  const resetForm = useCallback(() => {
    setForm({
      name: "",
      description: "",
      color: "#22c55e",
      monitorIds: [],
    });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      const [groupsResponse, monitorsResponse] = await Promise.all([
        api.get<ApiResponse<GroupRow[]>>("/groups"),
        api.get<ApiResponse<MonitorSummary[]>>("/monitors"),
      ]);

      if (!groupsResponse.data.success) {
        toast.error(groupsResponse.data.message);
        return;
      }

      if (!monitorsResponse.data.success) {
        toast.error(monitorsResponse.data.message);
        return;
      }

      setGroups(groupsResponse.data.data);
      setMonitors(monitorsResponse.data.data);
    } catch {
      toast.error("โหลด groups ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const groupedMonitorIds = useMemo(
    () => new Set(groups.flatMap((group) => group.monitors.map((monitor) => monitor.id))),
    [groups],
  );

  const monitorsWithoutGroup = useMemo(
    () => monitors.filter((monitor) => !groupedMonitorIds.has(monitor.id)),
    [groupedMonitorIds, monitors],
  );

  const summary = useMemo(() => {
    return {
      groups: groups.length,
      assigned: groupedMonitorIds.size,
      unassigned: monitorsWithoutGroup.length,
      devices: groups.filter((group) =>
        group.monitors.some((monitor) => monitor.type === "SNMP" || monitor.type === "SYSTEM"),
      ).length,
    };
  }, [groupedMonitorIds.size, groups, monitorsWithoutGroup.length]);

  const openCreate = () => {
    resetForm();
    setEditingGroup(null);
    setIsCreateOpen(true);
  };

  const openEdit = (group: GroupRow) => {
    setIsCreateOpen(false);
    setEditingGroup(group);
    setForm({
      name: group.name,
      description: group.description ?? "",
      color: group.color ?? "#22c55e",
      monitorIds: group.monitors.map((monitor) => monitor.id),
    });
  };

  const closeModal = () => {
    setIsCreateOpen(false);
    setEditingGroup(null);
    resetForm();
  };

  const toggleMonitorSelection = (monitorId: string) => {
    setForm((current) => ({
      ...current,
      monitorIds: current.monitorIds.includes(monitorId)
        ? current.monitorIds.filter((id) => id !== monitorId)
        : [...current.monitorIds, monitorId],
    }));
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      color: form.color.trim() || undefined,
      monitorIds: form.monitorIds,
    };

    if (!payload.name) {
      toast.error("กรุณาระบุชื่อกลุ่ม");
      return;
    }

    setBusyId(editingGroup?.id ?? "create");

    try {
      const response = editingGroup
        ? await api.patch<ApiResponse<GroupRow>>(`/groups/${editingGroup.id}`, payload)
        : await api.post<ApiResponse<GroupRow>>("/groups", payload);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(editingGroup ? "อัปเดตกลุ่มแล้ว" : "สร้างกลุ่มแล้ว");
      closeModal();
      await loadData();
    } catch {
      toast.error(editingGroup ? "อัปเดตกลุ่มไม่สำเร็จ" : "สร้างกลุ่มไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingGroup) return;

    setBusyId(deletingGroup.id);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(
        `/groups/${deletingGroup.id}`,
      );

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success("ลบกลุ่มแล้ว");
      setDeletingGroup(null);
      await loadData();
    } catch {
      toast.error("ลบกลุ่มไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Groups</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            รวม monitor และ device เป็นชุดตามสาขา, ลูกค้า, environment หรือทีมดูแล ช่วยให้เรา
            มอง inventory เป็นกลุ่มงานจริง ๆ แทนการไล่ทีละตัว
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="button"
            onClick={() => void loadData()}
          >
            Refresh
          </button>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="button"
            onClick={openCreate}
          >
            New Group
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Groups", value: summary.groups, tone: "text-slate-950" },
          { label: "Assigned monitors", value: summary.assigned, tone: "text-cyan-700" },
          { label: "Ungrouped", value: summary.unassigned, tone: "text-amber-700" },
          { label: "Device groups", value: summary.devices, tone: "text-emerald-700" },
        ].map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Group inventory</h2>
            <p className="mt-1 text-xs text-slate-500">
              {isLoading ? "Loading..." : `${groups.length} groups loaded`}
            </p>
          </div>
          {monitorsWithoutGroup.length > 0 ? (
            <p className="text-xs text-amber-700">
              {monitorsWithoutGroup.length} monitors ยังไม่ได้เข้ากลุ่ม
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
          {!isLoading && groups.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="font-medium text-slate-700">ยังไม่มีกลุ่ม</p>
              <p className="mt-1 text-sm text-slate-400">
                เริ่มจากสร้างกลุ่มตาม site, customer หรือ production environment ก่อนก็ได้
              </p>
              <button
                className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                type="button"
                onClick={openCreate}
              >
                New Group
              </button>
            </div>
          ) : null}

          {groups.map((group) => (
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={group.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: group.color ?? "#22c55e" }}
                    />
                    <h3 className="truncate text-base font-semibold text-slate-950">{group.name}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {group.description || "ยังไม่ได้ใส่คำอธิบายกลุ่ม"}
                  </p>
                </div>

                <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  {group.monitorCount} monitors
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {group.monitors.slice(0, 6).map((monitor) => (
                  <Link
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                    key={monitor.id}
                    to={`/monitors/${monitor.id}`}
                  >
                    <span>{monitor.name}</span>
                    {monitor.latestResult ? (
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusStyles[monitor.latestResult.status]}`}
                      >
                        {monitor.latestResult.status}
                      </span>
                    ) : null}
                  </Link>
                ))}
                {group.monitorCount > 6 ? (
                  <span className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200">
                    +{group.monitorCount - 6} more
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>Updated {formatDate(group.updatedAt)}</span>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-white"
                    type="button"
                    onClick={() => openEdit(group)}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-md border border-rose-200 px-3 py-1.5 font-semibold text-rose-700 transition hover:bg-rose-50"
                    type="button"
                    onClick={() => setDeletingGroup(group)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {monitorsWithoutGroup.length > 0 ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Ungrouped monitors</h2>
              <p className="mt-1 text-sm text-slate-500">
                ตัวที่ยังไม่ได้เข้ากลุ่ม เหมาะกับการเก็บงาน inventory ต่อให้เรียบร้อย
              </p>
            </div>
            <button
              className="rounded-md border border-cyan-200 px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
              type="button"
              onClick={openCreate}
            >
              Assign via new group
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {monitorsWithoutGroup.map((monitor) => (
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                key={monitor.id}
                to={`/monitors/${monitor.id}`}
              >
                <span>{monitor.name}</span>
                <span className="text-slate-400">{typeLabel(monitor.type)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(isCreateOpen || editingGroup) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editingGroup ? "Edit group" : "Create group"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                จัด monitor และ device ให้อยู่เป็นชุดเดียวกันตามบริบทงานจริง
              </p>
            </div>

            <div className="grid gap-5 overflow-y-auto p-5 lg:grid-cols-[1.1fr,1.4fr]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Group name</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Description</span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Color</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      className="h-11 w-16 rounded-md border border-slate-300 bg-white p-1"
                      type="color"
                      value={form.color}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, color: event.target.value }))
                      }
                    />
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="text"
                      value={form.color}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, color: event.target.value }))
                      }
                    />
                  </div>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Assign monitors</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      เลือก monitor หรือ device ที่อยากให้รวมอยู่ในกลุ่มนี้
                    </p>
                  </div>
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {form.monitorIds.length} selected
                  </span>
                </div>

                <div className="mt-4 grid max-h-[45vh] gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {monitors.map((monitor) => {
                    const checked = form.monitorIds.includes(monitor.id);

                    return (
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition ${
                          checked
                            ? "border-cyan-300 bg-cyan-50"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        key={monitor.id}
                      >
                        <input
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMonitorSelection(monitor.id)}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{monitor.name}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                              {typeLabel(monitor.type)}
                            </span>
                            {monitor.latestResult ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusStyles[monitor.latestResult.status]}`}
                              >
                                {monitor.latestResult.status}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            every {monitor.interval}s {monitor.enabled ? "· enabled" : "· disabled"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={closeModal}
                disabled={busyId !== null}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busyId !== null}
              >
                {editingGroup ? "Save changes" : "Create group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingGroup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Delete group</h2>
              <p className="mt-1 text-sm text-slate-500">
                การลบกลุ่มจะไม่ลบ monitor แต่จะยกเลิกการจัดกลุ่มของสมาชิกทั้งหมด
              </p>
            </div>

            <div className="p-5 text-sm text-slate-600">
              ต้องการลบ <span className="font-semibold text-slate-950">{deletingGroup.name}</span>{" "}
              ใช่ไหม?
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => setDeletingGroup(null)}
                disabled={busyId === deletingGroup.id}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDelete()}
                disabled={busyId === deletingGroup.id}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GroupsPage;
