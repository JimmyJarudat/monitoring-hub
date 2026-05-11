import type { AlertRule, Credential, Monitor } from "../generated/prisma/client";
import type { MonitorStatus, MonitorType } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import { decryptCredentialSecret } from "../lib/credentialSecret";
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
import { notifyIncidentEscalation, notifyIncidentReminder, notifyIncidentTransition } from "./notification.service";
import { getSystemConfig } from "./systemConfig.service";
import { logger } from "../lib/logger";

type CheckResult = {
  status: MonitorStatus;
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  metrics?: DeviceMetricSample[];
};
type ThresholdConfig = {
  cpuPct?: number;
  ramPct?: number;
  diskPct?: number;
};
type RuleEvaluationInput = {
  status: MonitorStatus;
  responseTimeMs: number | null;
  message: string | null;
  metadata?: Record<string, unknown>;
  checkedAt: Date;
};

const TICK_MS = 5_000;
const DEFAULT_INTERVAL_SECONDS = 60;

const lastCheckedAt = new Map<string, number>();
const inFlight = new Set<string>();

let timer: ReturnType<typeof setInterval> | null = null;

const isConfigObject = (value: unknown): value is Prisma.InputJsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const STATUS_INCIDENT_PREFIX = "[STATUS]";
const THRESHOLD_INCIDENT_PREFIX = "[THRESHOLD]";
const RULE_INCIDENT_PREFIX = "[RULE]";
const INCIDENT_ESCALATION_ACTION = "INCIDENT_ESCALATION_SENT";
const INCIDENT_REMINDER_ACTION = "INCIDENT_REMINDER_SENT";
const ESCALATION_LEVELS = [
  { level: 1, multiplier: 2 },
  { level: 2, multiplier: 4 },
  { level: 3, multiplier: 8 },
] as const;

let _reminderConfigCache: { hours: number; fetchedAt: number } = { hours: 24, fetchedAt: 0 };
const REMINDER_CONFIG_TTL_MS = 5 * 60 * 1000;

const getReminderIntervalMs = async (): Promise<number> => {
  const now = Date.now();
  if (now - _reminderConfigCache.fetchedAt < REMINDER_CONFIG_TTL_MS) {
    return _reminderConfigCache.hours * 3_600_000;
  }
  try {
    const cfg = await getSystemConfig();
    _reminderConfigCache = { hours: cfg.alerting.incidentReminderIntervalHours, fetchedAt: now };
  } catch {
    _reminderConfigCache.fetchedAt = now;
  }
  return _reminderConfigCache.hours * 3_600_000;
};

const statusToValue = (status: MonitorStatus) => {
  if (status === "UP") return 3;
  if (status === "DEGRADED") return 2;
  return 1;
};

const formatMetricLabel = (metric: string) => {
  const labels: Record<string, string> = {
    status: "Status",
    response_time: "Response time",
    "cpu.used_pct": "CPU",
    "memory.used_pct": "RAM",
    "disk.used_pct": "Disk",
  };
  return labels[metric] ?? metric;
};

const formatRuleValue = (metric: string, value: number) => {
  if (metric === "status") {
    if (value === 3) return "UP";
    if (value === 2) return "DEGRADED";
    if (value === 1) return "DOWN";
  }
  if (metric === "response_time") return `${Math.round(value)} ms`;
  if (metric.endsWith("_pct")) return `${value.toFixed(1)}%`;
  return String(value);
};

const getMetricValue = (rule: AlertRule, input: RuleEvaluationInput) => {
  if (rule.metric === "status") return statusToValue(input.status);
  if (rule.metric === "response_time") return input.responseTimeMs;

  const metadata = input.metadata;
  if (!metadata) return null;

  if (rule.metric === "cpu.used_pct") {
    return typeof metadata.cpuUsedPct === "number" ? metadata.cpuUsedPct : null;
  }

  if (rule.metric === "memory.used_pct") {
    return typeof metadata.memUsedPct === "number" ? metadata.memUsedPct : null;
  }

  if (rule.metric === "disk.used_pct") {
    const disks = Array.isArray(metadata.disks) ? metadata.disks : [];
    const highestDisk = disks.reduce((max, disk) => {
      const usedPct = isConfigObject(disk) && typeof disk.usedPct === "number" ? disk.usedPct : null;
      return usedPct !== null && usedPct > max ? usedPct : max;
    }, -1);
    return highestDisk >= 0 ? highestDisk : null;
  }

  return null;
};

