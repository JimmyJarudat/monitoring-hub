import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "@/hooks/useApi";

type IfaceSnapshot = {
  name: string;
  operStatus: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
};

type DeviceMetadata = {
  interfaces?: IfaceSnapshot[];
};

type LatestResult = {
  status: "UP" | "DOWN" | "DEGRADED";
  checkedAt: string;
  metadata: DeviceMetadata | null;
};

type Device = {
  id: string;
  name: string;
  type: "SNMP" | "SYSTEM";
  config: { host?: string };
  latestResult: LatestResult | null;
};

type GroupOption = { id: string; name: string };
type ApiResponse<T> = { data: T };

type IfaceRow = {
  deviceId: string;
  deviceName: string;
  deviceHost: string;
  name: string;
  operStatus: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inDiscards: number;
  outDiscards: number;
  checkedAt: string | null;
};

const operLabel = (s: number) => (s === 1 ? "UP" : s > 1 ? "DOWN" : "Unknown");
const operClass = (s: number) =>
  s === 1
    ? "bg-emerald-100 text-emerald-700"
    : s > 1
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-500";

const fmtNum = (n: number) => (n > 0 ? n.toLocaleString() : "-");

const InterfaceInventoryPage = () => {
  const { api } = useApi();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupFilter, setGroupFilter] = useState<"ALL" | string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UP" | "DOWN" | "Unknown">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monitorsRes, groupsRes] = await Promise.all([
        api.get<ApiResponse<Device[]>>("/monitors", {
          params: { groupId: groupFilter === "ALL" ? undefined : groupFilter },
        }),
        api.get<ApiResponse<GroupOption[]>>("/groups"),
      ]);
      const items = (monitorsRes.data.data ?? []).filter(
        (d) => d.type === "SNMP" || d.type === "SYSTEM",
      );
      setDevices(items as Device[]);
      setGroups(groupsRes.data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [api, groupFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<IfaceRow[]>(() => {
    const result: IfaceRow[] = [];
    for (const device of devices) {
      const meta = device.latestResult?.metadata;
      const ifaces = meta?.interfaces ?? [];
      for (const iface of ifaces) {
        result.push({
          deviceId: device.id,
          deviceName: device.name,
          deviceHost: device.config.host ?? "",
          name: iface.name,
          operStatus: iface.operStatus,
          inOctets: iface.inOctets ?? 0,
          outOctets: iface.outOctets ?? 0,
          inErrors: iface.inErrors ?? 0,
          outErrors: iface.outErrors ?? 0,
          inDiscards: iface.inDiscards ?? 0,
          outDiscards: iface.outDiscards ?? 0,
          checkedAt: device.latestResult?.checkedAt ?? null,
        });
      }
    }
    return result;
  }, [devices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && operLabel(row.operStatus) !== statusFilter) return false;
      if (q && !row.name.toLowerCase().includes(q) && !row.deviceName.toLowerCase().includes(q) && !row.deviceHost.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, statusFilter, search]);

  const upCount = rows.filter((r) => r.operStatus === 1).length;
  const downCount = rows.filter((r) => r.operStatus > 1).length;
  const unknownCount = rows.filter((r) => r.operStatus === 0).length;
  const errorCount = rows.filter((r) => r.inErrors > 0 || r.outErrors > 0).length;

  return (
    <div className="min-h-full bg-slate-50 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Interfaces</h1>
          <p className="mt-1 text-sm text-slate-500">
            รายการ port และ interface ทั้งหมดจาก SNMP / SYSTEM devices
          </p>
        </div>
        <Link
          to="/devices"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          ← Devices
        </Link>
      </div>

      {/* Stat cards */}
      {!loading && rows.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: rows.length, color: "text-slate-800", bg: "bg-white" },
            { label: "UP", value: upCount, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "DOWN", value: downCount, color: "text-red-700", bg: "bg-red-50" },
            { label: "Has Errors", value: errorCount, color: "text-amber-700", bg: "bg-amber-50" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border border-slate-200 ${s.bg} px-4 py-3`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Group</label>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="ALL">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Status</label>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="UP">UP only</option>
              <option value="DOWN">DOWN only</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Search</label>
            <input
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder="ชื่อ interface, device, host..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {(statusFilter !== "ALL" || search) && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-500">
              แสดง {filtered.length} จาก {rows.length} interfaces
            </span>
            <button
              type="button"
              onClick={() => { setStatusFilter("ALL"); setSearch(""); }}
              className="text-xs font-medium text-cyan-600 hover:text-cyan-800"
            >
              ล้าง filter
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="font-medium text-slate-700">ยังไม่มีข้อมูล interface</p>
            <p className="mt-1 text-sm text-slate-400">
              ต้องมี SNMP หรือ SYSTEM monitor ที่เช็กสำเร็จและมี interface counters
            </p>
            <Link
              to="/monitors/new"
              className="mt-4 inline-flex items-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              + Add Device
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            ไม่มี interface ตรงกับ filter ที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Interface</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">In Octets</th>
                  <th className="px-4 py-3 text-right">Out Octets</th>
                  <th className="px-4 py-3 text-right">In Errors</th>
                  <th className="px-4 py-3 text-right">Out Errors</th>
                  <th className="px-4 py-3 text-right">In Discards</th>
                  <th className="px-4 py-3 text-right">Out Discards</th>
                  <th className="px-4 py-3">Last checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row, i) => (
                  <tr
                    key={`${row.deviceId}-${row.name}-${i}`}
                    className={[
                      "hover:bg-slate-50",
                      row.inErrors > 0 || row.outErrors > 0 ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        to={`/monitors/${row.deviceId}`}
                        className="font-medium text-slate-800 hover:text-cyan-600"
                      >
                        {row.deviceName}
                      </Link>
                      {row.deviceHost && (
                        <p className="text-[11px] text-slate-400">{row.deviceHost}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                      {row.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${operClass(row.operStatus)}`}>
                        {operLabel(row.operStatus)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                      {fmtNum(row.inOctets)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                      {fmtNum(row.outOctets)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.inErrors > 0 ? "text-amber-700" : "text-slate-400"}`}>
                      {fmtNum(row.inErrors)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.outErrors > 0 ? "text-amber-700" : "text-slate-400"}`}>
                      {fmtNum(row.outErrors)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.inDiscards > 0 ? "text-orange-600" : "text-slate-400"}`}>
                      {fmtNum(row.inDiscards)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${row.outDiscards > 0 ? "text-orange-600" : "text-slate-400"}`}>
                      {fmtNum(row.outDiscards)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                      {row.checkedAt
                        ? new Intl.DateTimeFormat("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(row.checkedAt))
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            {filtered.length} interfaces จาก {new Set(filtered.map((r) => r.deviceId)).size} devices
            {unknownCount > 0 && (
              <span className="ml-3 text-slate-400">· {unknownCount} Unknown (ยังไม่มี operStatus)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterfaceInventoryPage;
