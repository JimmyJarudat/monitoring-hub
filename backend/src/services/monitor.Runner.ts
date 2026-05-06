import type { Credential, Monitor } from "../generated/prisma/client";
import type { MonitorStatus, MonitorType } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import type { DeviceMetricSample } from "./checkers/metric.types";
import { databaseCheck } from "./checkers/database.Checker";
import { dnsCheck } from "./checkers/dns.Checker";
import { snmpCheck } from "./checkers/snmp.Checker";
import { systemCheck } from "./checkers/system.Checker";
import { dockerCheck } from "./checkers/docker.Checker";
import { httpCheck } from "./checkers/http.Checker";
import { pingCheck } from "./checkers/ping.Checker";
import { tcpCheck } from "./checkers/tcp.Checker";
import { tlsCheck } from "./checkers/tls.Checker";

type CheckResult = {
  status: MonitorStatus;
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  metrics?: DeviceMetricSample[];
};

const TICK_MS = 5_000;
const DEFAULT_INTERVAL_SECONDS = 60;

const lastCheckedAt = new Map<string, number>();
const inFlight = new Set<string>();

let timer: ReturnType<typeof setInterval> | null = null;

const isConfigObject = (value: unknown): value is Prisma.InputJsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const resolveConfigWithCredential = (
  type: MonitorType,
  config: Prisma.InputJsonObject,
  credential: Credential | null,
) => {
  if (!credential) return config;

  const metadata =
    credential.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
      ? (credential.metadata as Prisma.InputJsonObject)
      : {};

  if ((type === "SNMP" || type === "SYSTEM") && credential.type === "SNMP_COMMUNITY") {
    return {
      ...config,
      community: credential.secret,
      ...(metadata.version ? { version: metadata.version } : {}),
      ...(metadata.port ? { port: metadata.port } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "HTTP" && config.authType === "basic" && credential.type === "USERNAME_PASSWORD") {
    return {
      ...config,
      authUsername: credential.username ?? config.authUsername,
      authPassword: credential.secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "HTTP" && config.authType === "bearer" && credential.type === "API_TOKEN") {
    return {
      ...config,
      authToken: credential.secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "DOCKER" && credential.type === "API_TOKEN") {
    return {
      ...config,
      apiKey: credential.secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "DATABASE" && config.type !== "sqlite" && credential.type === "USERNAME_PASSWORD") {
    return {
      ...config,
      user: credential.username ?? config.user,
      password: credential.secret,
      ...(config.type === "mongodb" && metadata.authSource ? { authSource: metadata.authSource } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  return config;
};

const runChecker = async (
  type: MonitorType,
  config: Prisma.InputJsonObject,
): Promise<CheckResult> => {
  switch (type) {
    case "PING":
      return pingCheck(config as unknown as Parameters<typeof pingCheck>[0]);
    case "TCP":
      return tcpCheck(config as unknown as Parameters<typeof tcpCheck>[0]);
    case "HTTP":
      return httpCheck(config as unknown as Parameters<typeof httpCheck>[0]);
    case "TLS_CERT":
      return tlsCheck(config as unknown as Parameters<typeof tlsCheck>[0]);
    case "DNS":
      return dnsCheck(config as unknown as Parameters<typeof dnsCheck>[0]);
    case "SNMP":
      return snmpCheck(config as unknown as Parameters<typeof snmpCheck>[0]);
    case "SYSTEM":
      return systemCheck(config as unknown as Parameters<typeof systemCheck>[0]);
    case "DOCKER":
      return dockerCheck(config as unknown as Parameters<typeof dockerCheck>[0]);
    case "DATABASE":
      return databaseCheck(config as unknown as Parameters<typeof databaseCheck>[0]);
    default:
      return { status: "DOWN", message: `ไม่รองรับ monitor type: ${type}` };
  }
};

const reconcileIncident = async (
  monitor: Monitor,
  result: {
    status: MonitorStatus;
    message: string | null;
    checkedAt: Date;
  },
) => {
  const openIncident = await prisma.incident.findFirst({
    where: {
      monitorId: monitor.id,
      status: "OPEN",
    },
    orderBy: { startedAt: "desc" },
  });

  if (result.status === "UP") {
    if (!openIncident) return;

    await prisma.incident.update({
      where: { id: openIncident.id },
      data: {
        status: "RESOLVED",
        resolvedAt: result.checkedAt,
        message: result.message ?? openIncident.message,
      },
    });
    return;
  }

  if (openIncident) {
    await prisma.incident.update({
      where: { id: openIncident.id },
      data: {
        message: result.message ?? openIncident.message,
      },
    });
    return;
  }

  await prisma.incident.create({
    data: {
      monitorId: monitor.id,
      status: "OPEN",
      message: result.message ?? `Monitor ${monitor.name} reported ${result.status}`,
      startedAt: result.checkedAt,
    },
  });
};

export const runMonitorCheck = async (monitor: Monitor) => {
  if (!isConfigObject(monitor.config)) {
    const createdResult = await prisma.monitorResult.create({
      data: {
        monitorId: monitor.id,
        status: "DOWN",
        message: "config ต้องเป็น object",
      },
    });

    await reconcileIncident(monitor, {
      status: createdResult.status,
      message: createdResult.message,
      checkedAt: createdResult.checkedAt,
    });

    return createdResult;
  }

  const credential = monitor.credentialId
    ? await prisma.credential.findUnique({
        where: { id: monitor.credentialId },
      })
    : null;

  if (monitor.credentialId && !credential) {
    const createdResult = await prisma.monitorResult.create({
      data: {
        monitorId: monitor.id,
        status: "DOWN",
        message: "credential ที่ผูกไว้ถูกลบหรือไม่พบแล้ว",
      },
    });

    await reconcileIncident(monitor, {
      status: createdResult.status,
      message: createdResult.message,
      checkedAt: createdResult.checkedAt,
    });

    return createdResult;
  }

  const resolvedConfig = resolveConfigWithCredential(monitor.type, monitor.config, credential);
  const result = await runChecker(monitor.type, resolvedConfig);

  const createdResult = await prisma.$transaction(async (tx) => {
    const monitorResult = await tx.monitorResult.create({
      data: {
        monitorId: monitor.id,
        status: result.status,
        responseTimeMs: result.responseTimeMs,
        message: result.message,
        metadata: result.metadata as Prisma.InputJsonObject | undefined,
      },
    });

    const metricRows = (result.metrics ?? []).filter(
      (metric) =>
        Number.isFinite(metric.value) &&
        metric.metricKey.trim().length > 0 &&
        metric.unit.trim().length > 0,
    );

    if (metricRows.length > 0) {
      await tx.deviceMetricSample.createMany({
        data: metricRows.map((metric) => ({
          monitorId: monitor.id,
          metricGroup: metric.metricGroup,
          metricKey: metric.metricKey,
          instance: metric.instance,
          value: metric.value,
          unit: metric.unit,
          collectedAt: monitorResult.checkedAt,
        })),
      });
    }

    return monitorResult;
  });

  await reconcileIncident(monitor, {
    status: createdResult.status,
    message: createdResult.message,
    checkedAt: createdResult.checkedAt,
  });

  return createdResult;
};

const shouldRun = (monitor: Monitor, now: number) => {
  const intervalMs = (monitor.interval || DEFAULT_INTERVAL_SECONDS) * 1000;
  const lastRun = lastCheckedAt.get(monitor.id);

  return !lastRun || now - lastRun >= intervalMs;
};

const checkDueMonitor = async (monitor: Monitor, now: number) => {
  if (inFlight.has(monitor.id) || !shouldRun(monitor, now)) {
    return;
  }

  inFlight.add(monitor.id);

  try {
    await runMonitorCheck(monitor);
    lastCheckedAt.set(monitor.id, Date.now());
  } catch (error) {
    console.error(`[monitor] check failed: ${monitor.id}`, error);
  } finally {
    inFlight.delete(monitor.id);
  }
};

const tick = async () => {
  const monitors = await prisma.monitor.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });
  const now = Date.now();

  await Promise.all(monitors.map((monitor) => checkDueMonitor(monitor, now)));
};

export const monitorRunner = {
  start() {
    if (timer) return;

    timer = setInterval(() => {
      void tick().catch((error) => {
        console.error("[monitor] scheduler tick failed", error);
      });
    }, TICK_MS);

    void tick().catch((error) => {
      console.error("[monitor] initial tick failed", error);
    });

    console.log("[monitor] runner started");
  },

  stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    console.log("[monitor] runner stopped");
  },
};
