import * as snmp from "net-snmp";
import type { DeviceMetricSample } from "./metric.types";
import { collectInterfaceMetrics, snmpGet, snmpVersion } from "./snmp.shared";

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
  metrics?: DeviceMetricSample[];
}

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

  try {
    const [varbinds, interfaces] = await Promise.all([
      snmpGet(session, targetOids),
      collectInterfaceMetrics(session),
    ]);
    const responseTimeMs = Date.now() - start;
    const metadata: Record<string, unknown> = { host: config.host };
    const issues: string[] = [];
    const metrics: DeviceMetricSample[] = [];

    for (const vb of varbinds ?? []) {
      if (snmp.isVarbindError(vb)) {
        issues.push(`OID ${vb.oid}: ${snmp.varbindError(vb)}`);
        continue;
      }

      const oidKey = Object.entries(SYS_OIDS).find(([, v]) => v === vb.oid)?.[0] ?? vb.oid;

      if (vb.oid === SYS_OIDS.sysUpTime) {
        const ticks = Number(vb.value);
        const uptimeSeconds = Math.floor(ticks / 100);
        metadata[oidKey] = formatUptime(ticks);
        metrics.push({
          metricGroup: "SYSTEM",
          metricKey: "system.uptime_seconds",
          value: uptimeSeconds,
          unit: "seconds",
        });
      } else {
        metadata[oidKey] = vb.value?.toString() ?? "";
      }
    }

    if (interfaces.length > 0) {
      metadata.interfaces = interfaces.map((iface) => ({
        name: iface.name,
        operStatus: iface.operStatus,
        inOctets: iface.inOctets,
        outOctets: iface.outOctets,
        inDiscards: iface.inDiscards,
        inErrors: iface.inErrors,
        outDiscards: iface.outDiscards,
        outErrors: iface.outErrors,
      }));

      for (const iface of interfaces) {
        metrics.push(
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
    }

    return {
      status: issues.length > 0 ? "DEGRADED" : "UP",
      responseTimeMs,
      message: issues.length > 0 ? issues.join(" | ") : undefined,
      metadata,
      metrics,
    };
  } catch (error) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: error instanceof Error ? error.message : "SNMP error",
      metadata: { host: config.host },
    };
  } finally {
    session.close();
  }
}
