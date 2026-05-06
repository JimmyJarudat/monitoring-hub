import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  uptimeSeconds?: number;
  osDescr?: string;
  load1?: number;
  load5?: number;
  load15?: number;
  interfaces?: Array<{
    name: string;
    operStatus: number;
    inOctets: number;
    outOctets: number;
    inErrors: number;
    outErrors: number;
  }>;
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
  type: "SNMP" | "SYSTEM";
  enabled: boolean;
  interval: number;
  config: { host?: string; community?: string };
  latestResult: LatestResult | null;
  uptime24h: number | null;
};

type ApiResponse<T> = { data: T };
type GroupOption = { id: string; name: string; color?: string | null; monitorCount?: number };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const fmt = (n: number | null | undefined, unit: string) =>
  isFiniteNumber(n) ? `${n.toFixed(1)}${unit}` : "-";

const fmtBytes = (kb: number | null | undefined) => {
  if (!isFiniteNumber(kb)) return "-";
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb} KB`;
};

const statusColor = {
  UP: "bg-emerald-100 text-emerald-700",
  DOWN: "bg-red-100 text-red-700",
  DEGRADED: "bg-amber-100 text-amber-700",
};

const vendorLogos: Array<{
  name: string;
  matchers: RegExp[];
  logoUrl: string;
}> = [
  {
    name: "MikroTik",
    matchers: [/mikrotik/i, /routeros/i],
    logoUrl: "https://cdn.simpleicons.org/mikrotik/2563eb",
  },
  {
    name: "Cisco",
    matchers: [/cisco/i],
    logoUrl: "https://cdn.simpleicons.org/cisco/0f62fe",
  },
  {
    name: "Ubiquiti",
    matchers: [/ubiquiti/i, /\buni?fi\b/i, /edgeos/i],
    logoUrl: "https://cdn.simpleicons.org/ubiquiti/0559c9",
  },
  {
    name: "Juniper",
    matchers: [/juniper/i, /\bjunos\b/i],
    logoUrl: "https://cdn.simpleicons.org/junipernetworks/84b135",
  },
  {
    name: "Fortinet",
    matchers: [/fortinet/i, /fortigate/i],
    logoUrl: "https://cdn.simpleicons.org/fortinet/ee3124",
  },
  {
    name: "Aruba",
    matchers: [/aruba/i],
    logoUrl: "https://cdn.simpleicons.org/aruba/ff8300",
  },
  {
    name: "HPE",
    matchers: [/hewlett packard/i, /\bhpe\b/i, /procurve/i],
    logoUrl: "https://cdn.simpleicons.org/hewlettpackardenterprise/00b388",
  },
  {
    name: "TP-Link",
    matchers: [/tp-link/i],
    logoUrl: "https://cdn.simpleicons.org/tplink/4acbd6",
  },
  {
    name: "Synology",
    matchers: [/synology/i],
    logoUrl: "https://cdn.simpleicons.org/synology/b5b5b6",
  },
  {
    name: "QNAP",
    matchers: [/\bqnap\b/i],
    logoUrl: "https://cdn.simpleicons.org/qnap/0f7bc0",
  },
  {
    name: "OpenWrt",
    matchers: [/openwrt/i],
    logoUrl: "https://cdn.simpleicons.org/openwrt/00b5e2",
  },
  {
    name: "pfSense",
    matchers: [/pfsense/i],
    logoUrl: "https://cdn.simpleicons.org/pfsense/212121",
  },
  {
    name: "Ubuntu",
    matchers: [/ubuntu/i],
    logoUrl: "https://cdn.simpleicons.org/ubuntu/e95420",
  },
  {
    name: "Debian",
    matchers: [/debian/i],
    logoUrl: "https://cdn.simpleicons.org/debian/a81d33",
  },
  {
    name: "Rocky Linux",
    matchers: [/rocky/i],
    logoUrl: "https://cdn.simpleicons.org/rockylinux/10b981",
  },
  {
    name: "AlmaLinux",
    matchers: [/alma/i],
    logoUrl: "https://cdn.simpleicons.org/almalinux/2563eb",
  },
  {
    name: "CentOS",
    matchers: [/centos/i],
    logoUrl: "https://cdn.simpleicons.org/centos/8a2be2",
  },
];

const fmtUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const detectVendor = (device: Device, meta: SystemMetadata | null) => {
  const candidates = [device.name, device.config.host, meta?.osDescr]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  return vendorLogos.find((vendor) => vendor.matchers.some((matcher) => matcher.test(candidates))) ?? null;
};

const gaugeColor = (pct: number | null | undefined) => {
  if (!isFiniteNumber(pct)) return "bg-slate-300";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-400";
  return "bg-emerald-400";
};

const Gauge = ({
  label,
  pct,
  detail,
}: {
  label: string;
  pct: number | null | undefined;
  detail: string;
}) => (
  <div className="min-w-0">
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span className="font-medium text-slate-700">{label}</span>
      <span>{fmt(pct, "%")}</span>
    </div>
    <div className="mt-1.5 h-2 w-full rounded-full bg-slate-100">
      <div
        className={`h-2 rounded-full transition-all ${gaugeColor(pct)}`}
        style={{ width: `${isFiniteNumber(pct) ? Math.min(pct, 100) : 0}%` }}
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
  const hasSystemMetrics =
    !!meta &&
    (isFiniteNumber(meta.cpuUsedPct) ||
      isFiniteNumber(meta.memUsedPct) ||
      (Array.isArray(meta.disks) && meta.disks.length > 0));
  const loadDetail =
    isFiniteNumber(meta?.load1) && isFiniteNumber(meta?.load5) && isFiniteNumber(meta?.load15)
      ? ` · load ${meta.load1.toFixed(2)} / ${meta.load5.toFixed(2)} / ${meta.load15.toFixed(2)}`
      : "";
  const vendor = detectVendor(device, meta);
  const badgeText =
    vendor?.name?.slice(0, 2).toUpperCase() ||
    (device.type === "SYSTEM" ? "SV" : "NW");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {vendor ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
              <img
                alt={`${vendor.name} logo`}
                className="h-full w-full object-contain"
                src={vendor.logoUrl}
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
              {badgeText}
            </div>
          )}

          <div className="min-w-0">
            <Link
              to={`/monitors/${device.id}`}
              className="truncate font-semibold text-slate-950 hover:text-cyan-600"
            >
              {device.name}
            </Link>
            <p className="mt-0.5 text-sm text-slate-400">{host}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {device.type}
              </span>
              {vendor ? (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                  {vendor.name}
                </span>
              ) : null}
            </div>
          </div>
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
          {meta.osDescr ? (
            <p className="truncate text-xs text-slate-400" title={meta.osDescr}>
              {meta.osDescr}
            </p>
          ) : null}
          {meta.uptimeSeconds !== undefined ? (
            <p className="text-xs text-slate-500">
              Uptime <span className="font-medium text-slate-700">{fmtUptime(meta.uptimeSeconds)}</span>
            </p>
          ) : null}
          {hasSystemMetrics ? (
            <>
              <Gauge
                label="CPU"
                pct={meta.cpuUsedPct}
                detail={`${fmt(meta.cpuUsedPct, "% used")}${loadDetail}`}
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
            </>
          ) : (
            <div className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-400">
              ยังไม่มี metrics CPU/RAM/Disk สำหรับอุปกรณ์นี้
            </div>
          )}
          {meta.interfaces?.length ? (
            <div>
              <p className="text-xs font-medium text-slate-700">Interfaces</p>
              <div className="mt-2 space-y-1">
                {meta.interfaces.slice(0, 3).map((iface) => (
                  <div
                    key={iface.name}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500"
                  >
                    <span className="truncate font-medium text-slate-700">{iface.name}</span>
                    <span>
                      RX {isFiniteNumber(iface.inOctets) ? iface.inOctets.toLocaleString() : "-"} · TX{" "}
                      {isFiniteNumber(iface.outOctets) ? iface.outOctets.toLocaleString() : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
  const { api } = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupFilter, setGroupFilter] = useState<"ALL" | string>(() => {
    const groupId = searchParams.get("groupId")?.trim();
    return groupId ? groupId : "ALL";
  });
  const [loading, setLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    setLoading(true);

    try {
      const [monitorsResponse, groupsResponse] = await Promise.all([
        api.get<ApiResponse<Device[]>>("/monitors", {
          params: { groupId: groupFilter === "ALL" ? undefined : groupFilter },
        }),
        api.get<ApiResponse<GroupOption[]>>("/groups"),
      ]);
      const items = (monitorsResponse.data.data ?? []).filter(
        (device) => device.type === "SYSTEM" || device.type === "SNMP",
      );
      setGroups(groupsResponse.data.data ?? []);
      setDevices(items as Device[]);
    } finally {
      setLoading(false);
    }
  }, [api, groupFilter]);

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

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

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
            SNMP devices และ system monitors สำหรับดู CPU, RAM, Disk และ traffic counters
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Group</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="ALL">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-slate-500">
            ใช้ group ช่วยแยกดูอุปกรณ์ตาม site, tenant, หรือบทบาทของระบบได้โดยไม่ต้องปนกันทั้ง inventory
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <p className="col-span-full text-sm text-slate-400">กำลังโหลด...</p>
        ) : devices.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-medium text-slate-700">ยังไม่มี device</p>
            <p className="mt-1 text-sm text-slate-400">
              สร้าง monitor ประเภท SYSTEM แล้วระบบจะดึงข้อมูล CPU/RAM/Disk ผ่าน SNMP
              หรือใช้ SNMP monitor เพื่อเก็บข้อมูล device identity และ interface counters
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
