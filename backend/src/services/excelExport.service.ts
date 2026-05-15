import ExcelJS from "exceljs";
import prisma from "../lib/prisma";
import { getSystemConfig } from "./systemConfig.service";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";
type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

// ─── colours ────────────────────────────────────────────────────────────────
const C = {
  headerBg: "FF0F172A",
  headerFg: "FFFFFFFF",
  subHeaderBg: "FF164E63",
  subHeaderFg: "FFECFEFF",
  sectionBg: "FF06B6D4",
  sectionFg: "FFFFFFFF",
  upBg: "FFDCFCE7",
  upFg: "FF166534",
  downBg: "FFFFE4E6",
  downFg: "FFBE123C",
  degradedBg: "FFFEF3C7",
  degradedFg: "FF92400E",
  openBg: "FFFFE4E6",
  openFg: "FFBE123C",
  ackedBg: "FFFEF3C7",
  ackedFg: "FF92400E",
  resolvedBg: "FFDCFCE7",
  resolvedFg: "FF166534",
  rowAlt: "FFF8FAFC",
  borderColor: "FFCBD5E1",
  thBg: "FFE2E8F0",
  thFg: "FF334155",
  statLabelBg: "FFF1F5F9",
  warnBg: "FFFEF3C7",
  goodBg: "FFDCFCE7",
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: C.borderColor } },
  left: { style: "thin", color: { argb: C.borderColor } },
  bottom: { style: "thin", color: { argb: C.borderColor } },
  right: { style: "thin", color: { argb: C.borderColor } },
};

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = thinBorder;
}

function styleHeader(cell: ExcelJS.Cell, bgArgb: string, fgArgb: string, fontSize = 11, bold = true) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  cell.font = { color: { argb: fgArgb }, bold, size: fontSize };
  cell.border = thinBorder;
  cell.alignment = { vertical: "middle", wrapText: false };
}

