import type { Prisma } from "../generated/prisma/client";
import { decryptCredentialSecret } from "../lib/credentialSecret";
import { logger } from "../lib/logger";
import prisma from "../lib/prisma";
import { collectPostgres } from "./insight/postgresql.collector";
import { collectMysql } from "./insight/mysql.collector";
import { collectSqlServer } from "./insight/sqlserver.collector";

const TICK_MS = 60_000; // check every 1 minute

const lastCollectedAt = new Map<string, number>();
const inFlight = new Set<string>();

let timer: ReturnType<typeof setInterval> | null = null;

// ── resolve DB connection config from monitor config + credential ──
const resolveDbConfig = (
  monitorConfig: Prisma.JsonObject,
  credential: { username: string | null; secret: string } | null,
) => {
  const cfg = monitorConfig as Record<string, unknown>;
  const host = typeof cfg.host === "string" ? cfg.host : undefined;
  const port = typeof cfg.port === "number" ? cfg.port : undefined;
  const database = typeof cfg.database === "string" ? cfg.database : undefined;
  let user = typeof cfg.user === "string" ? cfg.user : undefined;
  let password = typeof cfg.password === "string" ? cfg.password : undefined;

  if (credential) {
    if (credential.username) user = credential.username;
    password = decryptCredentialSecret(credential.secret);
  }

  return { host, port, user, password, database };
};

