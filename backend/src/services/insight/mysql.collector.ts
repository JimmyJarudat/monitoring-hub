import { createConnection, type Connection } from "mysql2/promise";
import type {
  PgCollectOptions as CollectOptions,
  PgSlowQuery as SlowQuery,
  PgIndexStat as IndexStat,
  PgTableSize as TableSize,
  PgFileSize as FileSize,
  PgConnectionStat as ConnectionStat,
  PgReplicationRow as ReplicationRow,
  PgCollectResult as CollectResult,
} from "./postgresql.collector";

// ── slow queries via performance_schema ───────────────────────
async function collectSlowQueries(conn: Connection, opts: CollectOptions): Promise<SlowQuery[]> {
  try {
    // TIMER_WAIT is in picoseconds — divide by 1e9 to get ms
    const [rows] = await conn.execute<any[]>(
      `SELECT DIGEST                                          AS query_hash,
              LEFT(DIGEST_TEXT, 4096)                        AS query_text,
              AVG_TIMER_WAIT / 1000000000                    AS avg_duration_ms,
              MAX_TIMER_WAIT / 1000000000                    AS max_duration_ms,
              COUNT_STAR                                     AS call_count,
              ROUND(SUM_ROWS_EXAMINED / NULLIF(COUNT_STAR,0)) AS rows_examined
       FROM performance_schema.events_statements_summary_by_digest
       WHERE SCHEMA_NAME = DATABASE()
         AND DIGEST_TEXT IS NOT NULL
         AND AVG_TIMER_WAIT / 1000000000 > ?
       ORDER BY AVG_TIMER_WAIT DESC
       LIMIT ?`,
      [opts.slowQueryThresholdMs, opts.topNQueries],
    );

    return (rows as any[]).map((r) => ({
      queryHash: String(r.query_hash ?? ""),
      queryText: String(r.query_text ?? ""),
      avgDurationMs: parseFloat(r.avg_duration_ms) || 0,
      maxDurationMs: parseFloat(r.max_duration_ms) || 0,
      callCount: parseInt(String(r.call_count), 10) || 0,
      rowsExamined: r.rows_examined != null ? parseInt(String(r.rows_examined), 10) : null,
    }));
  } catch {
    // performance_schema not enabled or insufficient privilege
    return [];
  }
}

// ── index stats ────────────────────────────────────────────────
async function collectIndexStats(conn: Connection): Promise<IndexStat[]> {
  const stats: IndexStat[] = [];

  // Index usage from performance_schema
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT s.TABLE_NAME     AS table_name,
              s.INDEX_NAME     AS index_name,
              COALESCE(u.COUNT_READ, 0)  AS scans_count
       FROM information_schema.STATISTICS s
       LEFT JOIN performance_schema.table_io_waits_summary_by_index_usage u
         ON u.OBJECT_SCHEMA = s.TABLE_SCHEMA
        AND u.OBJECT_NAME   = s.TABLE_NAME
        AND u.INDEX_NAME    = s.INDEX_NAME
       WHERE s.TABLE_SCHEMA = DATABASE()
         AND s.SEQ_IN_INDEX = 1
         AND s.INDEX_NAME   != 'PRIMARY'
       ORDER BY scans_count ASC
       LIMIT 300`,
    );

    for (const r of rows as any[]) {
      const scans = parseInt(String(r.scans_count), 10) || 0;
      const status: "UNUSED" | "HEALTHY" = scans === 0 ? "UNUSED" : "HEALTHY";
      stats.push({
        tableName: String(r.table_name),
        indexName: String(r.index_name),
        status,
        scansCount: scans,
        sizeBytes: null, // MySQL doesn't expose individual index byte sizes easily
        lastUsed: null,
        suggestedSql:
          status === "UNUSED"
            ? `DROP INDEX \`${String(r.index_name)}\` ON \`${String(r.table_name)}\`;`
            : null,
      });
    }
  } catch {
    // performance_schema not available — skip
  }

  return stats;
}