const evaluateOperator = (actual: number, operator: AlertRule["operator"], threshold: number) => {
  if (operator === "GT") return actual > threshold;
  if (operator === "LT") return actual < threshold;
  if (operator === "EQ") return actual === threshold;
  if (operator === "NEQ") return actual !== threshold;
  return false;
};

const buildRuleMessage = (rule: AlertRule, actual: number, sourceMessage: string | null) => {
  const metricLabel = formatMetricLabel(rule.metric);
  const current = formatRuleValue(rule.metric, actual);
  const threshold = formatRuleValue(rule.metric, rule.threshold);
  const details = sourceMessage ? ` (${sourceMessage})` : "";
  return `${RULE_INCIDENT_PREFIX} ${rule.severity} ${metricLabel}: ${current} ${rule.operator} ${threshold}${details}`;
};

const shouldSendIncidentReminder = async (
  incidentId: string,
  incidentStartedAt: Date,
  checkedAt: Date,
) => {
  const lastReminder = await prisma.auditLog.findFirst({
    where: {
      action: INCIDENT_REMINDER_ACTION,
      entity: "Incident",
      entityId: incidentId,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const lastSentAt = lastReminder?.createdAt ?? incidentStartedAt;
  const intervalMs = await getReminderIntervalMs();
  return checkedAt.getTime() - lastSentAt.getTime() >= intervalMs;
};

const getAuditNumber = (value: unknown, key: string) => {
  if (!isConfigObject(value)) return null;
  const raw = value[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getSentEscalationLevels = async (incidentId: string) => {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: INCIDENT_ESCALATION_ACTION,
      entity: "Incident",
      entityId: incidentId,
    },
    select: { newValue: true },
  });

  return new Set(
    logs
      .map((log) => getAuditNumber(log.newValue, "level"))
      .filter((level): level is number => level !== null),
  );
};

const getDueEscalationLevel = async (
  incidentId: string,
  incidentStartedAt: Date,
  checkedAt: Date,
) => {
  const intervalMs = await getReminderIntervalMs();
  const openMs = checkedAt.getTime() - incidentStartedAt.getTime();
  const sentLevels = await getSentEscalationLevels(incidentId);

  return ESCALATION_LEVELS.find(
    (item) => openMs >= intervalMs * item.multiplier && !sentLevels.has(item.level),
  );
};

const notifyIncidentEscalationIfDue = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  incidentStartedAt: Date;
  checkedAt: Date;
  message: string | null;
}) => {
  const escalation = await getDueEscalationLevel(
    params.incidentId,
    params.incidentStartedAt,
    params.checkedAt,
  );
  if (!escalation) return;

  const message = `[ESCALATION L${escalation.level}] ${params.message ?? "Incident is still open"}`;
  await notifyIncidentEscalation({
    monitor: params.monitor,
    incidentId: params.incidentId,
    alertRuleId: params.alertRuleId,
    message,
  });
  await prisma.auditLog.create({
    data: {
      action: INCIDENT_ESCALATION_ACTION,
      entity: "Incident",
      entityId: params.incidentId,
      newValue: {
        monitorId: params.monitor.id,
        alertRuleId: params.alertRuleId ?? null,
        level: escalation.level,
        multiplier: escalation.multiplier,
        message,
      },
    },
  });
};

