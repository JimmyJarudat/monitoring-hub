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
  // max_connections — 0 in sys.configurations means "no limit" (32767)
  let maxConnections = 32767;
  try {
    const maxResult = await pool.request().query(
      `SELECT value_in_use AS max_connections FROM sys.configurations WHERE name = 'max connections'`,
    );
    const raw = parseInt(String(maxResult.recordset[0]?.max_connections ?? 0), 10);
    if (raw > 0) maxConnections = raw;
  } catch { /* insufficient privilege — keep default */ }

  // Connection aggregates — filter to current database only
  // blocking_session_id lives in sys.dm_exec_requests (not dm_exec_sessions on all editions)
  try {
    const sessResult = await pool.request().query(`
      SELECT
        COUNT(*)                                                                        AS total,
        SUM(CASE WHEN s.status = 'running'  THEN 1 ELSE 0 END)                         AS active,
        SUM(CASE WHEN s.status = 'sleeping' AND s.open_transaction_count = 0
                 THEN 1 ELSE 0 END)                                                     AS idle,
        SUM(CASE WHEN s.status = 'sleeping' AND s.open_transaction_count > 0
                 THEN 1 ELSE 0 END)                                                     AS idle_in_transaction,
        SUM(CASE WHEN COALESCE(r.blocking_session_id, 0) > 0 THEN 1 ELSE 0 END)        AS blocked_count,
        MAX(CASE WHEN COALESCE(r.blocking_session_id, 0) > 0
                 THEN DATEDIFF(SECOND, r.start_time, GETDATE())
                 ELSE NULL END)                                                          AS longest_blocked_seconds
      FROM sys.dm_exec_sessions s
      LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
      WHERE s.is_user_process = 1
        AND DB_NAME(s.database_id) = DB_NAME()
    `);

    const loginResult = await pool.request().query(`
      SELECT login_name, COUNT(*) AS cnt
      FROM sys.dm_exec_sessions
      WHERE is_user_process = 1
        AND DB_NAME(database_id) = DB_NAME()
      GROUP BY login_name
      ORDER BY cnt DESC
    `);

    const procResult = await pool.request().query(`
      SELECT TOP 50
        s.session_id                                           AS pid,
        s.login_name,
        ISNULL(s.program_name, '')                            AS app_name,
        s.status,
        DATEDIFF(SECOND, s.last_request_start_time, GETDATE()) AS duration_sec,
        DB_NAME(s.database_id)                                AS database,
        CASE WHEN COALESCE(r.blocking_session_id, 0) > 0 THEN 1 ELSE 0 END AS is_blocked
      FROM sys.dm_exec_sessions s
      LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
      WHERE s.is_user_process = 1
        AND DB_NAME(s.database_id) = DB_NAME()
      ORDER BY s.last_request_start_time ASC
    `);

    const s = sessResult.recordset[0] ?? {};
    const loginBreakdown: Record<string, number> = {};
    for (const r of loginResult.recordset as any[]) {
      loginBreakdown[String(r.login_name ?? "(unknown)")] = parseInt(String(r.cnt), 10) || 0;
    }
    const processList = (procResult.recordset as any[]).map((r) => ({
      pid: parseInt(String(r.pid), 10) || 0,
      loginName: String(r.login_name ?? "(unknown)"),
      appName: String(r.app_name ?? ""),
      status: String(r.status ?? ""),
      durationSec: r.duration_sec != null ? parseInt(String(r.duration_sec), 10) : null,
      database: String(r.database ?? ""),
      isBlocked: r.is_blocked === 1 || r.is_blocked === true,
    }));

    return {
      total: parseInt(String(s.total ?? 0), 10),
      active: parseInt(String(s.active ?? 0), 10),
      idle: parseInt(String(s.idle ?? 0), 10),
      idleInTransaction: parseInt(String(s.idle_in_transaction ?? 0), 10),
      maxConnections,
      blockedCount: parseInt(String(s.blocked_count ?? 0), 10),
      longestBlockedSeconds:
        s.longest_blocked_seconds != null ? parseFloat(String(s.longest_blocked_seconds)) : null,
      loginBreakdown,
      processList,
    };
  } catch {
    // VIEW SERVER STATE not granted — fall back to current-session-only count
    try {
      const fallback = await pool.request().query(
        `SELECT COUNT(*) AS total FROM sys.dm_exec_sessions WHERE session_id = @@SPID`,
      );
      return {
        total: parseInt(String(fallback.recordset[0]?.total ?? 1), 10),
        active: 1, idle: 0, idleInTransaction: 0,
        maxConnections, blockedCount: 0, longestBlockedSeconds: null,
      };
    } catch {
      return { total: 0, active: 0, idle: 0, idleInTransaction: 0, maxConnections, blockedCount: 0, longestBlockedSeconds: null };
    }
  }
}

