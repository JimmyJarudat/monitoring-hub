import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type LogLevel = "INFO" | "WARN" | "ERROR";

type SystemLogRow = {
  id: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

type SystemLogResponse = {
  items: SystemLogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: string[];
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const dateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const formatDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : dateTimeFormatter.format(d);
};

const LEVEL_STYLE: Record<LogLevel, string> = {
  INFO: "bg-sky-400/10 text-sky-400 border border-sky-400/20",
  WARN: "bg-amber-400/10 text-amber-400 border border-amber-400/20",
  ERROR: "bg-red-500/10 text-red-400 border border-red-400/20",
};

const LEVEL_DOT: Record<LogLevel, string> = {
  INFO: "bg-sky-400",
  WARN: "bg-amber-400",
  ERROR: "bg-red-400",
};

const SystemLogsPage = () => {
  const { api } = useApi();

  const [items, setItems] = useState<SystemLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [levelFilter, setLevelFilter] = useState<"" | LogLevel>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: "50" });
        if (levelFilter) params.set("level", levelFilter);
        if (categoryFilter) params.set("category", categoryFilter);
        if (search) params.set("search", search);
        if (from) params.set("from", new Date(from).toISOString());
        if (to) {
          const d = new Date(to);
          d.setHours(23, 59, 59, 999);
          params.set("to", d.toISOString());
        }

        const res = await api.get<ApiResponse<SystemLogResponse>>(
          `/admin/system-logs?${params.toString()}`,
        );
        if (!res.data.success) throw new Error(res.data.message);
        const d = res.data.data;
        setItems(d.items);
        setTotal(d.total);
        setTotalPages(d.totalPages);
        setCategories(d.categories);
        setPage(p);
      } catch {
        toast.error("โหลด system logs ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    },
    [api, levelFilter, categoryFilter, search, from, to],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(1);
  };

  const handleReset = () => {
    setLevelFilter("");
    setCategoryFilter("");
    setSearch("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">System Logs</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            บันทึกเหตุการณ์ระบบ — เก็บไว้ 90 วัน
          </p>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
          {total.toLocaleString()} รายการ
        </span>
      </div>

      {/* Filter bar */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Level buttons */}
          <div className="col-span-2 flex gap-1 sm:col-span-3 lg:col-span-1">
            {(["", "INFO", "WARN", "ERROR"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLevelFilter(l)}
                className={[
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition",
                  levelFilter === l
                    ? l === ""
                      ? "bg-slate-700 text-white"
                      : l === "INFO"
                        ? "bg-sky-500 text-white"
                        : l === "WARN"
                          ? "bg-amber-500 text-slate-950"
                          : "bg-red-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700",
                ].join(" ")}
              >
                {l || "All"}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="">ทุก Category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            placeholder="จากวันที่"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            placeholder="ถึงวันที่"
          />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา message..."
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition"
            >
              ค้นหา
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-700 transition"
            >
              ล้าง
            </button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-40">
                เวลา
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-20">
                Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-28">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Message
              </th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-500">
                  กำลังโหลด...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-500">
                  ไม่มีข้อมูล log
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <>
                  <tr
                    key={row.id}
                    className="bg-slate-950 hover:bg-slate-900/60 transition"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_STYLE[row.level]}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[row.level]}`}
                        />
                        {row.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 max-w-xl truncate">
                      {row.message}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.metadata !== null && row.metadata !== undefined && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(expanded === row.id ? null : row.id)
                          }
                          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition"
                        >
                          {expanded === row.id ? "ซ่อน" : "ดู"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}-meta`} className="bg-slate-900">
                      <td colSpan={5} className="px-6 py-3">
                        <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-300">
                          {JSON.stringify(row.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            หน้า {page} / {totalPages} ({total.toLocaleString()} รายการ)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-slate-700 transition"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-slate-700 transition"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemLogsPage;
