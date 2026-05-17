import pg from "pg";

export interface PgCollectOptions {
  slowQueryThresholdMs: number;
  topNQueries: number;
}

export interface PgSlowQuery {
  queryHash: string;
  queryText: string;
  avgDurationMs: number;
  maxDurationMs: number;
  callCount: number;
  rowsExamined: number | null;
}

export interface PgIndexStat {
  tableName: string;
  indexName: string | null;
  status: "MISSING" | "UNUSED" | "HEALTHY";
  scansCount: number;
  sizeBytes: bigint | null;
  lastUsed: Date | null;
  suggestedSql: string | null;
}

export interface PgTableSize {
  tableName: string;
  totalBytes: bigint;
  dataBytes: bigint;
  indexBytes: bigint;
  rowCount: bigint;
  lastAnalyzedAt: Date | null;
}

export interface PgFileSize {
  fileType: "DATA" | "LOG" | "WAL";
  filePath: string;
  sizeBytes: bigint;
}

export interface PgConnectionStat {
  total: number;
  active: number;
  idle: number;
  idleInTransaction: number;
  maxConnections: number;
  blockedCount: number;
  longestBlockedSeconds: number | null;
}

export interface PgReplicationRow {
  replicaName: string;
  state: "STREAMING" | "LAGGING" | "STOPPED";
  lagSeconds: number | null;
  detailJson: Record<string, unknown>;
}

export interface PgCollectResult {
  slowQueries: PgSlowQuery[];
  indexStats: PgIndexStat[];
  tableSizes: PgTableSize[];
  fileSizes: PgFileSize[];
  connectionStat: PgConnectionStat;
  replicationStatus: PgReplicationRow[];
}

// ── slow queries via pg_stat_statements ───────────────────────
async function collectSlowQueries(client: pg.Client, opts: PgCollectOptions): Promise<PgSlowQuery[]> {
  try {
    const res = await client.query<{
      query_hash: string;
      query_text: string;
      avg_duration_ms: string;
      max_duration_ms: string;
      call_count: string;
      rows_examined: string;
    }>(
      `SELECT queryid::text        AS query_hash,
              query                AS query_text,
              mean_exec_time       AS avg_duration_ms,
              max_exec_time        AS max_duration_ms,
              calls                AS call_count,
              rows                 AS rows_examined
       FROM pg_stat_statements
       WHERE mean_exec_time > $1
         AND query NOT ILIKE 'EXPLAIN%'
         AND query NOT ILIKE '%pg_stat_statements%'
         AND query NOT ILIKE '%pg_stat_activity%'
       ORDER BY mean_exec_time DESC
       LIMIT $2`,
      [opts.slowQueryThresholdMs, opts.topNQueries],
    );

    return res.rows.map((r) => ({
      queryHash: r.query_hash,
      queryText: r.query_text.slice(0, 4096),
      avgDurationMs: parseFloat(r.avg_duration_ms),
      maxDurationMs: parseFloat(r.max_duration_ms),
      callCount: parseInt(r.call_count, 10),
      rowsExamined: r.rows_examined != null ? parseInt(r.rows_examined, 10) : null,
    }));
  } catch {
    // pg_stat_statements extension not enabled or no permission — skip
    return [];
  }
}

// ── index analysis ─────────────────────────────────────────────
async function collectIndexStats(client: pg.Client): Promise<PgIndexStat[]> {
  const idxRes = await client.query<{
    table_name: string;
    index_name: string;
    scans_count: string;
    size_bytes: string;
  }>(
    `SELECT relname                        AS table_name,
            indexrelname                   AS index_name,
            idx_scan                       AS scans_count,
            pg_relation_size(indexrelid)   AS size_bytes
     FROM pg_stat_user_indexes
     ORDER BY idx_scan ASC, size_bytes DESC
     LIMIT 300`,
  );

  const seqRes = await client.query<{
    table_name: string;
    seq_scan: string;
    row_count: string;
  }>(
    `SELECT relname      AS table_name,
            seq_scan,
            n_live_tup   AS row_count
     FROM pg_stat_user_tables
     WHERE seq_scan > 1000 AND n_live_tup > 100
     ORDER BY seq_scan DESC
     LIMIT 30`,
  );

  const stats: PgIndexStat[] = idxRes.rows.map((r) => {
    const scans = parseInt(r.scans_count, 10);
    const size = r.size_bytes != null ? BigInt(r.size_bytes) : null;
    const status: "UNUSED" | "HEALTHY" = scans === 0 ? "UNUSED" : "HEALTHY";
    const suggestedSql =
      status === "UNUSED" ? `DROP INDEX CONCURRENTLY "${r.index_name}";` : null;

    return {
      tableName: r.table_name,
      indexName: r.index_name,
      status,
      scansCount: scans,
      sizeBytes: size,
      lastUsed: null,
      suggestedSql,
    };
  });

  // Tables with high seq_scan = likely missing index
  const existingMissingTables = new Set(
    stats.filter((s) => s.status === "MISSING").map((s) => s.tableName),
  );
  for (const r of seqRes.rows) {
    if (!existingMissingTables.has(r.table_name)) {
      stats.push({
        tableName: r.table_name,
        indexName: null,
        status: "MISSING",
        scansCount: parseInt(r.seq_scan, 10),
        sizeBytes: null,
        lastUsed: null,
        suggestedSql: `-- Consider adding an index on "${r.table_name}" — ${parseInt(r.seq_scan, 10).toLocaleString()} sequential scans detected`,
      });
    }
  }

  return stats;
}