// ── replication — try AG → Log Shipping → Mirroring ───────────
async function collectReplication(pool: MssqlPool): Promise<ReplicationRow[]> {
  // 1. Always On Availability Groups
  try {
    const result = await pool.request().query(`
      SELECT
        ar.replica_server_name                         AS replica_name,
        drs.synchronization_state_desc                 AS sync_state,
        drs.synchronization_health_desc                AS health,
        drs.redo_queue_size                            AS redo_queue_kb,
        drs.log_send_queue_size                        AS send_queue_kb,
        drs.last_redone_time                           AS last_redone_time
      FROM sys.dm_hadr_database_replica_states drs
      JOIN sys.availability_replicas ar ON drs.replica_id = ar.replica_id
      WHERE drs.is_local = 0
    `);

    if (result.recordset.length > 0) {
      return result.recordset.map((r: any) => {
        const redoKb = parseFloat(String(r.redo_queue_kb ?? 0)) || 0;
        const syncState = String(r.sync_state ?? "").toUpperCase();
        const health = String(r.health ?? "").toUpperCase();

        const state: "STREAMING" | "LAGGING" | "STOPPED" =
          health.includes("HEALTHY") && syncState.includes("SYNCHRONIZED")
            ? "STREAMING"
            : syncState.includes("SYNCHRONIZING")
              ? "LAGGING"
              : "STOPPED";

        return {
          replicaName: String(r.replica_name ?? "unknown"),
          state,
          lagSeconds: redoKb > 0 ? redoKb / 1024 : null, // rough KB-based estimate
          detailJson: {
            type: "AlwaysOn_AG",
            syncState: r.sync_state,
            health: r.health,
            redoQueueKb: r.redo_queue_kb,
            sendQueueKb: r.send_queue_kb,
            lastRedonetime: r.last_redone_time,
          },
        };
      });
    }
  } catch {
    // VIEW SERVER STATE not granted or no AG configured
  }

  // 2. Log Shipping
  try {
    const result = await pool.request().query(`
      SELECT
        secondary_server                               AS replica_name,
        secondary_database                             AS secondary_db,
        last_restored_date                             AS last_applied,
        restore_threshold                              AS restore_threshold_min,
        CASE
          WHEN last_restored_date IS NULL THEN 'STOPPED'
          WHEN DATEDIFF(MINUTE, last_restored_date, GETDATE()) > restore_threshold THEN 'LAGGING'
          ELSE 'STREAMING'
        END                                            AS state_flag,
        DATEDIFF(SECOND, last_restored_date, GETDATE()) AS lag_seconds
      FROM msdb.dbo.log_shipping_monitor_secondary
      WHERE primary_database = DB_NAME()
    `);

    if (result.recordset.length > 0) {
      return result.recordset.map((r: any) => {
        const lagSeconds = r.lag_seconds != null ? parseInt(String(r.lag_seconds), 10) : null;
        const stateFlag = String(r.state_flag ?? "STOPPED");
        const state: "STREAMING" | "LAGGING" | "STOPPED" =
          stateFlag === "STREAMING" ? "STREAMING" : stateFlag === "LAGGING" ? "LAGGING" : "STOPPED";

        return {
          replicaName: `${String(r.replica_name ?? "unknown")}\\${String(r.secondary_db ?? "")}`,
          state,
          lagSeconds,
          detailJson: {
            type: "LogShipping",
            secondaryServer: r.replica_name,
            secondaryDatabase: r.secondary_db,
            lastApplied: r.last_applied,
            restoreThresholdMin: r.restore_threshold_min,
          },
        };
      });
    }
  } catch {
    // msdb not accessible or no log shipping
  }

  // 3. Database Mirroring (deprecated in SQL Server 2016+ but still in use)
  try {
    const result = await pool.request().query(`
      SELECT
        mirroring_partner_name                         AS replica_name,
        mirroring_state_desc                           AS mirror_state,
        mirroring_role_desc                            AS role,
        mirroring_safety_level_desc                    AS safety,
        mirroring_witness_name                         AS witness
      FROM sys.database_mirroring
      WHERE mirroring_guid IS NOT NULL
        AND DB_NAME(database_id) = DB_NAME()
    `);

    if (result.recordset.length > 0) {
      return result.recordset.map((r: any) => {
        const mirrorState = String(r.mirror_state ?? "").toUpperCase();
        const state: "STREAMING" | "LAGGING" | "STOPPED" =
          mirrorState === "SYNCHRONIZED" || mirrorState === "SYNCHRONIZING"
            ? mirrorState === "SYNCHRONIZED" ? "STREAMING" : "LAGGING"
            : "STOPPED";

        return {
          replicaName: String(r.replica_name ?? "unknown"),
          state,
          lagSeconds: null,
          detailJson: {
            type: "Mirroring",
            mirrorState: r.mirror_state,
            role: r.role,
            safety: r.safety,
            witness: r.witness,
          },
        };
      });
    }
  } catch {
    // No mirroring configured
  }

  return [];
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
