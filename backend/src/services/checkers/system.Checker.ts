import * as snmp from "net-snmp";
import type { DeviceMetricSample } from "./metric.types";
import { collectInterfaceMetrics, safeNumber, snmpGet, snmpSubtreeWalk, snmpVersion } from "./snmp.shared";

const OIDS = {
  cpuIdle: "1.3.6.1.4.1.2021.11.11.0",
  memTotal: "1.3.6.1.4.1.2021.4.5.0",
  memFree: "1.3.6.1.4.1.2021.4.6.0",
  memBuffer: "1.3.6.1.4.1.2021.4.14.0",
  memCached: "1.3.6.1.4.1.2021.4.15.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysDescr: "1.3.6.1.2.1.1.1.0",
  load1: "1.3.6.1.4.1.2021.10.1.3.1",
  load5: "1.3.6.1.4.1.2021.10.1.3.2",
  load15: "1.3.6.1.4.1.2021.10.1.3.3",
};

const DISK_TABLE_BASE = "1.3.6.1.2.1.25.2.3.1";
const DISK_DESCR_OID = `${DISK_TABLE_BASE}.3`;
const DISK_ALLOC_OID = `${DISK_TABLE_BASE}.4`;
const DISK_SIZE_OID = `${DISK_TABLE_BASE}.5`;
const DISK_USED_OID = `${DISK_TABLE_BASE}.6`;

export interface SystemConfig {
  host: string;
  port?: number;
  community?: string;
  version?: "1" | "2c";
  timeoutMs?: number;
}

export interface DiskInfo {
  mount: string;
  totalKb: number;
  usedKb: number;
  usedPct: number;
}

export interface SystemMetrics {
  cpuUsedPct: number;
  memTotalKb: number;
  memUsedKb: number;
  memUsedPct: number;
  disks: DiskInfo[];
  load1?: number;
  load5?: number;
  load15?: number;
  uptimeSeconds?: number;
  osDescr?: string;
  interfaces?: Array<{
    name: string;
    operStatus: number;
    inOctets: number;
    outOctets: number;
    inDiscards: number;
    inErrors: number;
    outDiscards: number;
    outErrors: number;
  }>;
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  metrics?: DeviceMetricSample[];
}

const valOf = (vbs: snmp.Varbind[], oid: string): number => {
  const vb = vbs.find((v) => v.oid === oid);
  return vb ? safeNumber(vb.value) : 0;
};

