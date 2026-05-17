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

type MssqlPool = Awaited<ReturnType<typeof connectMssql>>;

// ── connect ────────────────────────────────────────────────────
async function connectMssql(connConfig: {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}) {
  const sql = await import("mssql");
  const pool = await new sql.ConnectionPool({
    server: connConfig.host ?? "localhost",
    port: connConfig.port ?? 1433,
    user: connConfig.user,
    password: connConfig.password,
    database: connConfig.database,
    connectionTimeout: 10_000,
    requestTimeout: 30_000,
    options: {
      encrypt: connConfig.encrypt ?? false,
      trustServerCertificate: connConfig.trustServerCertificate ?? true,
    },
  }).connect();
  return pool;
}

// ── slow queries ───────────────────────────────────────────────
async function collectSlowQueries(pool: MssqlPool, opts: CollectOptions): Promise<SlowQuery[]> {
  try {
    // total_worker_time is in microseconds — divide by 1000 for ms
    const result = await pool.request().query(`
      SELECT TOP (${opts.topNQueries})
        CONVERT(VARCHAR(64), qs.query_hash, 1)                             AS query_hash,
        LTRIM(SUBSTRING(
          st.text,
          (qs.statement_start_offset / 2) + 1,
          (CASE qs.statement_end_offset
             WHEN -1 THEN DATALENGTH(st.text)
             ELSE qs.statement_end_offset
           END - qs.statement_start_offset) / 2 + 1
        ))                                                                 AS query_text,
        qs.total_worker_time * 1.0 / qs.execution_count / 1000            AS avg_duration_ms,
        qs.max_worker_time / 1000.0                                        AS max_duration_ms,
        qs.execution_count                                                 AS call_count,
        qs.total_logical_reads / qs.execution_count                        AS rows_examined
      FROM sys.dm_exec_query_stats qs
      CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
      WHERE qs.total_worker_time * 1.0 / qs.execution_count / 1000 > ${opts.slowQueryThresholdMs}
      ORDER BY avg_duration_ms DESC
    `);

    return result.recordset.map((r: any) => ({
      queryHash: String(r.query_hash ?? ""),
      queryText: String(r.query_text ?? "").slice(0, 4096),
      avgDurationMs: parseFloat(r.avg_duration_ms) || 0,
      maxDurationMs: parseFloat(r.max_duration_ms) || 0,
      callCount: parseInt(String(r.call_count), 10) || 0,
      rowsExamined: r.rows_examined != null ? parseInt(String(r.rows_examined), 10) : null,
    }));
  } catch {
    // VIEW SERVER STATE permission required
    return [];
  }
}

