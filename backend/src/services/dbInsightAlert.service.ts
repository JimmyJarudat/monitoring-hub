import type { AlertRule, Monitor } from "../generated/prisma/client";
import type { IncidentStatus } from "../generated/prisma/enums";
import prisma from "../lib/prisma";
import { logger } from "../lib/logger";
import { findActiveMaintenanceWindow } from "./maintenanceWindow.service";
import { notifyIncidentEscalation, notifyIncidentReminder, notifyIncidentTransition } from "./notification.service";
import { getSystemConfig } from "./systemConfig.service";

export const DB_INSIGHT_ALERT_METRICS = [
  "db.slow_query_avg_ms",
  "db.slow_query_count",
  "db.log_file_size_bytes",
  "db.data_file_size_bytes",
  "db.table_size_bytes",
  "db.active_connections_pct",
  "db.replication_lag_seconds",
  "db.blocked_query_seconds",
  "db.unused_index_count",
] as const;

const DB_INSIGHT_METRIC_SET = new Set<string>(DB_INSIGHT_ALERT_METRICS);
const RULE_INCIDENT_PREFIX = "[RULE]";
const ACTIVE_INCIDENT_STATUSES: IncidentStatus[] = ["OPEN", "ACKNOWLEDGED"];
const INCIDENT_ESCALATION_ACTION = "INCIDENT_ESCALATION_SENT";
const INCIDENT_REMINDER_ACTION = "INCIDENT_REMINDER_SENT";
const ESCALATION_LEVELS = [
  { level: 1, multiplier: 2 },
  { level: 2, multiplier: 4 },
  { level: 3, multiplier: 8 },
] as const;

type SnapshotForAlert = NonNullable<Awaited<ReturnType<typeof loadSnapshotForAlert>>>;

export const isDbInsightAlertMetric = (metric: string) => DB_INSIGHT_METRIC_SET.has(metric);

const toNumber = (value: bigint | number | null | undefined) => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

const sumNumbers = (values: Array<bigint | number | null | undefined>) =>
  values.reduce((total, value) => total + (toNumber(value) ?? 0), 0);

const maxNumbers = (values: Array<bigint | number | null | undefined>) => {
  const numbers = values
    .map((value) => toNumber(value))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return numbers.length > 0 ? Math.max(...numbers) : null;
};

const formatBytes = (value: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = Math.abs(value);
  let index = 0;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${next.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatMetricLabel = (metric: string) => {
  const labels: Record<string, string> = {
    "db.slow_query_avg_ms": "DB slow query avg",
    "db.slow_query_count": "DB slow query count",
    "db.log_file_size_bytes": "DB log file size",
    "db.data_file_size_bytes": "DB data file size",
    "db.table_size_bytes": "DB largest table",
    "db.active_connections_pct": "DB active connections",
    "db.replication_lag_seconds": "DB replication lag",
    "db.blocked_query_seconds": "DB blocked query",
    "db.unused_index_count": "DB unused indexes",
  };

  return labels[metric] ?? metric;
};

const formatRuleValue = (metric: string, value: number) => {
  if (metric.endsWith("_bytes")) return formatBytes(value);
  if (metric.endsWith("_pct")) return `${value.toFixed(1)}%`;
  if (metric.endsWith("_ms")) return `${Math.round(value).toLocaleString()} ms`;
  if (metric.endsWith("_seconds")) return `${value.toFixed(value >= 10 ? 0 : 1)}s`;
  if (metric.endsWith("_count")) return Math.round(value).toLocaleString();
  return String(value);
};

const evaluateOperator = (actual: number, operator: AlertRule["operator"], threshold: number) => {
  if (operator === "GT") return actual > threshold;
  if (operator === "LT") return actual < threshold;
  if (operator === "EQ") return actual === threshold;
  if (operator === "NEQ") return actual !== threshold;
  return false;
};

const loadSnapshotForAlert = (snapshotId: string) =>
  prisma.dbInsightSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      slowQueries: true,
      indexStats: true,
      tableSizes: true,
      fileSizes: true,
      connectionStats: true,
      replicationStatus: true,
      config: {
        include: {
          monitor: true,
        },
      },
    },
  });

