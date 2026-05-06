import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type AuditLogRow = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: { name: string };
  } | null;
};

type AuditLogResponse = {
  items: AuditLogRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  filters: {
    actions: string[];
    entities: string[];
  };
};

type JsonPanelState = {
  title: string;
  value: unknown;
} | null;

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
};

const hasJsonValue = (value: unknown) => value !== null && value !== undefined;

const stringifyJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const AuditLogsPage = () => {
  const { api } = useApi();
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jsonPanel, setJsonPanel] = useState<JsonPanelState>(null);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(Math.ceil(data.total / data.limit), 1);
  }, [data]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 50,
        search: search.trim() || undefined,
        action: action || undefined,
        entity: entity || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      };
      const res = await api.get<ApiResponse<AuditLogResponse>>("/admin/audit-logs", { params });
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setData(res.data.data);
    } catch {
      toast.error("โหลด audit logs ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [action, api, entity, from, page, search, to]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const applyFilters = () => {
    setPage(1);
    void loadAuditLogs();
  };

  const clearFilters = () => {
    setSearch("");
    setAction("");
    setEntity("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">System</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Audit Logs</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ตรวจสอบประวัติการทำงานสำคัญของระบบ เช่น cleanup, incident reminders และกิจกรรมที่บันทึกไว้
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAuditLogs()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(160px,0.7fr)_minmax(160px,0.7fr)_minmax(190px,0.8fr)_minmax(190px,0.8fr)_auto]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="action, entity, user, IP"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action</span>
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="">All actions</option>
              {(data?.filters.actions ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entity</span>
            <select
              value={entity}
              onChange={(event) => setEntity(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="">All entities</option>
              {(data?.filters.entities ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</span>
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</span>
            <input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Log entries</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Loading..." : `${(data?.total ?? 0).toLocaleString()} records`}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Page {data?.page ?? page} / {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && (data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    ยังไม่มี audit log ตามเงื่อนไขนี้
                  </td>
                </tr>
              ) : null}

              {(data?.items ?? []).map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    {row.user ? (
                      <>
                        <p className="font-medium text-slate-900">{row.user.username}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.user.email} · {row.user.role.name}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-500">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{row.entity}</p>
                    <p className="mt-1 max-w-[220px] truncate font-mono text-xs text-slate-500" title={row.entityId ?? ""}>
                      {row.entityId ?? "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{row.ipAddress ?? "-"}</p>
                    <p className="mt-1 max-w-[260px] truncate text-xs text-slate-500" title={row.userAgent ?? ""}>
                      {row.userAgent ?? "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={!hasJsonValue(row.oldValue)}
                        onClick={() => setJsonPanel({ title: "Old value", value: row.oldValue })}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Before
                      </button>
                      <button
                        type="button"
                        disabled={!hasJsonValue(row.newValue)}
                        onClick={() => setJsonPanel({ title: "New value", value: row.newValue })}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            Showing {(data?.items.length ?? 0).toLocaleString()} of {(data?.total ?? 0).toLocaleString()}
          </span>
          <button
            type="button"
            disabled={!data?.hasMore}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>

      {jsonPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{jsonPanel.title}</h2>
              <button
                type="button"
                onClick={() => setJsonPanel(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-slate-950 p-5 text-xs leading-6 text-slate-100">
              {stringifyJson(jsonPanel.value)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AuditLogsPage;