// ── index stats ────────────────────────────────────────────────
async function collectIndexStats(pool: MssqlPool): Promise<IndexStat[]> {
  const stats: IndexStat[] = [];

  // Existing indexes with usage stats
  try {
    const result = await pool.request().query(`
      SELECT
        t.name                                                             AS table_name,
        i.name                                                             AS index_name,
        COALESCE(us.user_seeks + us.user_scans + us.user_lookups, 0)      AS scans_count,
        SUM(a.used_pages) * 8 * 1024                                      AS size_bytes
      FROM sys.indexes i
      JOIN sys.tables t ON i.object_id = t.object_id
      LEFT JOIN sys.dm_db_index_usage_stats us
        ON i.object_id = us.object_id
       AND i.index_id  = us.index_id
       AND us.database_id = DB_ID()
      LEFT JOIN sys.partitions p
        ON i.object_id = p.object_id
       AND i.index_id  = p.index_id
      LEFT JOIN sys.allocation_units a
        ON p.partition_id = a.container_id
      WHERE t.is_ms_shipped = 0
        AND i.type > 0
        AND i.name IS NOT NULL
      GROUP BY t.name, i.name,
               us.user_seeks, us.user_scans, us.user_lookups
      ORDER BY scans_count ASC
    `);

    for (const r of result.recordset as any[]) {
      const scans = parseInt(String(r.scans_count ?? 0), 10);
      const size = r.size_bytes != null ? BigInt(Math.round(parseFloat(r.size_bytes))) : null;
      const status: "UNUSED" | "HEALTHY" = scans === 0 ? "UNUSED" : "HEALTHY";
      stats.push({
        tableName: String(r.table_name),
        indexName: String(r.index_name),
        status,
        scansCount: scans,
        sizeBytes: size,
        lastUsed: null,
        suggestedSql:
          status === "UNUSED"
            ? `DROP INDEX [${String(r.index_name)}] ON [${String(r.table_name)}];`
            : null,
      });
    }
  } catch {
    // VIEW SERVER STATE required
  }

  // Missing index recommendations
  try {
    const result = await pool.request().query(`
      SELECT TOP 30
        OBJECT_NAME(mid.object_id)   AS table_name,
        mid.equality_columns,
        mid.inequality_columns,
        mid.included_columns,
        CAST(
          migs.avg_total_user_cost *
          migs.avg_user_impact *
          (migs.user_seeks + migs.user_scans)
        AS BIGINT)                   AS improvement_measure,
        'CREATE INDEX [IX_' + OBJECT_NAME(mid.object_id)
          + '_missing' + CAST(ROW_NUMBER() OVER (ORDER BY
            migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) DESC
          ) AS VARCHAR(10)) + '] ON '
          + mid.statement
          + ' ('
          + ISNULL(mid.equality_columns, '')
          + CASE WHEN mid.inequality_columns IS NULL THEN ''
                 WHEN mid.equality_columns  IS NULL THEN mid.inequality_columns
                 ELSE ',' + mid.inequality_columns END
          + ')'
          + ISNULL(' INCLUDE (' + mid.included_columns + ')', '')          AS suggested_sql
      FROM sys.dm_db_missing_index_groups mig
      JOIN sys.dm_db_missing_index_group_stats migs
        ON mig.index_group_handle = migs.group_handle
      JOIN sys.dm_db_missing_index_details mid
        ON mig.index_handle = mid.index_handle
      WHERE mid.database_id = DB_ID()
      ORDER BY improvement_measure DESC
    `);

    for (const r of result.recordset as any[]) {
      if (!r.table_name) continue;
      stats.push({
        tableName: String(r.table_name),
        indexName: null,
        status: "MISSING",
        scansCount: 0,
        sizeBytes: null,
        lastUsed: null,
        suggestedSql: String(r.suggested_sql ?? ""),
      });
    }
  } catch {
    // VIEW SERVER STATE required
  }

  return stats;
}

// ── table sizes ────────────────────────────────────────────────
async function collectTableSizes(pool: MssqlPool): Promise<TableSize[]> {
  try {
    const result = await pool.request().query(`
      SELECT
        t.name                                 AS table_name,
        SUM(a.total_pages) * 8 * 1024          AS total_bytes,
        SUM(a.data_pages)  * 8 * 1024          AS data_bytes,
        (SUM(a.total_pages) - SUM(a.data_pages)) * 8 * 1024 AS index_bytes,
        SUM(CASE WHEN i.index_id <= 1 THEN p.rows ELSE 0 END) AS row_count,
        MAX(STATS_DATE(i.object_id, i.index_id)) AS last_analyzed_at
      FROM sys.tables t
      JOIN sys.indexes i ON t.object_id = i.object_id
      JOIN sys.partitions p
        ON i.object_id = p.object_id
       AND i.index_id  = p.index_id
      JOIN sys.allocation_units a
        ON p.partition_id = a.container_id
      WHERE t.is_ms_shipped = 0
      GROUP BY t.name
      ORDER BY total_bytes DESC
    `);

    return result.recordset.map((r: any) => ({
      tableName: String(r.table_name),
      totalBytes: BigInt(Math.round(parseFloat(r.total_bytes) || 0)),
      dataBytes: BigInt(Math.round(parseFloat(r.data_bytes) || 0)),
      indexBytes: BigInt(Math.round(parseFloat(r.index_bytes) || 0)),
      rowCount: BigInt(parseInt(String(r.row_count ?? 0), 10) || 0),
      lastAnalyzedAt: r.last_analyzed_at ? new Date(r.last_analyzed_at) : null,
    }));
  } catch {
    return [];
  }
}

// ── file sizes ─────────────────────────────────────────────────
async function collectFileSizes(pool: MssqlPool): Promise<FileSize[]> {
  try {
    const result = await pool.request().query(`
      SELECT
        CASE type_desc
          WHEN 'ROWS' THEN 'DATA'
          WHEN 'LOG'  THEN 'LOG'
          ELSE 'DATA'
        END                          AS file_type,
        physical_name                AS file_path,
        CAST(size AS BIGINT) * 8192  AS size_bytes
      FROM sys.master_files
      WHERE database_id = DB_ID()
    `);

    return result.recordset.map((r: any) => ({
      fileType: r.file_type === "LOG" ? "LOG" : "DATA" as "DATA" | "LOG" | "WAL",
      filePath: String(r.file_path ?? ""),
      sizeBytes: BigInt(Math.round(parseFloat(r.size_bytes) || 0)),
    }));
  } catch {
    return [];
  }
}