export async function systemCheck(config: SystemConfig): Promise<CheckResult> {
  const start = Date.now();
  const session = snmp.createSession(config.host, config.community ?? "public", {
    port: config.port ?? 161,
    version: snmpVersion(config.version),
    timeout: config.timeoutMs ?? 8000,
    retries: 1,
  });

  try {
    const baseVbs = await snmpGet(session, Object.values(OIDS));
    const responseTimeMs = Date.now() - start;

    const cpuIdle = valOf(baseVbs, OIDS.cpuIdle);
    const memTotal = valOf(baseVbs, OIDS.memTotal);
    const memFree = valOf(baseVbs, OIDS.memFree);
    const memBuffer = valOf(baseVbs, OIDS.memBuffer);
    const memCached = valOf(baseVbs, OIDS.memCached);
    const sysUpTimeTicks = valOf(baseVbs, OIDS.sysUpTime);
    const sysDescrVb = baseVbs.find((v) => v.oid === OIDS.sysDescr);
    const load1Vb = baseVbs.find((v) => v.oid === OIDS.load1);
    const load5Vb = baseVbs.find((v) => v.oid === OIDS.load5);
    const load15Vb = baseVbs.find((v) => v.oid === OIDS.load15);

    const cpuUsedPct = Math.round((100 - cpuIdle) * 10) / 10;
    const memUsedKb = memTotal - memFree - memBuffer - memCached;
    const memUsedPct =
      memTotal > 0 ? Math.round((memUsedKb / memTotal) * 1000) / 10 : 0;
    const uptimeSeconds = sysUpTimeTicks > 0 ? Math.floor(sysUpTimeTicks / 100) : undefined;
    const osDescr = sysDescrVb?.value?.toString().split("\n")[0]?.trim() || undefined;
    const load1 = load1Vb ? parseFloat(load1Vb.value?.toString() ?? "") : undefined;
    const load5 = load5Vb ? parseFloat(load5Vb.value?.toString() ?? "") : undefined;
    const load15 = load15Vb ? parseFloat(load15Vb.value?.toString() ?? "") : undefined;

    const [descrVbs, allocVbs, sizeVbs, usedVbs, interfaces] = await Promise.all([
      snmpSubtreeWalk(session, DISK_DESCR_OID),
      snmpSubtreeWalk(session, DISK_ALLOC_OID),
      snmpSubtreeWalk(session, DISK_SIZE_OID),
      snmpSubtreeWalk(session, DISK_USED_OID),
      collectInterfaceMetrics(session),
    ]);

    const DISK_EXCLUDE = [
      /docker/i,
      /^\/run/,
      /^\/sys/,
      /^\/proc/,
      /^\/snap/,
      /^\/dev/,
      /overlay/i,
      /^\/var\/lib\/lxc/,
    ];

    const disks: DiskInfo[] = [];
    for (const descrVb of descrVbs) {
      const idx = descrVb.oid.split(".").pop();
      if (!idx) continue;
      const descr = descrVb.value?.toString() ?? "";
      if (!descr.startsWith("/")) continue;
      if (DISK_EXCLUDE.some((re) => re.test(descr))) continue;

      const allocUnit = Number(allocVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 1);
      const size = Number(sizeVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 0);
      const used = Number(usedVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 0);

      const totalKb = Math.round((size * allocUnit) / 1024);
      const usedKb = Math.round((used * allocUnit) / 1024);

      if (totalKb < 50 * 1024) continue;

      const usedPct = totalKb > 0 ? Math.round((usedKb / totalKb) * 1000) / 10 : 0;

      disks.push({ mount: descr, totalKb, usedKb, usedPct });
    }

    const warnings: string[] = [];
    if (cpuUsedPct >= 90) warnings.push(`CPU ${cpuUsedPct}%`);
    if (memUsedPct >= 90) warnings.push(`RAM ${memUsedPct}%`);
    for (const d of disks) {
      if (d.usedPct >= 90) warnings.push(`Disk ${d.mount} ${d.usedPct}%`);
    }

    const metrics: SystemMetrics = {
      cpuUsedPct,
      memTotalKb: memTotal,
      memUsedKb,
      memUsedPct,
      disks,
      ...(interfaces.length > 0 ? { interfaces } : {}),
      ...(uptimeSeconds !== undefined ? { uptimeSeconds } : {}),
      ...(osDescr ? { osDescr } : {}),
      ...(!Number.isNaN(load1) && load1 !== undefined ? { load1 } : {}),
      ...(!Number.isNaN(load5) && load5 !== undefined ? { load5 } : {}),
      ...(!Number.isNaN(load15) && load15 !== undefined ? { load15 } : {}),
    };

    const metricSamples: DeviceMetricSample[] = [
      { metricGroup: "SYSTEM", metricKey: "cpu.used_pct", value: cpuUsedPct, unit: "percent" },
      { metricGroup: "SYSTEM", metricKey: "memory.used_pct", value: memUsedPct, unit: "percent" },
      { metricGroup: "SYSTEM", metricKey: "memory.used_kb", value: memUsedKb, unit: "kb" },
      { metricGroup: "SYSTEM", metricKey: "memory.total_kb", value: memTotal, unit: "kb" },
    ];

    if (uptimeSeconds !== undefined) {
      metricSamples.push({
        metricGroup: "SYSTEM",
        metricKey: "system.uptime_seconds",
        value: uptimeSeconds,
        unit: "seconds",
      });
    }

    for (const loadMetric of [
      { key: "system.load1", value: load1 },
      { key: "system.load5", value: load5 },
      { key: "system.load15", value: load15 },
    ]) {
      if (typeof loadMetric.value === "number" && !Number.isNaN(loadMetric.value)) {
        metricSamples.push({
          metricGroup: "SYSTEM",
          metricKey: loadMetric.key,
          value: loadMetric.value,
          unit: "load",
        });
      }
    }

    for (const disk of disks) {
      metricSamples.push(
        {
          metricGroup: "DISK",
          metricKey: "disk.used_pct",
          instance: disk.mount,
          value: disk.usedPct,
          unit: "percent",
        },
        {
          metricGroup: "DISK",
          metricKey: "disk.used_kb",
          instance: disk.mount,
          value: disk.usedKb,
          unit: "kb",
        },
        {
          metricGroup: "DISK",
          metricKey: "disk.total_kb",
          instance: disk.mount,
          value: disk.totalKb,
          unit: "kb",
        },
      );
    }

    for (const iface of interfaces) {
      metricSamples.push(
        {
          metricGroup: "NET",
          metricKey: "net.in_octets",
          instance: iface.name,
          value: iface.inOctets,
          unit: "bytes",
        },
        {
          metricGroup: "NET",
          metricKey: "net.out_octets",
          instance: iface.name,
          value: iface.outOctets,
          unit: "bytes",
        },
        {
          metricGroup: "NET",
          metricKey: "net.in_discards",
          instance: iface.name,
          value: iface.inDiscards,
          unit: "count",
        },
        {
          metricGroup: "NET",
          metricKey: "net.in_errors",
          instance: iface.name,
          value: iface.inErrors,
          unit: "count",
        },
        {
          metricGroup: "NET",
          metricKey: "net.out_discards",
          instance: iface.name,
          value: iface.outDiscards,
          unit: "count",
        },
        {
          metricGroup: "NET",
          metricKey: "net.out_errors",
          instance: iface.name,
          value: iface.outErrors,
          unit: "count",
        },
        {
          metricGroup: "NET",
          metricKey: "net.oper_status",
          instance: iface.name,
          value: iface.operStatus,
          unit: "state",
        },
      );
    }

    return {
      status: warnings.length > 0 ? "DEGRADED" : "UP",
      responseTimeMs,
      message: warnings.length > 0 ? `High usage: ${warnings.join(", ")}` : undefined,
      metadata: { host: config.host, ...metrics, disks },
      metrics: metricSamples,
    };
  } catch (err) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: err instanceof Error ? err.message : "SNMP error",
      metadata: { host: config.host },
    };
  } finally {
    session.close();
  }
}