const getMetricValue = (metric: string, snapshot: SnapshotForAlert) => {
  if (metric === "db.slow_query_avg_ms") {
    return maxNumbers(snapshot.slowQueries.map((query) => query.avgDurationMs));
  }
  if (metric === "db.slow_query_count") {
    return snapshot.slowQueries.length;
  }
  if (metric === "db.log_file_size_bytes") {
    return sumNumbers(snapshot.fileSizes.filter((file) => file.fileType === "LOG").map((file) => file.sizeBytes));
  }
  if (metric === "db.data_file_size_bytes") {
    const dataFiles = snapshot.fileSizes.filter((file) => file.fileType === "DATA");
    if (dataFiles.length > 0) return sumNumbers(dataFiles.map((file) => file.sizeBytes));
    return sumNumbers(snapshot.tableSizes.map((table) => table.totalBytes));
  }
  if (metric === "db.table_size_bytes") {
    return maxNumbers(snapshot.tableSizes.map((table) => table.totalBytes));
  }
  if (metric === "db.active_connections_pct") {
    const stats = snapshot.connectionStats;
    if (!stats || stats.maxConnections <= 0) return null;
    return (stats.active / stats.maxConnections) * 100;
  }
  if (metric === "db.replication_lag_seconds") {
    return maxNumbers(snapshot.replicationStatus.map((replica) => replica.lagSeconds));
  }
  if (metric === "db.blocked_query_seconds") {
    return snapshot.connectionStats?.longestBlockedSeconds ?? 0;
  }
  if (metric === "db.unused_index_count") {
    return snapshot.indexStats.filter((index) => index.status === "UNUSED").length;
  }

  return null;
};

const buildRuleMessage = (rule: AlertRule, actual: number, snapshot: SnapshotForAlert) => {
  const metricLabel = formatMetricLabel(rule.metric);
  const current = formatRuleValue(rule.metric, actual);
  const threshold = formatRuleValue(rule.metric, rule.threshold);
  return `${RULE_INCIDENT_PREFIX} ${rule.severity} ${metricLabel}: ${current} ${rule.operator} ${threshold} (snapshot ${snapshot.collectedAt.toISOString()})`;
};

const getAuditNumber = (value: unknown, key: string) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getReminderIntervalMs = async () => {
  try {
    const cfg = await getSystemConfig();
    return Math.max(cfg.alerting.incidentReminderIntervalHours, 1) * 3_600_000;
  } catch {
    return 24 * 3_600_000;
  }
};

const shouldSendIncidentReminder = async (incidentId: string, incidentStartedAt: Date, checkedAt: Date) => {
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

const getSentEscalationLevels = async (incidentId: string) => {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: INCIDENT_ESCALATION_ACTION,
      entity: "Incident",
      entityId: incidentId,
    },
    select: { newValue: true },
  });

  return new Set(logs.map((log) => getAuditNumber(log.newValue, "level")).filter((level): level is number => level !== null));
};

const getDueEscalationLevel = async (incidentId: string, incidentStartedAt: Date, checkedAt: Date) => {
  const intervalMs = await getReminderIntervalMs();
  const openMs = checkedAt.getTime() - incidentStartedAt.getTime();
  const sentLevels = await getSentEscalationLevels(incidentId);

  return ESCALATION_LEVELS.find((item) => openMs >= intervalMs * item.multiplier && !sentLevels.has(item.level));
};

const notifyIncidentReminderIfDue = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId: string;
  incidentStartedAt: Date;
  checkedAt: Date;
  message: string | null;
}) => {
  const escalation = await getDueEscalationLevel(params.incidentId, params.incidentStartedAt, params.checkedAt);
  if (escalation) {
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
          alertRuleId: params.alertRuleId,
          level: escalation.level,
          multiplier: escalation.multiplier,
          message,
        },
      },
    });
  }

  if (!(await shouldSendIncidentReminder(params.incidentId, params.incidentStartedAt, params.checkedAt))) return;

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
        alertRuleId: params.alertRuleId,
        message: params.message,
      },
    },
  });
};

export const reconcileDbInsightAlertRules = async (snapshotId: string) => {
  const snapshot = await loadSnapshotForAlert(snapshotId);
  if (!snapshot || snapshot.errorMessage) return false;

  const monitor = snapshot.config.monitor;
  if (monitor.type !== "DATABASE") return false;

  const rules = await prisma.alertRule.findMany({
    where: {
      monitorId: monitor.id,
      enabled: true,
      metric: { in: Array.from(DB_INSIGHT_ALERT_METRICS) },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (rules.length === 0) return false;

  const checkedAt = snapshot.collectedAt;
  const maintenanceWindow = await findActiveMaintenanceWindow(monitor.id, checkedAt);

  await Promise.all(
    rules.map(async (rule) => {
      const actual = getMetricValue(rule.metric, snapshot);
      const openIncident = await prisma.incident.findFirst({
        where: {
          monitorId: monitor.id,
          alertRuleId: rule.id,
          status: { in: ACTIVE_INCIDENT_STATUSES },
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
            resolvedAt: checkedAt,
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

      if (maintenanceWindow) {
        logger.info("insight", `suppressed DB Insight alert during maintenance: ${monitor.id}`, {
          monitorName: monitor.name,
          alertRuleId: rule.id,
          maintenanceWindowId: maintenanceWindow.id,
        });
        return;
      }

      const nextMessage = buildRuleMessage(rule, actual, snapshot);
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
          checkedAt,
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
          startedAt: checkedAt,
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