// ── connection stats ───────────────────────────────────────────
async function collectConnectionStat(pool: MssqlPool): Promise<ConnectionStat> {
  try {
    const [sessResult, maxResult] = await Promise.all([
      pool.request().query(`
        SELECT
          COUNT(*)                                                         AS total,
          SUM(CASE WHEN status = 'running'  THEN 1 ELSE 0 END)            AS active,
          SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END)            AS idle,
          SUM(CASE WHEN blocking_session_id > 0 THEN 1 ELSE 0 END)        AS blocked_count,
          MAX(CASE WHEN blocking_session_id > 0
                   THEN DATEDIFF(SECOND, last_request_start_time, GETDATE())
                   ELSE NULL END)                                          AS longest_blocked_seconds
        FROM sys.dm_exec_sessions
        WHERE is_user_process = 1
          AND database_id = DB_ID()
      `),
      pool.request().query(`
        SELECT value_in_use AS max_connections
        FROM sys.configurations
        WHERE name = 'max connections'
      `),
    ]);

    const s = sessResult.recordset[0] ?? {};
    const maxConn = parseInt(String(maxResult.recordset[0]?.max_connections ?? 0), 10);

    return {
      total: parseInt(String(s.total ?? 0), 10),
      active: parseInt(String(s.active ?? 0), 10),
      idle: parseInt(String(s.idle ?? 0), 10),
      idleInTransaction: 0,
      maxConnections: maxConn || 32767,
      blockedCount: parseInt(String(s.blocked_count ?? 0), 10),
      longestBlockedSeconds:
        s.longest_blocked_seconds != null
          ? parseFloat(String(s.longest_blocked_seconds))
          : null,
    };
  } catch {
    return {
      total: 0, active: 0, idle: 0, idleInTransaction: 0,
      maxConnections: 32767, blockedCount: 0, longestBlockedSeconds: null,
    };
  }
}

// ── replication (Always On AG) ─────────────────────────────────
async function collectReplication(pool: MssqlPool): Promise<ReplicationRow[]> {
  try {
    const result = await pool.request().query(`
      SELECT
        ar.replica_server_name                         AS replica_name,
        drs.synchronization_state_desc                AS pg_state,
        drs.synchronization_health_desc               AS health,
        drs.redo_queue_size                            AS redo_queue_kb,
        drs.log_send_queue_size                        AS send_queue_kb
      FROM sys.dm_hadr_database_replica_states drs
      JOIN sys.availability_replicas ar
        ON drs.replica_id = ar.replica_id
      WHERE drs.is_local = 0
    `);

    return result.recordset.map((r: any) => {
      const redoKb = parseFloat(String(r.redo_queue_kb ?? 0)) || 0;
      const lagSeconds = redoKb > 0 ? redoKb / 100 : 0; // rough estimate

      const state: "STREAMING" | "LAGGING" | "STOPPED" =
        String(r.health ?? "").includes("HEALTHY") && String(r.pg_state ?? "").includes("SYNCHRONIZED")
          ? "STREAMING"
          : String(r.pg_state ?? "").includes("SYNCHRONIZING")
            ? "LAGGING"
            : "STOPPED";

      return {
        replicaName: String(r.replica_name ?? "unknown"),
        state,
        lagSeconds: redoKb > 0 ? lagSeconds : null,
        detailJson: {
          pgState: r.pg_state,
          health: r.health,
          redoQueueKb: r.redo_queue_kb,
          sendQueueKb: r.send_queue_kb,
        },
      };
    });
  } catch {
    // No Always On / VIEW SERVER STATE not granted
    return [];
  }
}

// ── main export ────────────────────────────────────────────────
export async function collectSqlServer(
  connConfig: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  },
  opts: CollectOptions,
): Promise<CollectResult> {
  const pool = await connectMssql(connConfig);

  try {
    const slowQueries = await collectSlowQueries(pool, opts);
    const indexStats = await collectIndexStats(pool);
    const tableSizes = await collectTableSizes(pool);
    const fileSizes = await collectFileSizes(pool);
    const connectionStat = await collectConnectionStat(pool);
    const replicationStatus = await collectReplication(pool);

    return { slowQueries, indexStats, tableSizes, fileSizes, connectionStat, replicationStatus };
  } finally {
    await pool.close().catch(() => {});
  }
}