const notifyIncidentReminderIfDue = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  incidentStartedAt: Date;
  checkedAt: Date;
  message: string | null;
}) => {
  await notifyIncidentEscalationIfDue(params);

  const shouldNotify = await shouldSendIncidentReminder(
    params.incidentId,
    params.incidentStartedAt,
    params.checkedAt,
  );
  if (!shouldNotify) return;

  await notifyIncidentReminder({
    monitor: params.monitor,
    incidentId: params.incidentId,
    alertRuleId: params.alertRuleId,
    message: params.message,
  });
  await prisma.auditLog.create({
    data: {
      action: INCIDENT_REMINDER_ACTION,
      entity: "Incident",
      entityId: params.incidentId,
      newValue: {
        monitorId: params.monitor.id,
        alertRuleId: params.alertRuleId ?? null,
        message: params.message,
      },
    },
  });
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
  const secret = decryptCredentialSecret(credential.secret);

  if ((type === "SNMP" || type === "SYSTEM") && credential.type === "SNMP_COMMUNITY") {
    return {
      ...config,
      community: secret,
      ...(metadata.version ? { version: metadata.version } : {}),
      ...(metadata.port ? { port: metadata.port } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "HTTP" && config.authType === "basic" && credential.type === "USERNAME_PASSWORD") {
    return {
      ...config,
      authUsername: credential.username ?? config.authUsername,
      authPassword: secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "HTTP" && config.authType === "bearer" && credential.type === "API_TOKEN") {
    return {
      ...config,
      authToken: secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "DOCKER" && credential.type === "API_TOKEN") {
    return {
      ...config,
      apiKey: secret,
    } satisfies Prisma.InputJsonObject;
  }

  if (type === "DATABASE" && config.type !== "sqlite" && credential.type === "USERNAME_PASSWORD") {
    return {
      ...config,
      user: credential.username ?? config.user,
      password: secret,
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
      return { status: "DOWN", message: `Unsupported monitor type: ${type}` };
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
  const openStatusIncident = await prisma.incident.findFirst({
    where: {
      monitorId: monitor.id,
      status: "OPEN",
      message: {
        startsWith: STATUS_INCIDENT_PREFIX,
      },
    },
    orderBy: { startedAt: "desc" },
  });

  if (result.status === "UP") {
    if (!openStatusIncident) return;

    const resolvedIncident = await prisma.incident.update({
      where: { id: openStatusIncident.id },
      data: {
        status: "RESOLVED",
        resolvedAt: result.checkedAt,
        message: `${STATUS_INCIDENT_PREFIX} ${result.message ?? "Monitor recovered"}`,
      },
    });
    await notifyIncidentTransition({
      monitor,
      incidentId: resolvedIncident.id,
      alertRuleId: null,
      status: "RESOLVED",
      message: resolvedIncident.message,
    });
    return;
  }

  if (result.status !== "DOWN") {
    return;
  }

  if (openStatusIncident) {
    const updatedIncident = await prisma.incident.update({
      where: { id: openStatusIncident.id },
      data: {
        message: `${STATUS_INCIDENT_PREFIX} ${result.message ?? "Monitor is down"}`,
      },
    });
    await notifyIncidentReminderIfDue({
      monitor,
      incidentId: updatedIncident.id,
      alertRuleId: null,
      incidentStartedAt: updatedIncident.startedAt,
      checkedAt: result.checkedAt,
      message: updatedIncident.message,
    });
    return;
  }

  const createdIncident = await prisma.incident.create({
    data: {
      monitorId: monitor.id,
      status: "OPEN",
      message: `${STATUS_INCIDENT_PREFIX} ${result.message ?? `Monitor ${monitor.name} reported DOWN`}`,
      startedAt: result.checkedAt,
    },
  });
  await notifyIncidentTransition({
    monitor,
    incidentId: createdIncident.id,
    alertRuleId: null,
    status: "OPEN",
    message: createdIncident.message,
  });
};

const reconcileAlertRuleIncidents = async (monitor: Monitor, result: RuleEvaluationInput) => {
  const rules = await prisma.alertRule.findMany({
    where: { monitorId: monitor.id, enabled: true },
    orderBy: [{ createdAt: "asc" }],
  });

  if (rules.length === 0) {
    return false;
  }

  await Promise.all(
    rules.map(async (rule) => {
      const actual = getMetricValue(rule, result);
      const openIncident = await prisma.incident.findFirst({
        where: {
          monitorId: monitor.id,
          alertRuleId: rule.id,
          status: "OPEN",
        },
        orderBy: { startedAt: "desc" },
      });

      const triggered =
        typeof actual === "number" &&
        Number.isFinite(actual) &&
        evaluateOperator(actual, rule.operator, rule.threshold);

      if (!triggered) {
        if (!openIncident) return;

        const resolvedIncident = await prisma.incident.update({
          where: { id: openIncident.id },
          data: {
            status: "RESOLVED",
            resolvedAt: result.checkedAt,
            message: `${RULE_INCIDENT_PREFIX} ${formatMetricLabel(rule.metric)} back to normal`,
          },
        });
        await notifyIncidentTransition({
          monitor,
          incidentId: resolvedIncident.id,
          alertRuleId: rule.id,
          status: "RESOLVED",
          message: resolvedIncident.message,
        });
        return;
      }

      const nextMessage = buildRuleMessage(rule, actual, result.message);
      if (openIncident) {
        const updatedIncident = await prisma.incident.update({
          where: { id: openIncident.id },
          data: { message: nextMessage },
        });
        await notifyIncidentReminderIfDue({
          monitor,
          incidentId: updatedIncident.id,
          alertRuleId: rule.id,
          incidentStartedAt: updatedIncident.startedAt,
          checkedAt: result.checkedAt,
          message: updatedIncident.message,
        });
        return;
      }

      const createdIncident = await prisma.incident.create({
        data: {
          monitorId: monitor.id,
          alertRuleId: rule.id,
          status: "OPEN",
          message: nextMessage,
          startedAt: result.checkedAt,
        },
      });
      await notifyIncidentTransition({
        monitor,
        incidentId: createdIncident.id,
        alertRuleId: rule.id,
        status: "OPEN",
        message: createdIncident.message,
      });
    }),
  );

  return true;
};

const extractThresholdConfig = (config: Prisma.InputJsonObject): ThresholdConfig => {
  const raw = config.alertThresholds;
  if (!isConfigObject(raw)) return {};
  const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  return {
    cpuPct: toNumber(raw.cpuPct),
    ramPct: toNumber(raw.ramPct),
    diskPct: toNumber(raw.diskPct),
  };
};

const evaluateThresholdMessage = (
  metadata: Record<string, unknown> | undefined,
  threshold: ThresholdConfig,
) => {
  if (!metadata) return null;
  const messages: string[] = [];
  const cpu = typeof metadata.cpuUsedPct === "number" ? metadata.cpuUsedPct : null;
  const ram = typeof metadata.memUsedPct === "number" ? metadata.memUsedPct : null;
  const disks = Array.isArray(metadata.disks) ? metadata.disks : [];
  const highestDisk = disks.reduce((max, disk) => {
    const usedPct = isConfigObject(disk) && typeof disk.usedPct === "number" ? disk.usedPct : null;
    return usedPct !== null && usedPct > max ? usedPct : max;
  }, -1);

  if (typeof threshold.cpuPct === "number" && cpu !== null && cpu >= threshold.cpuPct) {
    messages.push(`CPU ${cpu.toFixed(1)}% >= ${threshold.cpuPct}%`);
  }
  if (typeof threshold.ramPct === "number" && ram !== null && ram >= threshold.ramPct) {
    messages.push(`RAM ${ram.toFixed(1)}% >= ${threshold.ramPct}%`);
  }
  if (typeof threshold.diskPct === "number" && highestDisk >= 0 && highestDisk >= threshold.diskPct) {
    messages.push(`Disk ${highestDisk.toFixed(1)}% >= ${threshold.diskPct}%`);
  }

  return messages.length > 0 ? messages.join(" | ") : null;
};

const reconcileThresholdIncident = async (
  monitor: Monitor,
  result: {
    checkedAt: Date;
    metadata?: Record<string, unknown>;
  },
) => {
  if (monitor.type !== "SNMP" && monitor.type !== "SYSTEM") return;
  if (!isConfigObject(monitor.config)) return;
  const threshold = extractThresholdConfig(monitor.config);
  if (
    typeof threshold.cpuPct !== "number" &&
    typeof threshold.ramPct !== "number" &&
    typeof threshold.diskPct !== "number"
  ) {
    return;
  }

  const thresholdMessage = evaluateThresholdMessage(result.metadata, threshold);
  const openThresholdIncident = await prisma.incident.findFirst({
    where: {
      monitorId: monitor.id,
      status: "OPEN",
      message: {
        startsWith: THRESHOLD_INCIDENT_PREFIX,
      },
    },
    orderBy: { startedAt: "desc" },
  });

  if (!thresholdMessage) {
    if (!openThresholdIncident) return;
    const resolvedIncident = await prisma.incident.update({
      where: { id: openThresholdIncident.id },
      data: {
        status: "RESOLVED",
        resolvedAt: result.checkedAt,
        message: `${THRESHOLD_INCIDENT_PREFIX} utilization back to normal`,
      },
    });
    await notifyIncidentTransition({
      monitor,
      incidentId: resolvedIncident.id,
      alertRuleId: null,
      status: "RESOLVED",
      message: resolvedIncident.message,
    });
    return;
  }

  if (openThresholdIncident) {
    const updatedIncident = await prisma.incident.update({
      where: { id: openThresholdIncident.id },
      data: {
        message: `${THRESHOLD_INCIDENT_PREFIX} ${thresholdMessage}`,
      },
    });
    await notifyIncidentReminderIfDue({
      monitor,
      incidentId: updatedIncident.id,
      alertRuleId: null,
      incidentStartedAt: updatedIncident.startedAt,
      checkedAt: result.checkedAt,
      message: updatedIncident.message,
    });
    return;
  }

  const createdIncident = await prisma.incident.create({
    data: {
      monitorId: monitor.id,
      status: "OPEN",
      message: `${THRESHOLD_INCIDENT_PREFIX} ${thresholdMessage}`,
      startedAt: result.checkedAt,
    },
  });
  await notifyIncidentTransition({
    monitor,
    incidentId: createdIncident.id,
    alertRuleId: null,
    status: "OPEN",
    message: createdIncident.message,
  });
};

export const runMonitorCheck = async (monitor: Monitor) => {
  if (!isConfigObject(monitor.config)) {
    const createdResult = await prisma.monitorResult.create({
      data: {
        monitorId: monitor.id,
        status: "DOWN",
        message: "config must be an object",
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
        message: "The linked credential has been deleted or no longer exists",
      },
    });

    await reconcileIncident(monitor, {
      status: createdResult.status,
      message: createdResult.message,
      checkedAt: createdResult.checkedAt,
    });

    return createdResult;
  }

  let resolvedConfig: Prisma.InputJsonObject;

  try {
    resolvedConfig = resolveConfigWithCredential(monitor.type, monitor.config, credential);
  } catch {
    const createdResult = await prisma.monitorResult.create({
      data: {
        monitorId: monitor.id,
        status: "DOWN",
        message: "Failed to decrypt the linked credential",
      },
    });

    await reconcileIncident(monitor, {
      status: createdResult.status,
      message: createdResult.message,
      checkedAt: createdResult.checkedAt,
    });

    return createdResult;
  }

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

  const handledByRules = await reconcileAlertRuleIncidents(monitor, {
    status: createdResult.status,
    responseTimeMs: createdResult.responseTimeMs,
    message: createdResult.message,
    checkedAt: createdResult.checkedAt,
    metadata: result.metadata,
  });

  if (!handledByRules) {
    await reconcileIncident(monitor, {
      status: createdResult.status,
      message: createdResult.message,
      checkedAt: createdResult.checkedAt,
    });
    await reconcileThresholdIncident(monitor, {
      checkedAt: createdResult.checkedAt,
      metadata: result.metadata,
    });
  }

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
    logger.error("monitor", `check failed: ${monitor.id}`, { error: String(error) });
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
        logger.error("monitor", "scheduler tick failed", { error: String(error) });
      });
    }, TICK_MS);

    void tick().catch((error) => {
      logger.error("monitor", "initial tick failed", { error: String(error) });
    });

    logger.info("monitor", "runner started");
  },

  stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    logger.info("monitor", "runner stopped");
  },
};
