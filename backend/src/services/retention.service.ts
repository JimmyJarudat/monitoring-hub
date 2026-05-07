import prisma from "../lib/prisma";
import { logger } from "../lib/logger";

export type RetentionConfig = {
  results_days: number;
  metrics_days: number;
  audit_days: number;
  system_log_days: number;
  auto_cleanup_enabled: boolean;
};

export type RetentionLastRun = {
  deletedResults: number;
  deletedMetrics: number;
  deletedAuditLogs: number;
  deletedSystemLogs: number;
  ranAt: string;
};

export type RetentionStats = {
  results: { count: number; oldest: string | null };
  metrics: { count: number; oldest: string | null };
  audit: { count: number; oldest: string | null };
  system_logs: { count: number; oldest: string | null };
};

export type RetentionClearInput = {
  targets: Array<"results" | "metrics" | "audit" | "system_logs">;
  mode: "expired" | "all";
  olderThanDays?: number;
};

const DEFAULTS: RetentionConfig = {
  results_days: 30,
  metrics_days: 30,
  audit_days: 90,
  system_log_days: 90,
  auto_cleanup_enabled: true,
};

const KEY_CONFIG = "retention";
const KEY_LAST_RUN = "retention.last_run";

export const getRetentionConfig = async (): Promise<RetentionConfig> => {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY_CONFIG } });
  if (!row) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(row.value) as Partial<RetentionConfig>;
    return {
      results_days: parsed.results_days ?? DEFAULTS.results_days,
      metrics_days: parsed.metrics_days ?? DEFAULTS.metrics_days,
      audit_days: parsed.audit_days ?? DEFAULTS.audit_days,
      system_log_days: parsed.system_log_days ?? DEFAULTS.system_log_days,
      auto_cleanup_enabled: parsed.auto_cleanup_enabled ?? DEFAULTS.auto_cleanup_enabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveRetentionConfig = async (config: RetentionConfig): Promise<void> => {
  await prisma.systemSetting.upsert({
    where: { key: KEY_CONFIG },
    update: { value: JSON.stringify(config) },
    create: { key: KEY_CONFIG, value: JSON.stringify(config) },
  });
};

export const getRetentionStats = async (): Promise<RetentionStats> => {
  const [
    resultsCount, metricsCount, auditCount, systemLogCount,
    oldestResult, oldestMetric, oldestAudit, oldestSystemLog,
  ] = await Promise.all([
    prisma.monitorResult.count(),
    prisma.deviceMetricSample.count(),
    prisma.auditLog.count(),
    prisma.systemLog.count(),
    prisma.monitorResult.findFirst({ orderBy: { checkedAt: "asc" }, select: { checkedAt: true } }),
    prisma.deviceMetricSample.findFirst({ orderBy: { collectedAt: "asc" }, select: { collectedAt: true } }),
    prisma.auditLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.systemLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  return {
    results: { count: resultsCount, oldest: oldestResult?.checkedAt.toISOString() ?? null },
    metrics: { count: metricsCount, oldest: oldestMetric?.collectedAt.toISOString() ?? null },
    audit: { count: auditCount, oldest: oldestAudit?.createdAt.toISOString() ?? null },
    system_logs: { count: systemLogCount, oldest: oldestSystemLog?.createdAt.toISOString() ?? null },
  };
};

const getCutoffDate = (days: number) => new Date(Date.now() - days * 86_400_000);

export const getRetentionLastRun = async (): Promise<RetentionLastRun | null> => {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY_LAST_RUN } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as RetentionLastRun;
  } catch {
    return null;
  }
};

const saveRetentionLastRun = async (summary: RetentionLastRun): Promise<void> => {
  await prisma.systemSetting.upsert({
    where: { key: KEY_LAST_RUN },
    update: { value: JSON.stringify(summary) },
    create: { key: KEY_LAST_RUN, value: JSON.stringify(summary) },
  });
};

export const runRetentionCleanup = async (config?: RetentionConfig): Promise<RetentionLastRun> => {
  const cfg = config ?? (await getRetentionConfig());

  const [results, metrics, audit, systemLogs] = await Promise.all([
    prisma.monitorResult.deleteMany({
      where: { checkedAt: { lt: getCutoffDate(cfg.results_days) } },
    }),
    prisma.deviceMetricSample.deleteMany({
      where: { collectedAt: { lt: getCutoffDate(cfg.metrics_days) } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: getCutoffDate(cfg.audit_days) } },
    }),
    prisma.systemLog.deleteMany({
      where: { createdAt: { lt: getCutoffDate(cfg.system_log_days) } },
    }),
  ]);

  const summary: RetentionLastRun = {
    deletedResults: results.count,
    deletedMetrics: metrics.count,
    deletedAuditLogs: audit.count,
    deletedSystemLogs: systemLogs.count,
    ranAt: new Date().toISOString(),
  };

  await saveRetentionLastRun(summary);

  return summary;
};