function styleCell(
  cell: ExcelJS.Cell,
  bgArgb?: string,
  fgArgb?: string,
  bold = false,
  align: ExcelJS.Alignment["horizontal"] = "left",
) {
  if (bgArgb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  if (fgArgb) cell.font = { color: { argb: fgArgb }, bold };
  cell.border = thinBorder;
  cell.alignment = { vertical: "middle", horizontal: align };
}

function statusFill(status: MonitorStatus | IncidentStatus | null): { bg: string; fg: string } | null {
  if (status === "UP" || status === "RESOLVED") return { bg: C.upBg, fg: C.upFg };
  if (status === "DOWN" || status === "OPEN") return { bg: C.downBg, fg: C.downFg };
  if (status === "DEGRADED" || status === "ACKNOWLEDGED") return { bg: C.degradedBg, fg: C.degradedFg };
  return null;
}

function formatDuration(startedAt: Date, resolvedAt: Date | null): string {
  const diffMs = Math.max((resolvedAt ?? new Date()).getTime() - startedAt.getTime(), 0);
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── fetch data ──────────────────────────────────────────────────────────────
async function fetchData(from: Date, to: Date) {
  const [results, incidents, groups, sysConfig] = await Promise.all([
    prisma.monitorResult.findMany({
      where: { checkedAt: { gte: from, lte: to } },
      include: { monitor: { select: { id: true, name: true, type: true } } },
      orderBy: { checkedAt: "desc" },
      take: 5000,
    }),
    prisma.incident.findMany({
      where: { startedAt: { gte: from, lte: to } },
      include: {
        monitor: { select: { name: true, type: true } },
        alertRule: { select: { severity: true } },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.monitorGroup.findMany({
      include: { monitors: { include: { monitor: { select: { id: true, name: true, type: true } } } } },
    }),
    getSystemConfig(),
  ]);
  return { results, incidents, groups, sysConfig };
}

// ─── computed summaries ──────────────────────────────────────────────────────
function computeMonitorRanking(results: Awaited<ReturnType<typeof fetchData>>["results"]) {
  const map = new Map<
    string,
    { id: string; name: string; type: string; checks: number; up: number; degraded: number; down: number; responseTimes: number[]; lastStatus: MonitorStatus | null }
  >();

  for (const r of results) {
    const cur = map.get(r.monitorId) ?? {
      id: r.monitorId,
      name: r.monitor.name,
      type: r.monitor.type,
      checks: 0,
      up: 0,
      degraded: 0,
      down: 0,
      responseTimes: [],
      lastStatus: null,
    };
    cur.checks++;
    (cur as Record<string, unknown>)[r.status.toLowerCase()] = ((cur as Record<string, unknown>)[r.status.toLowerCase()] as number) + 1;
    if (r.responseTimeMs != null) cur.responseTimes.push(r.responseTimeMs);
    if (!cur.lastStatus) cur.lastStatus = r.status as MonitorStatus;
    map.set(r.monitorId, cur);
  }

  return Array.from(map.values())
    .map((item) => ({
      monitor: item.name,
      type: item.type,
      checks: item.checks,
      uptime: item.checks > 0 ? Math.round((item.up / item.checks) * 10000) / 100 : null,
      down: item.down,
      degraded: item.degraded,
      avgResponseMs:
        item.responseTimes.length > 0
          ? Math.round(item.responseTimes.reduce((a, b) => a + b, 0) / item.responseTimes.length)
          : null,
      lastStatus: item.lastStatus,
    }))
    .sort((a, b) => (a.uptime ?? 100) - (b.uptime ?? 100));
}

function computeGroupSummary(
  groups: Awaited<ReturnType<typeof fetchData>>["groups"],
  results: Awaited<ReturnType<typeof fetchData>>["results"],
  incidents: Awaited<ReturnType<typeof fetchData>>["incidents"],
) {
  return groups.map((group) => {
    const monitorIds = new Set(group.monitors.map((m) => m.monitorId));
    const gr = results.filter((r) => monitorIds.has(r.monitorId));
    const up = gr.filter((r) => r.status === "UP").length;
    const down = gr.filter((r) => r.status === "DOWN").length;
    const degraded = gr.filter((r) => r.status === "DEGRADED").length;
    const gi = incidents.filter((i) => monitorIds.has(i.monitorId));
    const rts = gr.map((r) => r.responseTimeMs).filter((v): v is number => v != null);
    return {
      name: group.name,
      monitorCount: group.monitors.length,
      checks: gr.length,
      uptime: gr.length > 0 ? Math.round((up / gr.length) * 10000) / 100 : null,
      up,
      down,
      degraded,
      incidents: gi.length,
      avgResponseMs: rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null,
    };
  });
}

// ─── sheet builders ──────────────────────────────────────────────────────────
function buildSummarySheet(
  wb: ExcelJS.Workbook,
  from: Date,
  to: Date,
  results: Awaited<ReturnType<typeof fetchData>>["results"],
  incidents: Awaited<ReturnType<typeof fetchData>>["incidents"],
  sysConfig: Awaited<ReturnType<typeof fetchData>>["sysConfig"],
  rangeLabel: string,
) {
  const ws = wb.addWorksheet("Executive Summary");
  ws.columns = [
    { width: 30 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  const companyName = sysConfig.reportBranding.companyName || sysConfig.general.systemName;
  const generatedAt = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  const fromStr = from.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  const toStr = to.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

  // Title block
  ws.mergeCells("A1:F1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${companyName} — Availability Report`;
  titleCell.font = { color: { argb: C.headerFg }, bold: true, size: 16 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  ws.mergeCells("A2:F2");
  const subCell = ws.getCell("A2");
  subCell.value = `Range: ${rangeLabel} (${fromStr} → ${toStr})`;
  styleHeader(subCell, C.subHeaderBg, C.subHeaderFg, 10, false);
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells("A3:F3");
  const genCell = ws.getCell("A3");
  genCell.value = `Generated: ${generatedAt}`;
  styleHeader(genCell, C.subHeaderBg, C.subHeaderFg, 10, false);
  genCell.alignment = { horizontal: "center", vertical: "middle" };

  // Spacer
  ws.getRow(4).height = 8;

  // KPI header
  ws.mergeCells("A5:F5");
  const kpiHeader = ws.getCell("A5");
  kpiHeader.value = "Key Metrics";
  styleHeader(kpiHeader, C.sectionBg, C.sectionFg, 12);
  kpiHeader.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 24;

  // KPI column headers
  const kpiLabels = ["Checks", "UP", "DEGRADED", "DOWN", "Incidents (open)", "Avg Response (ms)"];
  kpiLabels.forEach((label, i) => {
    const cell = ws.getCell(6, i + 1);
    cell.value = label;
    styleHeader(cell, C.thBg, C.thFg, 10);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(6).height = 20;

  const up = results.filter((r) => r.status === "UP").length;
  const down = results.filter((r) => r.status === "DOWN").length;
  const degraded = results.filter((r) => r.status === "DEGRADED").length;
  const checks = results.length;
  const openIncidents = incidents.filter((i) => i.status === "OPEN").length;
  const rts = results.map((r) => r.responseTimeMs).filter((v): v is number => v != null);
  const avgResponse = rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

  const kpiValues = [checks, up, degraded, down, openIncidents, avgResponse ?? "-"];
  const kpiFills: (string | null)[] = [null, C.upBg, C.degradedBg, C.downBg, down > 0 ? C.downBg : C.upBg, null];
  const kpiFgs: (string | null)[] = [null, C.upFg, C.degradedFg, C.downFg, down > 0 ? C.downFg : C.upFg, null];
  kpiValues.forEach((val, i) => {
    const cell = ws.getCell(7, i + 1);
    cell.value = val;
    styleCell(cell, kpiFills[i] ?? undefined, kpiFgs[i] ?? undefined, true, "center");
  });
  ws.getRow(7).height = 24;

  // Uptime row
  ws.getRow(8).height = 8;
  ws.mergeCells("A9:F9");
  const uptimeCell = ws.getCell("A9");
  const uptime = checks > 0 ? Math.round((up / checks) * 10000) / 100 : null;
  uptimeCell.value = uptime != null ? `Report Uptime: ${uptime}%` : "Report Uptime: N/A (no data)";
  const uptimeBg = uptime == null ? C.thBg : uptime >= 99 ? C.upBg : uptime >= 95 ? C.degradedBg : C.downBg;
  const uptimeFg = uptime == null ? C.thFg : uptime >= 99 ? C.upFg : uptime >= 95 ? C.degradedFg : C.downFg;
  styleHeader(uptimeCell, uptimeBg, uptimeFg, 14);
  uptimeCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(9).height = 32;

  // Spacer
  ws.getRow(10).height = 8;

  // Status distribution
  ws.mergeCells("A11:F11");
  const distHeader = ws.getCell("A11");
  distHeader.value = "Status Distribution";
  styleHeader(distHeader, C.sectionBg, C.sectionFg, 12);
  distHeader.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(11).height = 22;

  const distRows = [
    { Status: "UP", Count: up, Percentage: checks > 0 ? `${Math.round((up / checks) * 1000) / 10}%` : "N/A" },
    { Status: "DEGRADED", Count: degraded, Percentage: checks > 0 ? `${Math.round((degraded / checks) * 1000) / 10}%` : "N/A" },
    { Status: "DOWN", Count: down, Percentage: checks > 0 ? `${Math.round((down / checks) * 1000) / 10}%` : "N/A" },
  ];
  ["Status", "Count", "Percentage"].forEach((label, i) => {
    const cell = ws.getCell(12, i + 1);
    cell.value = label;
    styleHeader(cell, C.thBg, C.thFg, 10);
  });
  ws.getRow(12).height = 18;

  distRows.forEach((row, ri) => {
    const fill = statusFill(row.Status as MonitorStatus);
    ws.getCell(13 + ri, 1).value = row.Status;
    ws.getCell(13 + ri, 2).value = row.Count;
    ws.getCell(13 + ri, 3).value = row.Percentage;
    for (let ci = 1; ci <= 3; ci++) {
      styleCell(ws.getCell(13 + ri, ci), fill?.bg, fill?.fg, true, "center");
    }
  });

  // Footer text
  if (sysConfig.reportBranding.footerText) {
    const footerRow = 17;
    ws.mergeCells(`A${footerRow}:F${footerRow}`);
    const footerCell = ws.getCell(`A${footerRow}`);
    footerCell.value = sysConfig.reportBranding.footerText;
    footerCell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    footerCell.alignment = { horizontal: "center" };
  }
}

function buildMonitorSheet(
  wb: ExcelJS.Workbook,
  ranking: ReturnType<typeof computeMonitorRanking>,
) {
  const ws = wb.addWorksheet("Monitor Reliability");
  ws.columns = [
    { header: "Monitor", key: "monitor", width: 32 },
    { header: "Type", key: "type", width: 12 },
    { header: "Checks", key: "checks", width: 10 },
    { header: "Uptime %", key: "uptime", width: 12 },
    { header: "Down", key: "down", width: 10 },
    { header: "Degraded", key: "degraded", width: 10 },
    { header: "Avg Response (ms)", key: "avgResponseMs", width: 18 },
    { header: "Last Status", key: "lastStatus", width: 13 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    styleHeader(cell, C.headerBg, C.headerFg, 10);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Data rows
  ranking.forEach((item, i) => {
    const row = ws.addRow({
      monitor: item.monitor,
      type: item.type,
      checks: item.checks,
      uptime: item.uptime,
      down: item.down,
      degraded: item.degraded,
      avgResponseMs: item.avgResponseMs,
      lastStatus: item.lastStatus,
    });
    row.height = 18;
    const altBg = i % 2 === 1 ? C.rowAlt : undefined;

    row.eachCell((cell, colNum) => {
      if (colNum === 4) {
        // Uptime % — conditional colour
        const v = typeof cell.value === "number" ? cell.value : null;
        const bg = v == null ? altBg : v >= 99 ? C.upBg : v >= 95 ? C.warnBg : C.downBg;
        const fg = v == null ? undefined : v >= 99 ? C.upFg : v >= 95 ? C.degradedFg : C.downFg;
        styleCell(cell, bg, fg, v != null && v < 99, "center");
        if (typeof cell.value === "number") cell.numFmt = '0.00"%"';
      } else if (colNum === 8) {
        const fill = statusFill(cell.value as MonitorStatus | null);
        styleCell(cell, fill?.bg ?? altBg, fill?.fg, !!fill, "center");
      } else {
        styleCell(cell, altBg, undefined, false, colNum <= 2 ? "left" : "center");
      }
    });
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
}

function buildIncidentSheet(
  wb: ExcelJS.Workbook,
  incidents: Awaited<ReturnType<typeof fetchData>>["incidents"],
) {
  const ws = wb.addWorksheet("Incident Report");
  ws.columns = [
    { header: "Started", key: "started", width: 20 },
    { header: "Monitor", key: "monitor", width: 30 },
    { header: "Type", key: "type", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Duration", key: "duration", width: 12 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Resolved At", key: "resolvedAt", width: 20 },
    { header: "Message", key: "message", width: 40 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    styleHeader(cell, C.headerBg, C.headerFg, 10);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  incidents.forEach((inc, i) => {
    const altBg = i % 2 === 1 ? C.rowAlt : undefined;
    const row = ws.addRow({
      started: inc.startedAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      monitor: inc.monitor.name,
      type: inc.monitor.type,
      status: inc.status,
      duration: formatDuration(inc.startedAt, inc.resolvedAt),
      severity: inc.alertRule?.severity ?? "-",
      resolvedAt: inc.resolvedAt ? inc.resolvedAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "-",
      message: inc.message ?? "-",
    });
    row.height = 18;
    row.eachCell((cell, colNum) => {
      if (colNum === 4) {
        const fill = statusFill(cell.value as IncidentStatus | null);
        styleCell(cell, fill?.bg ?? altBg, fill?.fg, !!fill, "center");
      } else {
        styleCell(cell, altBg, undefined, false, colNum <= 2 || colNum >= 7 ? "left" : "center");
      }
    });
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
}

function buildGroupSheet(
  wb: ExcelJS.Workbook,
  groupSummary: ReturnType<typeof computeGroupSummary>,
) {
  const ws = wb.addWorksheet("Group Summary");
  ws.columns = [
    { header: "Group", key: "name", width: 28 },
    { header: "Monitors", key: "monitorCount", width: 11 },
    { header: "Checks", key: "checks", width: 10 },
    { header: "Uptime %", key: "uptime", width: 12 },
    { header: "UP", key: "up", width: 9 },
    { header: "Down", key: "down", width: 9 },
    { header: "Degraded", key: "degraded", width: 10 },
    { header: "Incidents", key: "incidents", width: 11 },
    { header: "Avg Response (ms)", key: "avgResponseMs", width: 18 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    styleHeader(cell, C.headerBg, C.headerFg, 10);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  groupSummary.forEach((group, i) => {
    const altBg = i % 2 === 1 ? C.rowAlt : undefined;
    const row = ws.addRow(group);
    row.height = 18;
    row.eachCell((cell, colNum) => {
      if (colNum === 4) {
        const v = typeof cell.value === "number" ? cell.value : null;
        const bg = v == null ? altBg : v >= 99 ? C.upBg : v >= 95 ? C.warnBg : C.downBg;
        const fg = v == null ? undefined : v >= 99 ? C.upFg : v >= 95 ? C.degradedFg : C.downFg;
        styleCell(cell, bg, fg, v != null && v < 99, "center");
        if (typeof cell.value === "number") cell.numFmt = '0.00"%"';
      } else {
        styleCell(cell, altBg, undefined, false, colNum === 1 ? "left" : "center");
      }
    });
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
}

function buildRawResultsSheet(
  wb: ExcelJS.Workbook,
  results: Awaited<ReturnType<typeof fetchData>>["results"],
) {
  const ws = wb.addWorksheet("Raw Results");
  ws.columns = [
    { header: "Monitor", key: "monitor", width: 32 },
    { header: "Type", key: "type", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Response (ms)", key: "responseTimeMs", width: 15 },
    { header: "Checked At", key: "checkedAt", width: 20 },
    { header: "Message", key: "message", width: 50 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    styleHeader(cell, C.headerBg, C.headerFg, 10);
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  const sample = results.slice(0, 500);
  sample.forEach((r, i) => {
    const altBg = i % 2 === 1 ? C.rowAlt : undefined;
    const row = ws.addRow({
      monitor: r.monitor.name,
      type: r.monitor.type,
      status: r.status,
      responseTimeMs: r.responseTimeMs ?? "-",
      checkedAt: r.checkedAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      message: r.message ?? "-",
    });
    row.height = 18;
    row.eachCell((cell, colNum) => {
      if (colNum === 3) {
        const fill = statusFill(cell.value as MonitorStatus | null);
        styleCell(cell, fill?.bg ?? altBg, fill?.fg, !!fill, "center");
      } else {
        styleCell(cell, altBg, undefined, false, colNum <= 2 || colNum >= 5 ? "left" : "center");
      }
    });
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };

  if (results.length > 500) {
    const note = ws.addRow({ monitor: `(Showing 500 of ${results.length} results — export filtered for brevity)` });
    note.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
    ws.mergeCells(`A${note.number}:F${note.number}`);
  }
}

// ─── main export ─────────────────────────────────────────────────────────────
export async function generateExcelReport(from: Date, to: Date, rangeLabel: string): Promise<Buffer> {
  const { results, incidents, groups, sysConfig } = await fetchData(from, to);
  const ranking = computeMonitorRanking(results);
  const groupSummary = computeGroupSummary(groups, results, incidents);

  const wb = new ExcelJS.Workbook();
  wb.creator = sysConfig.reportBranding.companyName || sysConfig.general.systemName;
  wb.created = new Date();
  wb.modified = new Date();

  buildSummarySheet(wb, from, to, results, incidents, sysConfig, rangeLabel);
  buildMonitorSheet(wb, ranking);
  buildIncidentSheet(wb, incidents);
  buildGroupSheet(wb, groupSummary);
  buildRawResultsSheet(wb, results);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
