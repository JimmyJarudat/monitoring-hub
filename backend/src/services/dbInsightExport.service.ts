import ExcelJS from "exceljs";
import prisma from "../lib/prisma";

const C = {
  headerBg: "FF075985",
  headerFg: "FFFFFFFF",
  thBg: "FFDFF6FF",
  thFg: "FF0E7490",
  border: "FFBAE6FD",
  rowAlt: "FFF0F9FF",
  sheetTab: "FF0284C7",
  summaryBg: "FFE0F2FE",
  summaryFg: "FF075985",
  warnBg: "FFFEF3C7",
  warnFg: "FF92400E",
  badBg: "FFFFE4E6",
  badFg: "FFBE123C",
  goodBg: "FFDCFCE7",
  goodFg: "FF166534",
};

const snapshotInclude = {
  config: { include: { monitor: true } },
  slowQueries: { orderBy: { avgDurationMs: "desc" as const } },
  indexStats: {
    orderBy: [{ status: "asc" as const }, { scansCount: "asc" as const }] as { status?: "asc" | "desc"; scansCount?: "asc" | "desc" }[],
  },
  tableSizes: { orderBy: { totalBytes: "desc" as const } },
  fileSizes: true,
  connectionStats: true,
  replicationStatus: true,
} as const;

type InsightSnapshot = NonNullable<Awaited<ReturnType<typeof prisma.dbInsightSnapshot.findFirst<{ include: typeof snapshotInclude }>>>>;

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: C.border } },
  left: { style: "thin", color: { argb: C.border } },
  bottom: { style: "thin", color: { argb: C.border } },
  right: { style: "thin", color: { argb: C.border } },
};

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const num = (value: bigint | number | null | undefined) => value == null ? null : Number(value);
const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const fmtBytes = (value: bigint | number | null | undefined) => {
  const bytes = num(value);
  if (bytes == null) return "";
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const fmtCount = (value: bigint | number | null | undefined) => {
  const n = num(value);
  if (n == null) return "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
};

const fmtDateTime = (value: Date | string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
};

const fmtMs = (value: number | null | undefined) => {
  if (value == null) return "";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value.toFixed(0)}ms`;
};

const fmtSeconds = (value: number | null | undefined) => {
  if (value == null) return "";
  if (value >= 3600) return `${(value / 3600).toFixed(1)}h`;
  if (value >= 60) return `${(value / 60).toFixed(1)}m`;
  return `${value.toFixed(1)}s`;
};

function styleSheet(ws: ExcelJS.Worksheet) {
  ws.properties.tabColor = { argb: C.sheetTab };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };
  ws.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 22 : undefined;
    row.eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
        cell.font = { bold: true, color: { argb: C.headerFg } };
      } else if (rowNumber % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rowAlt } };
      }
    });
  });
}

function addRows<T extends Record<string, unknown>>(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: keyof T; width?: number }[], rows: T[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: String(c.key), width: c.width ?? 18 }));
  rows.forEach((row) => ws.addRow(row));
  styleSheet(ws);
  return ws;
}

function addSummary(wb: ExcelJS.Workbook, snapshot: InsightSnapshot) {
  const monitor = snapshot.config.monitor;
  const ws = wb.addWorksheet("Summary");
  ws.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 56 },
  ];

  const monitorConfig = monitor.config && typeof monitor.config === "object" && !Array.isArray(monitor.config)
    ? monitor.config as Record<string, unknown>
    : {};
  const target = typeof monitorConfig.host === "string"
    ? `${monitorConfig.host}${typeof monitorConfig.port === "number" ? `:${monitorConfig.port}` : ""}${typeof monitorConfig.database === "string" ? `/${monitorConfig.database}` : ""}`
    : typeof monitorConfig.uri === "string"
      ? "URI configured"
      : "";

  [
    ["Monitor", monitor.name],
    ["Database type", snapshot.dbType],
    ["Target", target],
    ["Collected at", fmtDateTime(snapshot.collectedAt)],
    ["Collection duration", fmtMs(snapshot.collectionDurationMs)],
    ["Slow query threshold ms", snapshot.config.slowQueryThresholdMs],
    ["Top N queries", snapshot.config.topNQueries],
    ["Slow queries", snapshot.slowQueries.length],
    ["Index findings", snapshot.indexStats.filter((i) => i.status !== "HEALTHY").length],
    ["Blocked connections", snapshot.connectionStats?.blockedCount ?? ""],
    ["Replication rows", snapshot.replicationStatus.length],
    ["Error", snapshot.errorMessage ?? ""],
  ].forEach(([field, value]) => ws.addRow({ field, value }));

  styleSheet(ws);
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.summaryBg } };
    row.getCell(1).font = { bold: true, color: { argb: C.summaryFg } };
  });
}

function colorStatusCells(ws: ExcelJS.Worksheet, columnKey: string) {
  const column = ws.getColumn(columnKey);
  column.eachCell((cell, rowNumber) => {
    if (rowNumber === 1) return;
    const value = String(cell.value ?? "");
    if (value === "HEALTHY" || value === "STREAMING") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.goodBg } };
      cell.font = { color: { argb: C.goodFg }, bold: true };
    } else if (value === "UNUSED" || value === "LAGGING") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
      cell.font = { color: { argb: C.warnFg }, bold: true };
    } else if (value === "MISSING" || value === "STOPPED") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.badBg } };
      cell.font = { color: { argb: C.badFg }, bold: true };
    }
  });
}

export async function generateDbInsightExcel(monitorId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const snapshot = await prisma.dbInsightSnapshot.findFirst({
    where: { monitorId },
    orderBy: { collectedAt: "desc" },
    include: snapshotInclude,
  });

  if (!snapshot) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "MonitoringHub";
  wb.created = new Date();
  wb.modified = new Date();

  addSummary(wb, snapshot);

  addRows(wb, "Slow Queries", [
    { header: "Query", key: "queryText", width: 90 },
    { header: "Avg Duration", key: "avgDuration", width: 18 },
    { header: "Max Duration", key: "maxDuration", width: 18 },
    { header: "Calls", key: "callCount", width: 14 },
    { header: "Rows Examined", key: "rowsExamined", width: 16 },
    { header: "Query Hash", key: "queryHash", width: 36 },
  ], snapshot.slowQueries.map((q) => ({
    queryText: q.queryText,
    avgDuration: fmtMs(q.avgDurationMs),
    maxDuration: fmtMs(q.maxDurationMs),
    callCount: fmtCount(q.callCount),
    rowsExamined: fmtCount(q.rowsExamined),
    queryHash: q.queryHash,
  })));

  const indexWs = addRows(wb, "Indexes", [
    { header: "Status", key: "status", width: 14 },
    { header: "Table", key: "tableName", width: 32 },
    { header: "Index", key: "indexName", width: 32 },
    { header: "Scans", key: "scansCount", width: 14 },
    { header: "Size", key: "size", width: 16 },
    { header: "Last Used", key: "lastUsed", width: 24 },
    { header: "Suggested SQL", key: "suggestedSql", width: 90 },
  ], snapshot.indexStats.map((i) => ({
    status: i.status,
    tableName: i.tableName,
    indexName: i.indexName ?? "",
    scansCount: fmtCount(i.scansCount),
    size: fmtBytes(i.sizeBytes),
    lastUsed: fmtDateTime(i.lastUsed),
    suggestedSql: i.suggestedSql ?? "",
  })));
  colorStatusCells(indexWs, "status");

  addRows(wb, "Tables", [
    { header: "Table", key: "tableName", width: 36 },
    { header: "Total Size", key: "totalSize", width: 18 },
    { header: "Data Size", key: "dataSize", width: 18 },
    { header: "Index Size", key: "indexSize", width: 18 },
    { header: "Rows", key: "rowCount", width: 16 },
    { header: "Last Analyzed", key: "lastAnalyzedAt", width: 24 },
  ], snapshot.tableSizes.map((t) => ({
    tableName: t.tableName,
    totalSize: fmtBytes(t.totalBytes),
    dataSize: fmtBytes(t.dataBytes),
    indexSize: fmtBytes(t.indexBytes),
    rowCount: fmtCount(t.rowCount),
    lastAnalyzedAt: fmtDateTime(t.lastAnalyzedAt),
  })));

  addRows(wb, "Files", [
    { header: "Type", key: "fileType", width: 14 },
    { header: "Size", key: "size", width: 18 },
    { header: "Path", key: "filePath", width: 90 },
  ], snapshot.fileSizes.map((f) => ({
    fileType: f.fileType,
    size: fmtBytes(f.sizeBytes),
    filePath: f.filePath,
  })));

  const processList = Array.isArray(snapshot.connectionStats?.processListJson)
    ? snapshot.connectionStats.processListJson as Array<Record<string, unknown>>
    : [];
  addRows(wb, "Connections", [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 28 },
  ], [
    { metric: "Total", value: snapshot.connectionStats?.total ?? "" },
    { metric: "Active", value: snapshot.connectionStats?.active ?? "" },
    { metric: "Idle", value: snapshot.connectionStats?.idle ?? "" },
    { metric: "Idle in Transaction", value: snapshot.connectionStats?.idleInTransaction ?? "" },
    { metric: "Max Connections", value: snapshot.connectionStats?.maxConnections ?? "" },
    { metric: "Blocked", value: snapshot.connectionStats?.blockedCount ?? "" },
    { metric: "Longest Blocked", value: fmtSeconds(snapshot.connectionStats?.longestBlockedSeconds) },
  ]);
  addRows(wb, "Sessions", [
    { header: "PID", key: "pid", width: 14 },
    { header: "Login", key: "loginName", width: 24 },
    { header: "Application", key: "appName", width: 28 },
    { header: "Status", key: "status", width: 18 },
    { header: "Duration", key: "duration", width: 16 },
    { header: "Database", key: "database", width: 24 },
    { header: "Blocked", key: "isBlocked", width: 12 },
  ], processList.map((p) => ({
    pid: p.pid ?? "",
    loginName: p.loginName ?? "",
    appName: p.appName ?? "",
    status: p.status ?? "",
    duration: typeof p.durationSec === "number" ? fmtSeconds(p.durationSec) : "",
    database: p.database ?? "",
    isBlocked: p.isBlocked === true ? "YES" : "",
  })));

  const replWs = addRows(wb, "Replication", [
    { header: "Replica", key: "replicaName", width: 34 },
    { header: "State", key: "state", width: 16 },
    { header: "Lag", key: "lag", width: 16 },
    { header: "Details", key: "details", width: 90 },
  ], snapshot.replicationStatus.map((r) => ({
    replicaName: r.replicaName,
    state: r.state,
    lag: fmtSeconds(r.lagSeconds),
    details: Object.entries(asRecord(r.detailJson)).map(([k, v]) => `${titleCase(k)}: ${String(v)}`).join("; "),
  })));
  colorStatusCells(replWs, "state");

  const safeName = snapshot.config.monitor.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "monitor";
  const filename = `db-insight-${safeName}-${snapshot.collectedAt.toISOString().slice(0, 10)}.xlsx`;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename };
}