export const clearRetentionHistory = async (
  input: RetentionClearInput,
  config?: RetentionConfig,
): Promise<RetentionLastRun> => {
  const cfg = config ?? (await getRetentionConfig());
  const targets = new Set(input.targets);

  const resultWhere =
    input.mode === "all"
      ? {}
      : {
          checkedAt: {
            lt: getCutoffDate(input.olderThanDays ?? cfg.results_days),
          },
        };
  const metricWhere =
    input.mode === "all"
      ? {}
      : {
          collectedAt: {
            lt: getCutoffDate(input.olderThanDays ?? cfg.metrics_days),
          },
        };
  const auditWhere =
    input.mode === "all"
      ? {}
      : {
          createdAt: {
            lt: getCutoffDate(input.olderThanDays ?? cfg.audit_days),
          },
        };

  const systemLogWhere =
    input.mode === "all"
      ? {}
      : { createdAt: { lt: getCutoffDate(input.olderThanDays ?? cfg.system_log_days) } };

  const [results, metrics, audit, systemLogs] = await Promise.all([
    targets.has("results")
      ? prisma.monitorResult.deleteMany({ where: resultWhere })
      : Promise.resolve({ count: 0 }),
    targets.has("metrics")
      ? prisma.deviceMetricSample.deleteMany({ where: metricWhere })
      : Promise.resolve({ count: 0 }),
    targets.has("audit")
      ? prisma.auditLog.deleteMany({ where: auditWhere })
      : Promise.resolve({ count: 0 }),
    targets.has("system_logs")
      ? prisma.systemLog.deleteMany({ where: systemLogWhere })
      : Promise.resolve({ count: 0 }),
  ]);

  const summary: RetentionLastRun = {
    deletedResults: results.count,
    deletedMetrics: metrics.count,
    deletedAuditLogs: audit.count,
    deletedSystemLogs: systemLogs.count,
    ranAt: new Date().toISOString(),
  };

  await saveRetentionLastRun(summary);

  return summary;
};

export const startRetentionScheduler = (): void => {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  const run = async () => {
    const cfg = await getRetentionConfig();
    if (!cfg.auto_cleanup_enabled) {
      logger.info("retention", "auto cleanup disabled, skipping");
      return;
    }

    logger.info("retention", "running scheduled cleanup");
    try {
      const result = await runRetentionCleanup(cfg);
      logger.info("retention", "cleanup complete", {
        deletedResults: result.deletedResults,
        deletedMetrics: result.deletedMetrics,
        deletedAuditLogs: result.deletedAuditLogs,
        deletedSystemLogs: result.deletedSystemLogs,
      });
    } catch (error) {
      logger.error("retention", "cleanup failed", { error: String(error) });
    }
  };

  // รอ 10 วินาทีหลัง start แล้วค่อย run cleanup ครั้งแรก
  setTimeout(() => {
    void run();
    setInterval(() => void run(), INTERVAL_MS);
  }, 10_000);
};