// ── table sizes ────────────────────────────────────────────────
async function collectTableSizes(client: pg.Client): Promise<PgTableSize[]> {
  const res = await client.query<{
    table_name: string;
    total_bytes: string;
    data_bytes: string;
    index_bytes: string;
    row_count: string;
    last_analyzed_at: Date | null;
  }>(
    `SELECT relname                                AS table_name,
            pg_total_relation_size(relid)          AS total_bytes,
            pg_relation_size(relid)                AS data_bytes,
            pg_indexes_size(relid)                 AS index_bytes,
            GREATEST(n_live_tup, 0)                AS row_count,
            last_analyze                           AS last_analyzed_at
     FROM pg_stat_user_tables
     ORDER BY total_bytes DESC
     LIMIT 100`,
  );

  return res.rows.map((r) => ({
    tableName: r.table_name,
    totalBytes: BigInt(r.total_bytes ?? 0),
    dataBytes: BigInt(r.data_bytes ?? 0),
    indexBytes: BigInt(r.index_bytes ?? 0),
    rowCount: BigInt(r.row_count ?? 0),
    lastAnalyzedAt: r.last_analyzed_at ? new Date(r.last_analyzed_at) : null,
  }));
}

// ── file sizes ─────────────────────────────────────────────────
async function collectFileSizes(client: pg.Client): Promise<PgFileSize[]> {
  const sizes: PgFileSize[] = [];

  // Data (whole database size)
  try {
    const dbRes = await client.query<{ db_size: string; db_name: string }>(
      `SELECT pg_database_size(current_database()) AS db_size,
              current_database() AS db_name`,
    );
    if (dbRes.rows[0]) {
      sizes.push({
        fileType: "DATA",
        filePath: dbRes.rows[0].db_name,
        sizeBytes: BigInt(dbRes.rows[0].db_size ?? 0),
      });
    }
  } catch {
    // ignore
  }

  // WAL directory size (PostgreSQL 10+)
  try {
    const walRes = await client.query<{ wal_size: string }>(
      `SELECT sum(size)::text AS wal_size FROM pg_ls_waldir()`,
    );
    if (walRes.rows[0]?.wal_size) {
      sizes.push({
        fileType: "WAL",
        filePath: "pg_wal",
        sizeBytes: BigInt(walRes.rows[0].wal_size),
      });
    }
  } catch {
    // pg_ls_waldir requires superuser or pg_monitor — skip if not available
  }

  // Log directory size (superuser only)
  try {
    const logRes = await client.query<{ log_size: string }>(
      `SELECT coalesce(sum(size), 0)::text AS log_size FROM pg_ls_logdir()`,
    );
    if (logRes.rows[0]?.log_size) {
      sizes.push({
        fileType: "LOG",
        filePath: "pg_log",
        sizeBytes: BigInt(logRes.rows[0].log_size),
      });
    }
  } catch {
    // pg_ls_logdir requires superuser — skip
  }

  return sizes;
}