// ── table sizes ────────────────────────────────────────────────
async function collectTableSizes(conn: Connection): Promise<TableSize[]> {
  const [rows] = await conn.execute<any[]>(
    `SELECT TABLE_NAME                                     AS table_name,
            DATA_LENGTH + INDEX_LENGTH                     AS total_bytes,
            DATA_LENGTH                                    AS data_bytes,
            INDEX_LENGTH                                   AS index_bytes,
            COALESCE(TABLE_ROWS, 0)                        AS row_count,
            CREATE_TIME                                    AS last_analyzed_at
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
     LIMIT 100`,
  );

  return (rows as any[]).map((r) => ({
    tableName: String(r.table_name),
    totalBytes: BigInt(Math.round(parseFloat(r.total_bytes) || 0)),
    dataBytes: BigInt(Math.round(parseFloat(r.data_bytes) || 0)),
    indexBytes: BigInt(Math.round(parseFloat(r.index_bytes) || 0)),
    rowCount: BigInt(parseInt(String(r.row_count), 10) || 0),
    lastAnalyzedAt: r.last_analyzed_at ? new Date(r.last_analyzed_at) : null,
  }));
}

// ── file sizes ─────────────────────────────────────────────────
async function collectFileSizes(conn: Connection): Promise<FileSize[]> {
  const sizes: FileSize[] = [];

  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT SUM(DATA_LENGTH + INDEX_LENGTH) AS data_size,
              DATABASE()                       AS db_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()`,
    );
    const r = (rows as any[])[0];
    if (r?.data_size != null) {
      sizes.push({
        fileType: "DATA",
        filePath: String(r.db_name ?? "database"),
        sizeBytes: BigInt(Math.round(parseFloat(r.data_size) || 0)),
      });
    }
  } catch {
    // ignore
  }

  return sizes;
}

// ── connection stats ───────────────────────────────────────────
async function collectConnectionStat(conn: Connection): Promise<ConnectionStat> {
  const [processRows] = await conn.execute<any[]>(
    `SELECT COUNT(*)                                                   AS total,
            SUM(CASE WHEN Command != 'Sleep' THEN 1 ELSE 0 END)       AS active,
            SUM(CASE WHEN Command = 'Sleep' THEN 1 ELSE 0 END)        AS idle,
            0                                                          AS idle_in_transaction,
            SUM(CASE WHEN State LIKE '%waiting%' OR State LIKE '%locked%' THEN 1 ELSE 0 END) AS blocked_count,
            MAX(CASE WHEN State LIKE '%waiting%' OR State LIKE '%locked%' THEN Time ELSE NULL END) AS longest_blocked_seconds
     FROM information_schema.PROCESSLIST
     WHERE DB = DATABASE()`,
  );

  const [maxRows] = await conn.execute<any[]>(
    `SHOW VARIABLES LIKE 'max_connections'`,
  );

  const [userRows] = await conn.execute<any[]>(
    `SELECT USER AS username, COUNT(*) AS cnt
     FROM information_schema.PROCESSLIST
     WHERE DB = DATABASE()
     GROUP BY USER
     ORDER BY cnt DESC`,
  );

  const [procRows] = await conn.execute<any[]>(
    `SELECT ID        AS pid,
            USER      AS login_name,
            HOST      AS app_name,
            COMMAND   AS status,
            TIME      AS duration_sec,
            DB        AS database,
            (State LIKE '%waiting%' OR State LIKE '%locked%') AS is_blocked
     FROM information_schema.PROCESSLIST
     WHERE DB = DATABASE()
     ORDER BY TIME DESC
     LIMIT 50`,
  );

  const p = (processRows as any[])[0] ?? {};
  const maxConn = parseInt(String((maxRows as any[])[0]?.Value ?? "100"), 10);
  const loginBreakdown: Record<string, number> = {};
  for (const r of userRows as any[]) {
    loginBreakdown[String(r.username ?? "(unknown)")] = parseInt(String(r.cnt), 10) || 0;
  }
  const processList = (procRows as any[]).map((r) => ({
    pid: parseInt(String(r.pid), 10) || 0,
    loginName: String(r.login_name ?? "(unknown)"),
    appName: String(r.app_name ?? ""),
    status: String(r.status ?? ""),
    durationSec: r.duration_sec != null ? parseInt(String(r.duration_sec), 10) : null,
    database: String(r.database ?? ""),
    isBlocked: r.is_blocked === 1 || r.is_blocked === true,
  }));

  return {
    total: parseInt(String(p.total ?? 0), 10),
    active: parseInt(String(p.active ?? 0), 10),
    idle: parseInt(String(p.idle ?? 0), 10),
    idleInTransaction: 0,
    maxConnections: maxConn,
    blockedCount: parseInt(String(p.blocked_count ?? 0), 10),
    longestBlockedSeconds:
      p.longest_blocked_seconds != null ? parseFloat(String(p.longest_blocked_seconds)) : null,
    loginBreakdown,
    processList,
  };
}

// ── replication ────────────────────────────────────────────────
async function collectReplication(conn: Connection): Promise<ReplicationRow[]> {
  try {
    // MySQL 8.0.22+ uses SHOW REPLICA STATUS, older uses SHOW SLAVE STATUS
    let rows: any[] = [];
    try {
      [rows] = await conn.execute<any[]>("SHOW REPLICA STATUS");
    } catch {
      [rows] = await conn.execute<any[]>("SHOW SLAVE STATUS");
    }

    return (rows as any[]).map((r) => {
      const lagSeconds =
        r.Seconds_Behind_Master != null && r.Seconds_Behind_Master !== ""
          ? parseFloat(String(r.Seconds_Behind_Master))
          : null;

      const ioRunning = String(r.Slave_IO_Running ?? r.Replica_IO_Running ?? "").toLowerCase();
      const sqlRunning = String(r.Slave_SQL_Running ?? r.Replica_SQL_Running ?? "").toLowerCase();

      const state: "STREAMING" | "LAGGING" | "STOPPED" =
        ioRunning === "yes" && sqlRunning === "yes"
          ? lagSeconds == null || lagSeconds < 30
            ? "STREAMING"
            : "LAGGING"
          : "STOPPED";

      return {
        replicaName: String(r.Master_Host ?? r.Source_Host ?? "unknown"),
        state,
        lagSeconds,
        detailJson: {
          ioRunning,
          sqlRunning,
          secondsBehindMaster: lagSeconds,
          sourceHost: r.Master_Host ?? r.Source_Host,
          sourcePort: r.Master_Port ?? r.Source_Port,
          replicateDoDb: r.Replicate_Do_DB,
          lastError: r.Last_Error ?? r.Last_IO_Error,
        },
      };
    });
  } catch {
    // No replication configured
    return [];
  }
}

// ── main export ────────────────────────────────────────────────
export async function collectMysql(
  connConfig: { host?: string; port?: number; user?: string; password?: string; database?: string },
  opts: CollectOptions,
): Promise<CollectResult> {
  const conn = await createConnection({
    host: connConfig.host ?? "localhost",
    port: connConfig.port ?? 3306,
    user: connConfig.user,
    password: connConfig.password,
    database: connConfig.database,
    connectTimeout: 10_000,
  });

  try {
    const slowQueries = await collectSlowQueries(conn, opts);
    const indexStats = await collectIndexStats(conn);
    const tableSizes = await collectTableSizes(conn);
    const fileSizes = await collectFileSizes(conn);
    const connectionStat = await collectConnectionStat(conn);
    const replicationStatus = await collectReplication(conn);

    return { slowQueries, indexStats, tableSizes, fileSizes, connectionStat, replicationStatus };
  } finally {
    await conn.end().catch(() => {});
  }
}
