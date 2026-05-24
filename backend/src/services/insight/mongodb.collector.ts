import { MongoClient, type Db } from "mongodb";
import type {
  PgCollectOptions as CollectOptions,
  PgSlowQuery as SlowQuery,
  PgIndexStat as IndexStat,
  PgTableSize as TableSize,
  PgFileSize as FileSize,
  PgConnectionStat as ConnectionStat,
  PgReplicationRow as ReplicationRow,
  PgCollectResult as CollectResult,
  PgProcessRow as ProcessRow,
} from "./postgresql.collector";

// ── slow queries via system.profile ──────────────────────────
async function collectSlowQueries(db: Db, opts: CollectOptions): Promise<SlowQuery[]> {
  try {
    // Check profiling level; if off, return empty
    const status = await db.command({ profile: -1 });
    if (status?.was === 0) return [];

    const cursor = db
      .collection("system.profile")
      .find(
        {
          ns: { $not: /^(admin|local|config)\.\$cmd/ },
          millis: { $gt: opts.slowQueryThresholdMs },
        },
        { sort: { millis: -1 }, limit: opts.topNQueries },
      );

    const docs = await cursor.toArray();

    const grouped = new Map<string, { sum: number; max: number; count: number; docsExamined: number | null }>();
    for (const d of docs) {
      const key = String(d.ns ?? "") + "|" + String(d.op ?? "") + "|" + JSON.stringify(d.query ?? d.command ?? {}).slice(0, 200);
      const ms: number = typeof d.millis === "number" ? d.millis : 0;
      const examined: number | null = typeof d.docsExamined === "number" ? d.docsExamined : null;
      const existing = grouped.get(key);
      if (existing) {
        existing.sum += ms;
        existing.max = Math.max(existing.max, ms);
        existing.count++;
        if (examined != null && existing.docsExamined != null) existing.docsExamined += examined;
      } else {
        grouped.set(key, { sum: ms, max: ms, count: 1, docsExamined: examined });
      }
    }

    const results: SlowQuery[] = [];
    let idx = 0;
    for (const [key, v] of grouped.entries()) {
      results.push({
        queryHash: String(idx++),
        queryText: key.slice(0, 4096),
        avgDurationMs: v.sum / v.count,
        maxDurationMs: v.max,
        callCount: v.count,
        rowsExamined: v.docsExamined,
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ── index stats via $indexStats aggregation ───────────────────
async function collectIndexStats(db: Db): Promise<IndexStat[]> {
  const stats: IndexStat[] = [];
  try {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    // Limit to first 50 collections to avoid long collection times
    const names = collections.map((c) => c.name).filter((n) => !n.startsWith("system.")).slice(0, 50);

    for (const colName of names) {
      try {
        const pipeline = [{ $indexStats: {} }];
        const cursor = db.collection(colName).aggregate(pipeline);
        const rows = await cursor.toArray();

        for (const r of rows) {
          const scans: number = typeof r.accesses?.ops === "bigint"
            ? Number(r.accesses.ops)
            : typeof r.accesses?.ops === "number"
              ? r.accesses.ops
              : 0;
          const since: Date | null = r.accesses?.since instanceof Date ? r.accesses.since : null;
          const status: "UNUSED" | "HEALTHY" = scans === 0 ? "UNUSED" : "HEALTHY";
          stats.push({
            tableName: colName,
            indexName: String(r.name ?? ""),
            status,
            scansCount: scans,
            sizeBytes: null,
            lastUsed: since,
            suggestedSql:
              status === "UNUSED" && String(r.name ?? "") !== "_id_"
                ? `db.${colName}.dropIndex("${String(r.name ?? "")}")`
                : null,
          });
        }
      } catch {
        // collection may not support $indexStats — skip
      }
    }
  } catch {
    // ignore
  }
  return stats;
}

// ── collection sizes ──────────────────────────────────────────
async function collectTableSizes(db: Db): Promise<TableSize[]> {
  const sizes: TableSize[] = [];
  try {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = collections.map((c) => c.name).filter((n) => !n.startsWith("system.")).slice(0, 100);

    for (const colName of names) {
      try {
        const stats = await db.command({ collStats: colName });
        const total = stats.storageSize ?? stats.totalIndexSize ?? 0;
        const data = stats.size ?? 0;
        const index = stats.totalIndexSize ?? 0;
        const count = stats.count ?? 0;
        sizes.push({
          tableName: colName,
          totalBytes: BigInt(Math.round(total + index)),
          dataBytes: BigInt(Math.round(data)),
          indexBytes: BigInt(Math.round(index)),
          rowCount: BigInt(count),
          lastAnalyzedAt: null,
        });
      } catch {
        // skip
      }
    }

    sizes.sort((a, b) => (a.totalBytes > b.totalBytes ? -1 : 1));
  } catch {
    // ignore
  }
  return sizes;
}

// ── file/db sizes ─────────────────────────────────────────────
async function collectFileSizes(db: Db): Promise<FileSize[]> {
  const sizes: FileSize[] = [];
  try {
    const stats = await db.command({ dbStats: 1, scale: 1 });
    const dataSize: number = stats.dataSize ?? stats.storageSize ?? 0;
    const indexSize: number = stats.indexSize ?? 0;
    sizes.push({
      fileType: "DATA",
      filePath: String(stats.db ?? db.databaseName),
      sizeBytes: BigInt(Math.round(dataSize + indexSize)),
    });
  } catch {
    // ignore
  }
  return sizes;
}

// ── connection stats ──────────────────────────────────────────
async function collectConnectionStat(client: MongoClient, db: Db): Promise<ConnectionStat> {
  let total = 0;
  let active = 0;
  let idle = 0;
  let maxConnections = 0;
  let blockedCount = 0;
  let longestBlockedSeconds: number | null = null;
  const loginBreakdown: Record<string, number> = {};
  const processList: ProcessRow[] = [];

  try {
    const serverStatus = await client.db("admin").command({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 });
    const conns = serverStatus.connections ?? {};
    total = (conns.current as number) ?? 0;
    maxConnections = (conns.available as number) != null ? total + (conns.available as number) : 0;
  } catch {
    // ignore
  }

  try {
    // currentOp gives us running operations
    const currentOp = await client.db("admin").command({ currentOp: 1, active: true });
    const ops: any[] = (currentOp.inprog as any[]) ?? [];

    for (const op of ops) {
      const ns = String(op.ns ?? "");
      if (!ns.startsWith(db.databaseName + ".")) continue;

      const secRunning: number = typeof op.secs_running === "number" ? op.secs_running : 0;
      const isBlocked: boolean = op.waitingForLock === true;

      if (isBlocked) {
        blockedCount++;
        if (longestBlockedSeconds == null || secRunning > longestBlockedSeconds) {
          longestBlockedSeconds = secRunning;
        }
      }

      const login = String(op.effectiveUsers?.[0]?.user ?? op.client ?? "(unknown)");
      loginBreakdown[login] = (loginBreakdown[login] ?? 0) + 1;

      processList.push({
        pid: typeof op.opid === "number" ? op.opid : 0,
        loginName: login,
        appName: String(op.appName ?? op.clientMetadata?.application?.name ?? ""),
        status: String(op.op ?? "unknown"),
        durationSec: secRunning > 0 ? secRunning : null,
        database: db.databaseName,
        isBlocked,
      });

      active++;
    }
    idle = Math.max(0, total - active);
  } catch {
    // currentOp might not be available — return minimal stats
  }

  return {
    total,
    active,
    idle,
    idleInTransaction: 0,
    maxConnections,
    blockedCount,
    longestBlockedSeconds,
    loginBreakdown: Object.keys(loginBreakdown).length > 0 ? loginBreakdown : undefined,
    processList: processList.length > 0 ? processList : undefined,
  };
}

// ── replication status ─────────────────────────────────────────
async function collectReplication(client: MongoClient): Promise<ReplicationRow[]> {
  try {
    const status = await client.db("admin").command({ replSetGetStatus: 1 });
    const members: any[] = (status.members as any[]) ?? [];

    return members
      .filter((m) => m.state !== 1) // exclude primary (state 1 = PRIMARY)
      .map((m) => {
        const stateStr = String(m.stateStr ?? "").toUpperCase();
        const lagSeconds: number | null =
          typeof m.optimeDate === "object" && m.optimeDate instanceof Date && typeof status.date === "object"
            ? Math.max(0, (status.date.getTime() - m.optimeDate.getTime()) / 1000)
            : null;

        const state: "STREAMING" | "LAGGING" | "STOPPED" =
          stateStr === "SECONDARY"
            ? lagSeconds == null || lagSeconds < 30
              ? "STREAMING"
              : "LAGGING"
            : "STOPPED";

        return {
          replicaName: String(m.name ?? "unknown"),
          state,
          lagSeconds,
          detailJson: {
            stateStr: m.stateStr,
            health: m.health,
            uptime: m.uptime,
            optimeDate: m.optimeDate,
            lastHeartbeat: m.lastHeartbeat,
            lastHeartbeatRecv: m.lastHeartbeatRecv,
            pingMs: m.pingMs,
            syncSourceHost: m.syncSourceHost,
          },
        };
      });
  } catch {
    // Not a replica set — return empty
    return [];
  }
}

// ── main export ────────────────────────────────────────────────
export async function collectMongodb(
  connConfig: { host?: string; port?: number; user?: string; password?: string; database?: string; authSource?: string; uri?: string },
  opts: CollectOptions,
): Promise<CollectResult> {
  let url: string;
  let database: string;

  if (connConfig.uri) {
    url = connConfig.uri;
    // Extract database name from URI path (mongodb://...host:port/DBNAME?...)
    const pathMatch = connConfig.uri.match(/\/\/[^/]+\/([^/?]+)/);
    database = pathMatch?.[1]
      ? decodeURIComponent(pathMatch[1])
      : connConfig.database ?? "test";
  } else {
    database = connConfig.database ?? "test";
    const credentials =
      connConfig.user
        ? `${encodeURIComponent(connConfig.user)}:${encodeURIComponent(connConfig.password ?? "")}@`
        : "";
    const authSource = connConfig.authSource ? `?authSource=${encodeURIComponent(connConfig.authSource)}` : "";
    url = `mongodb://${credentials}${connConfig.host ?? "localhost"}:${connConfig.port ?? 27017}/${database}${authSource}`;
  }

  const client = new MongoClient(url, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000 });
  await client.connect();

  try {
    const db = client.db(database);
    const slowQueries = await collectSlowQueries(db, opts);
    const indexStats = await collectIndexStats(db);
    const tableSizes = await collectTableSizes(db);
    const fileSizes = await collectFileSizes(db);
    const connectionStat = await collectConnectionStat(client, db);
    const replicationStatus = await collectReplication(client);

    return { slowQueries, indexStats, tableSizes, fileSizes, connectionStat, replicationStatus };
  } finally {
    await client.close().catch(() => {});
  }
}
