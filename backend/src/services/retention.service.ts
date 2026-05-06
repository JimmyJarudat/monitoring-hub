import prisma from "../lib/prisma";

export type RetentionConfig = {
  results_days: number;
  metrics_days: number;
  audit_days: number;
};

export type RetentionLastRun = {
  deletedResults: number;
  deletedMetrics: number;
  deletedAuditLogs: number;
  ranAt: string;
};

const DEFAULTS: RetentionConfig = {
  results_days: 30,
  metrics_days: 30,
  audit_days: 90,
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

export const getRetentionLastRun = async (): Promise<RetentionLastRun | null> => {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY_LAST_RUN } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as RetentionLastRun;
  } catch {
    return null;
  }
};

export const runRetentionCleanup = async (config?: RetentionConfig): Promise<RetentionLastRun> => {
  const cfg = config ?? (await getRetentionConfig());
  const now = Date.now();

  const [results, metrics, audit] = await Promise.all([
    prisma.monitorResult.deleteMany({
      where: { checkedAt: { lt: new Date(now - cfg.results_days * 86_400_000) } },
    }),
    prisma.deviceMetricSample.deleteMany({
      where: { collectedAt: { lt: new Date(now - cfg.metrics_days * 86_400_000) } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now - cfg.audit_days * 86_400_000) } },
    }),
  ]);

  const summary: RetentionLastRun = {
    deletedResults: results.count,
    deletedMetrics: metrics.count,
    deletedAuditLogs: audit.count,
    ranAt: new Date().toISOString(),
  };

  await prisma.systemSetting.upsert({
    where: { key: KEY_LAST_RUN },
    update: { value: JSON.stringify(summary) },
    create: { key: KEY_LAST_RUN, value: JSON.stringify(summary) },
  });

  return summary;
};

export const startRetentionScheduler = (): void => {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;

  const run = async () => {
    console.log("[retention] running scheduled cleanup...");
    try {
      const result = await runRetentionCleanup();
      console.log(
        `[retention] deleted ${result.deletedResults} results, ${result.deletedMetrics} metrics, ${result.deletedAuditLogs} audit logs`,
      );
    } catch (error) {
      console.error("[retention] cleanup failed", error);
    }
  };

  // รอ 10 วินาทีหลัง start แล้วค่อย run cleanup ครั้งแรก
  setTimeout(() => {
    void run();
    setInterval(() => void run(), INTERVAL_MS);
  }, 10_000);
};
