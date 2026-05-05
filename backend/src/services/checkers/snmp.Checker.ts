import * as snmp from "net-snmp";

const SYS_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
};

export interface SnmpConfig {
  host: string;
  port?: number;
  community?: string;
  version?: "1" | "2c";
  timeoutMs?: number;
  oids?: string[];
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

const snmpVersion = (v?: string) =>
  v === "1" ? snmp.Version1 : snmp.Version2c;

const formatUptime = (timeticks: number) => {
  const totalSeconds = Math.floor(timeticks / 100);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
};

export async function snmpCheck(config: SnmpConfig): Promise<CheckResult> {
  const timeout = config.timeoutMs ?? 5000;
  const start = Date.now();
  const targetOids = config.oids?.length
    ? config.oids
    : Object.values(SYS_OIDS);

  const session = snmp.createSession(config.host, config.community ?? "public", {
    port: config.port ?? 161,
    version: snmpVersion(config.version),
    timeout,
    retries: 1,
  });

  return new Promise<CheckResult>((resolve) => {
    session.get(targetOids, (error: Error | null, varbinds: snmp.Varbind[] | undefined) => {
      const responseTimeMs = Date.now() - start;
      session.close();

      if (error) {
        resolve({
          status: "DOWN",
          responseTimeMs,
          message: error.message,
          metadata: { host: config.host },
        });
        return;
      }

      const metadata: Record<string, unknown> = { host: config.host };
      const issues: string[] = [];

      for (const vb of varbinds ?? []) {
        if (snmp.isVarbindError(vb)) {
          issues.push(`OID ${vb.oid}: ${snmp.varbindError(vb)}`);
          continue;
        }

        const oidKey = Object.entries(SYS_OIDS).find(([, v]) => v === vb.oid)?.[0] ?? vb.oid;

        if (vb.oid === SYS_OIDS.sysUpTime) {
          const ticks = vb.value as number;
          metadata[oidKey] = formatUptime(ticks);
        } else {
          metadata[oidKey] = vb.value?.toString() ?? "";
        }
      }

      resolve({
        status: issues.length > 0 ? "DEGRADED" : "UP",
        responseTimeMs,
        message: issues.length > 0 ? issues.join(" | ") : undefined,
        metadata,
      });
    });
  });
}