// ── run collection for one monitor ────────────────────────────
const runInsightCollection = async (configId: string) => {
  const config = await prisma.dbInsightConfig.findUnique({
    where: { id: configId },
    include: {
      monitor: {
        include: { credential: true },
      },
    },
  });

  if (!config || !config.enabled) return;

  const monitor = config.monitor;
  const monitorConfig =
    monitor.config &&
    typeof monitor.config === "object" &&
    !Array.isArray(monitor.config)
      ? (monitor.config as Prisma.JsonObject)
      : {};

  const dbType =
    typeof (monitorConfig as Record<string, unknown>).type === "string"
      ? ((monitorConfig as Record<string, unknown>).type as string).toLowerCase()
      : "unknown";

  // Create the snapshot shell first so child rows can reference it
  const snapshot = await prisma.dbInsightSnapshot.create({
    data: {
      configId: config.id,
      monitorId: monitor.id,
      dbType,
    },
  });

  const startMs = Date.now();

  const saveResult = async (result: Awaited<ReturnType<typeof collectPostgres>>) => {
    await prisma.$transaction(async (tx) => {
      if (result.slowQueries.length > 0) {
        await tx.dbSlowQuery.createMany({
          data: result.slowQueries.map((q) => ({
            snapshotId: snapshot.id,
            queryHash: q.queryHash,
            queryText: q.queryText,
            avgDurationMs: q.avgDurationMs,
            maxDurationMs: q.maxDurationMs,
            callCount: q.callCount,
            rowsExamined: q.rowsExamined,
          })),
        });
      }
      if (result.indexStats.length > 0) {
        await tx.dbIndexStat.createMany({
          data: result.indexStats.map((i) => ({
            snapshotId: snapshot.id,
            tableName: i.tableName,
            indexName: i.indexName,
            status: i.status,
            scansCount: i.scansCount,
            sizeBytes: i.sizeBytes,
            lastUsed: i.lastUsed,
            suggestedSql: i.suggestedSql,
          })),
        });
      }
      if (result.tableSizes.length > 0) {
        await tx.dbTableSize.createMany({
          data: result.tableSizes.map((t) => ({
            snapshotId: snapshot.id,
            tableName: t.tableName,
            totalBytes: t.totalBytes,
            dataBytes: t.dataBytes,
            indexBytes: t.indexBytes,
            rowCount: t.rowCount,
            lastAnalyzedAt: t.lastAnalyzedAt,
          })),
        });
      }
      if (result.fileSizes.length > 0) {
        await tx.dbFileSize.createMany({
          data: result.fileSizes.map((f) => ({
            snapshotId: snapshot.id,
            fileType: f.fileType,
            filePath: f.filePath,
            sizeBytes: f.sizeBytes,
          })),
        });
      }
      await tx.dbConnectionStat.create({
        data: {
          snapshotId: snapshot.id,
          total: result.connectionStat.total,
          active: result.connectionStat.active,
          idle: result.connectionStat.idle,
          idleInTransaction: result.connectionStat.idleInTransaction,
          maxConnections: result.connectionStat.maxConnections,
          blockedCount: result.connectionStat.blockedCount,
          longestBlockedSeconds: result.connectionStat.longestBlockedSeconds,
        },
      });
      if (result.replicationStatus.length > 0) {
        await tx.dbReplicationStatus.createMany({
          data: result.replicationStatus.map((r) => ({
            snapshotId: snapshot.id,
            replicaName: r.replicaName,
            state: r.state,
            lagSeconds: r.lagSeconds,
            detailJson: r.detailJson as Prisma.InputJsonObject,
          })),
        });
      }
      await tx.dbInsightSnapshot.update({
        where: { id: snapshot.id },
        data: { collectionDurationMs: Date.now() - startMs },
      });
    });
  };

  try {
    const connConfig = resolveDbConfig(monitorConfig, monitor.credential);
    const opts = { slowQueryThresholdMs: config.slowQueryThresholdMs, topNQueries: config.topNQueries };

    if (dbType === "postgresql" || dbType === "postgres") {
      await saveResult(await collectPostgres(connConfig, opts));
    } else if (dbType === "mysql" || dbType === "mariadb") {
      await saveResult(await collectMysql(connConfig, opts));
    } else if (dbType === "sqlserver" || dbType === "mssql") {
      const sqlConnConfig = {
        ...connConfig,
        encrypt: (monitorConfig as Record<string, unknown>).encrypt === true,
        trustServerCertificate: (monitorConfig as Record<string, unknown>).trustServerCertificate !== false,
      };
      await saveResult(await collectSqlServer(sqlConnConfig, opts));
    } else {
      await prisma.dbInsightSnapshot.update({
        where: { id: snapshot.id },
        data: {
          collectionDurationMs: Date.now() - startMs,
          errorMessage: `DB Insight collector for "${dbType}" is not yet implemented`,
        },
      });
    }

    logger.info("insight", `collected snapshot for monitor ${monitor.id} (${monitor.name}) in ${Date.now() - startMs}ms`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.dbInsightSnapshot.update({
      where: { id: snapshot.id },
      data: {
        collectionDurationMs: Date.now() - startMs,
        errorMessage: message,
      },
    });
    logger.error("insight", `collection failed for monitor ${monitor.id}: ${message}`);
  }
};

// ── tick ───────────────────────────────────────────────────────
const tick = async () => {
  const configs = await prisma.dbInsightConfig.findMany({
    where: { enabled: true },
    include: { monitor: { select: { id: true, type: true, enabled: true } } },
  });

  const now = Date.now();

  await Promise.all(
    configs.map(async (cfg) => {
      if (!cfg.monitor.enabled || cfg.monitor.type !== "DATABASE") return;
      if (inFlight.has(cfg.id)) return;

      const intervalMs = cfg.collectIntervalMinutes * 60_000;
      const last = lastCollectedAt.get(cfg.id);
      if (last && now - last < intervalMs) return;

      inFlight.add(cfg.id);
      try {
        await runInsightCollection(cfg.id);
        lastCollectedAt.set(cfg.id, Date.now());
      } catch (error) {
        logger.error("insight", `tick error for config ${cfg.id}`, { error: String(error) });
      } finally {
        inFlight.delete(cfg.id);
      }
    }),
  );
};

// ── initialize lastCollectedAt from DB on startup ──────────────
const initLastCollectedAt = async () => {
  const configs = await prisma.dbInsightConfig.findMany({
    where: { enabled: true },
    select: { id: true, monitorId: true },
  });

  await Promise.all(
    configs.map(async (cfg) => {
      // Only count successful snapshots — failed ones shouldn't block retries
      const latest = await prisma.dbInsightSnapshot.findFirst({
        where: { configId: cfg.id, errorMessage: null },
        orderBy: { collectedAt: "desc" },
        select: { collectedAt: true },
      });
      if (latest) {
        lastCollectedAt.set(cfg.id, latest.collectedAt.getTime());
      }
    }),
  );
};

// ── public API ─────────────────────────────────────────────────
export const insightRunner = {
  async start() {
    if (timer) return;

    await initLastCollectedAt().catch((error) => {
      logger.error("insight", "failed to initialize last collected timestamps", { error: String(error) });
    });

    timer = setInterval(() => {
      void tick().catch((error) => {
        logger.error("insight", "scheduler tick failed", { error: String(error) });
      });
    }, TICK_MS);

    void tick().catch((error) => {
      logger.error("insight", "initial tick failed", { error: String(error) });
    });

    logger.info("insight", "runner started");
  },

  stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    logger.info("insight", "runner stopped");
  },
};