// ── connection stats ───────────────────────────────────────────
async function collectConnectionStat(client: pg.Client): Promise<PgConnectionStat> {
  // pg.Client does not support concurrent queries — run sequentially
  const activityRes = await client.query<{
    total: string;
    active: string;
    idle: string;
    idle_in_transaction: string;
    blocked_count: string;
    longest_blocked_seconds: string | null;
  }>(
    `SELECT
       count(*) FILTER (WHERE backend_type = 'client backend')                                       AS total,
       count(*) FILTER (WHERE state = 'active' AND backend_type = 'client backend')                  AS active,
       count(*) FILTER (WHERE state = 'idle' AND backend_type = 'client backend')                    AS idle,
       count(*) FILTER (WHERE state = 'idle in transaction' AND backend_type = 'client backend')     AS idle_in_transaction,
       count(*) FILTER (WHERE wait_event_type = 'Lock')                                              AS blocked_count,
       max(EXTRACT(EPOCH FROM now() - query_start)) FILTER (WHERE wait_event_type = 'Lock')          AS longest_blocked_seconds
     FROM pg_stat_activity
     WHERE datname = current_database()`,
  );

  const maxRes = await client.query<{ max_connections: string }>(
    `SELECT setting AS max_connections FROM pg_settings WHERE name = 'max_connections'`,
  );

  const a = activityRes.rows[0];
  return {
    total: parseInt(a?.total ?? "0", 10),
    active: parseInt(a?.active ?? "0", 10),
    idle: parseInt(a?.idle ?? "0", 10),
    idleInTransaction: parseInt(a?.idle_in_transaction ?? "0", 10),
    maxConnections: parseInt(maxRes.rows[0]?.max_connections ?? "100", 10),
    blockedCount: parseInt(a?.blocked_count ?? "0", 10),
    longestBlockedSeconds:
      a?.longest_blocked_seconds != null ? parseFloat(a.longest_blocked_seconds) : null,
  };
}

// ── replication ────────────────────────────────────────────────
async function collectReplication(client: pg.Client): Promise<PgReplicationRow[]> {
  try {
    const res = await client.query<{
      replica_name: string;
      state: string;
      write_lag_seconds: string | null;
      flush_lag_seconds: string | null;
      replay_lag_seconds: string | null;
      sent_lsn: string;
      write_lsn: string;
      flush_lsn: string;
      replay_lsn: string;
    }>(
      `SELECT application_name                              AS replica_name,
              state,
              EXTRACT(EPOCH FROM write_lag)::text          AS write_lag_seconds,
              EXTRACT(EPOCH FROM flush_lag)::text          AS flush_lag_seconds,
              EXTRACT(EPOCH FROM replay_lag)::text         AS replay_lag_seconds,
              sent_lsn::text,
              write_lsn::text,
              flush_lsn::text,
              replay_lsn::text
       FROM pg_stat_replication`,
    );

    return res.rows.map((r) => {
      const lagSeconds =
        r.replay_lag_seconds != null
          ? parseFloat(r.replay_lag_seconds)
          : r.flush_lag_seconds != null
            ? parseFloat(r.flush_lag_seconds)
            : r.write_lag_seconds != null
              ? parseFloat(r.write_lag_seconds)
              : null;

      const pgState = r.state?.toLowerCase() ?? "";
      const state: "STREAMING" | "LAGGING" | "STOPPED" =
        pgState === "streaming" && (lagSeconds == null || lagSeconds < 30)
          ? "STREAMING"
          : pgState === "streaming"
            ? "LAGGING"
            : "STOPPED";

      return {
        replicaName: r.replica_name ?? "unknown",
        state,
        lagSeconds,
        detailJson: {
          pgState: r.state,
          sentLsn: r.sent_lsn,
          writeLsn: r.write_lsn,
          flushLsn: r.flush_lsn,
          replayLsn: r.replay_lsn,
          writeLagSeconds: r.write_lag_seconds,
          flushLagSeconds: r.flush_lag_seconds,
          replayLagSeconds: r.replay_lag_seconds,
        },
      };
    });
  } catch {
    // Not a primary / no replication configured
    return [];
  }
}

// ── main export ────────────────────────────────────────────────
export async function collectPostgres(
  connConfig: { host?: string; port?: number; user?: string; password?: string; database?: string },
  opts: PgCollectOptions,
): Promise<PgCollectResult> {
  const client = new pg.Client({
    host: connConfig.host ?? "localhost",
    port: connConfig.port ?? 5432,
    user: connConfig.user,
    password: connConfig.password,
    database: connConfig.database,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });

  await client.connect();

  try {
    // pg.Client does not support concurrent queries — must be sequential
    const slowQueries = await collectSlowQueries(client, opts);
    const indexStats = await collectIndexStats(client);
    const tableSizes = await collectTableSizes(client);
    const fileSizes = await collectFileSizes(client);
    const connectionStat = await collectConnectionStat(client);
    const replicationStatus = await collectReplication(client);

    return { slowQueries, indexStats, tableSizes, fileSizes, connectionStat, replicationStatus };
  } finally {
    await client.end().catch(() => {});
  }
}
