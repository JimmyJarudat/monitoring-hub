import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "@/hooks/useApi";

type DiskInfo = {
  mount: string;
  totalKb: number;
  usedKb: number;
  usedPct: number;
};

type SystemMetadata = {
  host: string;
  cpuUsedPct: number;
  memTotalKb: number;
  memUsedKb: number;
  memUsedPct: number;
  disks: DiskInfo[];
};

type LatestResult = {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs: number | null;
  checkedAt: string;
  message: string | null;
  metadata: SystemMetadata | null;
};

type Device = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  interval: number;
  config: { host?: string; community?: string };
  latestResult: LatestResult | null;
  uptime24h: number | null;
};

type ApiResponse<T> = { data: T };

const fmt = (n: number, unit: string) => `${n.toFixed(1)}${unit}`;

const fmtBytes = (kb: number) => {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
};

const statusColor = {
  UP: "bg-emerald-100 text-emerald-700",
  DOWN: "bg-red-100 text-red-700",
  DEGRADED: "bg-amber-100 text-amber-700",
};

const gaugeColor = (pct: number) => {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-400";
  return "bg-emerald-400";
};

const Gauge = ({ label, pct, detail }: { label: string; pct: number; detail: string }) => (
  <div className="min-w-0">
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span className="font-medium text-slate-700">{label}</span>
      <span>{fmt(pct, "%")}</span>
    </div>
    <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100">
      <div
        className={`h-2 rounded-full transition-all ${gaugeColor(pct)}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
    <p className="mt-0.5 text-[11px] text-slate-400">{detail}</p>
  </div>
);

const DeviceCard = ({ device }: { device: Device }) => {
  const result = device.latestResult;
  const meta = result?.metadata as SystemMetadata | null;
  const status = result?.status ?? "UNKNOWN";
  const checkedAt = result?.checkedAt ? new Date(result.checkedAt) : null;
  const host = device.config.host ?? "";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/monitors/${device.id}`}
            className="truncate font-semibold text-slate-950 hover:text-cyan-600"
          >
            {device.name}
          </Link>
          <p className="mt-0.5 text-sm text-slate-400">{host}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {status !== "UNKNOWN" ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor[status as keyof typeof statusColor] ?? "bg-slate-100 text-slate-500"}`}>
              {status}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
              UNKNOWN
            </span>
          )}
          {device.uptime24h !== null ? (
            <span className="text-xs text-slate-400">{device.uptime24h}% uptime</span>
          ) : null}
        </div>
      </div>

      {meta ? (
        <div className="mt-4 space-y-3">
          <Gauge
            label="CPU"
            pct={meta.cpuUsedPct}
            detail={`${fmt(meta.cpuUsedPct, "% used")}`}
          />
          <Gauge
            label="RAM"
            pct={meta.memUsedPct}
            detail={`${fmtBytes(meta.memUsedKb)} / ${fmtBytes(meta.memTotalKb)}`}
          />
          {meta.disks?.map((disk) => (
            <Gauge
              key={disk.mount}
              label={`Disk ${disk.mount}`}
              pct={disk.usedPct}
              detail={`${fmtBytes(disk.usedKb)} / ${fmtBytes(disk.totalKb)}`}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
          {result ? result.message ?? "ไม่มีข้อมูล metrics" : "ยังไม่เคยเช็ค"}
        </div>
      )}

      {result?.message && status === "DEGRADED" ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          {result.message}
        </p>
      ) : null}

      {checkedAt ? (
        <p className="mt-3 text-right text-[11px] text-slate-300">
          checked {checkedAt.toLocaleString("th-TH")}
        </p>
      ) : null}
    </div>
  );
};

const DevicesPage = () => {
  const { get } = useApi();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await get<ApiResponse<Device[]>>("/monitors?type=SYSTEM");
        setDevices(res.data.data ?? []);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [get]);

  const up = devices.filter((d) => d.latestResult?.status === "UP").length;
  const degraded = devices.filter((d) => d.latestResult?.status === "DEGRADED").length;
  const down = devices.filter((d) => d.latestResult?.status === "DOWN").length;

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Devices</h1>
          <p className="mt-1 text-sm text-slate-500">
            System monitors — CPU, RAM, Disk via SNMP
          </p>
        </div>
        <Link
          to="/monitors/new"
          className="inline-flex items-center justify-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          + Add Device
        </Link>
      </div>

      {!loading && devices.length > 0 ? (
        <div className="mt-4 flex gap-4">
          {[
            { label: "Total", value: devices.length, color: "text-slate-700" },
            { label: "UP", value: up, color: "text-emerald-600" },
            { label: "DEGRADED", value: degraded, color: "text-amber-600" },
            { label: "DOWN", value: down, color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full text-sm text-slate-400">กำลังโหลด...</p>
        ) : devices.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-700">ยังไม่มี device</p>
            <p className="mt-1 text-sm text-slate-400">
              สร้าง monitor ประเภท SYSTEM แล้วระบบจะดึงข้อมูล CPU/RAM/Disk ผ่าน SNMP
            </p>
            <Link
              to="/monitors/new"
              className="mt-4 inline-flex items-center rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              + Add Device
            </Link>
          </div>
        ) : (
          devices.map((device) => <DeviceCard key={device.id} device={device} />)
        )}
      </div>
    </div>
  );
};

export default DevicesPage;
