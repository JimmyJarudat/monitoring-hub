import * as snmp from "net-snmp";

const OIDS = {
  cpuIdle: "1.3.6.1.4.1.2021.11.11.0",
  memTotal: "1.3.6.1.4.1.2021.4.5.0",
  memFree: "1.3.6.1.4.1.2021.4.6.0",
  memBuffer: "1.3.6.1.4.1.2021.4.14.0",
  memCached: "1.3.6.1.4.1.2021.4.15.0",
};

const DISK_STORAGE_TYPE_OID = "1.3.6.1.2.1.25.2.1.4"; // hrStorageFixedDisk
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
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

const snmpVersion = (v?: string) =>
  v === "1" ? snmp.Version1 : snmp.Version2c;

const snmpGet = (
  session: snmp.Session,
  oids: string[],
): Promise<snmp.Varbind[]> =>
  new Promise((resolve, reject) => {
    session.get(oids, (err: Error | null, vbs: snmp.Varbind[] | undefined) => {
      if (err) return reject(err);
      resolve(vbs ?? []);
    });
  });

const snmpSubtreeWalk = (
  session: snmp.Session,
  oid: string,
): Promise<snmp.Varbind[]> =>
  new Promise((resolve) => {
    const results: snmp.Varbind[] = [];
    session.subtree(
      oid,
      20,
      (vbs: snmp.Varbind[]) => {
        for (const vb of vbs) {
          if (!snmp.isVarbindError(vb)) results.push(vb);
        }
      },
      () => resolve(results),
    );
  });

const valOf = (vbs: snmp.Varbind[], oid: string): number => {
  const vb = vbs.find((v) => v.oid === oid);
  return vb ? Number(vb.value) : 0;
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

    const cpuUsedPct = Math.round((100 - cpuIdle) * 10) / 10;
    const memUsedKb = memTotal - memFree - memBuffer - memCached;
    const memUsedPct =
      memTotal > 0 ? Math.round((memUsedKb / memTotal) * 1000) / 10 : 0;

    const [descrVbs, allocVbs, sizeVbs, usedVbs] = await Promise.all([
      snmpSubtreeWalk(session, DISK_DESCR_OID),
      snmpSubtreeWalk(session, DISK_ALLOC_OID),
      snmpSubtreeWalk(session, DISK_SIZE_OID),
      snmpSubtreeWalk(session, DISK_USED_OID),
    ]);

    const disks: DiskInfo[] = [];
    for (const descrVb of descrVbs) {
      const idx = descrVb.oid.split(".").pop();
      if (!idx) continue;
      const descr = descrVb.value?.toString() ?? "";
      if (!descr.startsWith("/") || descr.startsWith("/dev")) continue;

      const allocUnit = Number(allocVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 1);
      const size = Number(sizeVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 0);
      const used = Number(usedVbs.find((v) => v.oid.endsWith(`.${idx}`))?.value ?? 0);

      const totalKb = Math.round((size * allocUnit) / 1024);
      const usedKb = Math.round((used * allocUnit) / 1024);
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
    };

    return {
      status: warnings.length > 0 ? "DEGRADED" : "UP",
      responseTimeMs,
      message: warnings.length > 0 ? `High usage: ${warnings.join(", ")}` : undefined,
      metadata: { host: config.host, ...metrics, disks },
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
