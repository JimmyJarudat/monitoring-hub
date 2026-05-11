import type { MonitorStatus, MonitorType } from "../../generated/prisma/enums";

export type DowntimeWindow = {
  start: string;
  end: string | null;
};

export type DailyStatusMonitor = {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  status: MonitorStatus | "UNKNOWN";
  message: string | null;
  checkedAt: string | null;
  downtimeWindows: DowntimeWindow[];
};

export type DailyStatusReportTemplateData = {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  todayLabel: string;
  total: number;
  online: number;
  offline: number;
  degraded: number;
  unknown: number;
  incidentsInWindow: number;
  openIncidents: number;
  allMonitors: DailyStatusMonitor[];
  offlineMonitors: DailyStatusMonitor[];
  degradedMonitors: DailyStatusMonitor[];
  unknownMonitors: DailyStatusMonitor[];
};

// ── Formatters ────────────────────────────────────────────────────

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" });

const formatDateTime = (value: string | null) => (value ? fmtDateTime.format(new Date(value)) : "-");
const formatTime = (value: string | null) => (value ? fmtTime.format(new Date(value)) : "-");

const formatDowntimeWindows = (windows: DowntimeWindow[]) =>
  windows
    .map((w) => `${formatTime(w.start)} → ${w.end ? formatTime(w.end) : "still down"}`)
    .join(", ");

// ── Per-monitor helpers ───────────────────────────────────────────

const statusIcon = (status: MonitorStatus | "UNKNOWN") => {
  if (status === "UP") return "✅";
  if (status === "DOWN") return "❌";
  if (status === "DEGRADED") return "⚠️";
  return "❓";
};

const monitorStatusLabel = (m: DailyStatusMonitor) => {
  if (m.status === "UP") return m.downtimeWindows.length > 0 ? "Online but had downtime in this period" : "Online";
  if (m.status === "DOWN") return "Currently offline";
  if (m.status === "DEGRADED") return "Currently degraded";
  return "Unknown status";
};

const monitorListText = (monitors: DailyStatusMonitor[]) =>
  monitors
    .map((m) => {
      const line = `${statusIcon(m.status)} ${m.name} (${m.target}) - ${monitorStatusLabel(m)}`;
      if (m.downtimeWindows.length === 0) return line;
      return `${line}\n   └ Downtime: ${formatDowntimeWindows(m.downtimeWindows)}`;
    })
    .join("\n");

// ── Plain text (shared by Telegram / Slack / Discord) ────────────

const plainText = (data: DailyStatusReportTemplateData) =>
  [
    "📊 Monitoring Hub - Daily Status Summary",
    `Date: ${data.todayLabel}`,
    `Period: ${formatTime(data.windowStart)} - ${formatTime(data.windowEnd)}`,
    "",
    `Summary: Online ${data.online}/${data.total}  |  Offline ${data.offline}  |  Degraded ${data.degraded}  |  Unknown ${data.unknown}`,
    "",
    "─── Monitor Status ───",
    data.allMonitors.length > 0 ? monitorListText(data.allMonitors) : "No monitors",
    "",
    `Incidents in last 24h: ${data.incidentsInWindow}  |  Open: ${data.openIncidents}`,
    `Generated: ${formatDateTime(data.generatedAt)}`,
  ].join("\n");

// ── Email ────────────────────────────────────────────────────────

const monitorRowsHtml = (monitors: DailyStatusMonitor[]) =>
  monitors
    .map((m) => {
      const downtime = m.downtimeWindows.length > 0 ? escapeHtml(formatDowntimeWindows(m.downtimeWindows)) : "-";
      const rowBg = m.status === "DOWN" ? "#fff1f2" : m.status === "DEGRADED" ? "#fffbeb" : "";
      return `<tr style="background:${rowBg}">
        <td style="padding:7px 10px;font-size:16px">${statusIcon(m.status)}</td>
        <td style="padding:7px 10px">
          <div style="font-weight:600">${escapeHtml(m.name)}</div>
          <div style="font-size:11px;color:#94a3b8">${escapeHtml(m.target)}</div>
        </td>
        <td style="padding:7px 10px;color:#64748b;font-size:12px">${m.type}</td>
        <td style="padding:7px 10px">${escapeHtml(monitorStatusLabel(m))}</td>
        <td style="padding:7px 10px;color:${m.downtimeWindows.length > 0 ? "#dc2626" : "#94a3b8"};font-size:12px">${downtime}</td>
      </tr>`;
    })
    .join("");

export const buildDailyReportEmailMessage = (data: DailyStatusReportTemplateData) => {
  const subject = `[Monitoring Hub] Daily status report - ${data.todayLabel}`;
  const text = plainText(data);
  const allGood = data.offline === 0 && data.degraded === 0 && data.unknown === 0;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:720px">
      <h2 style="margin-bottom:4px">📊 Daily Status Summary</h2>
      <p style="color:#64748b;margin-top:0;font-size:14px">
        ${escapeHtml(data.todayLabel)} &nbsp;·&nbsp; Period: ${formatTime(data.windowStart)} – ${formatTime(data.windowEnd)}
      </p>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;width:100%">
        <tr style="background:#f8fafc;text-align:center">
          <td style="padding:14px 18px">
            <div style="font-size:26px;font-weight:700;color:${allGood ? "#047857" : "#dc2626"}">${data.online}/${data.total}</div>
            <div style="font-size:12px;color:#64748b">Online</div>
          </td>
          <td style="padding:14px 18px">
            <div style="font-size:26px;font-weight:700;color:${data.offline > 0 ? "#dc2626" : "#0f172a"}">${data.offline}</div>
            <div style="font-size:12px;color:#64748b">Offline</div>
          </td>
          <td style="padding:14px 18px">
            <div style="font-size:26px;font-weight:700;color:${data.degraded > 0 ? "#d97706" : "#0f172a"}">${data.degraded}</div>
            <div style="font-size:12px;color:#64748b">Degraded</div>
          </td>
          <td style="padding:14px 18px">
            <div style="font-size:26px;font-weight:700">${data.unknown}</div>
            <div style="font-size:12px;color:#64748b">Unknown</div>
          </td>
          <td style="padding:14px 18px">
            <div style="font-size:26px;font-weight:700;color:${data.openIncidents > 0 ? "#dc2626" : "#0f172a"}">${data.openIncidents}</div>
            <div style="font-size:12px;color:#64748b">Open incidents</div>
          </td>
        </tr>
      </table>

      <h3 style="margin-bottom:10px">Monitor Status</h3>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">
        <thead>
          <tr style="background:#f1f5f9;color:#475569;font-size:12px">
            <th style="padding:8px 10px;text-align:left;width:28px"></th>
            <th style="padding:8px 10px;text-align:left">Monitor</th>
            <th style="padding:8px 10px;text-align:left">Type</th>
            <th style="padding:8px 10px;text-align:left">Status</th>
            <th style="padding:8px 10px;text-align:left">Downtime</th>
          </tr>
        </thead>
        <tbody>
          ${data.allMonitors.length > 0
            ? monitorRowsHtml(data.allMonitors)
            : '<tr><td colspan="5" style="padding:14px 10px;color:#94a3b8;text-align:center">No monitors</td></tr>'}
        </tbody>
      </table>

      <p style="color:#94a3b8;font-size:12px;margin-top:16px">
        Incidents in last 24h: ${data.incidentsInWindow} &nbsp;·&nbsp; Generated: ${formatDateTime(data.generatedAt)}
      </p>
    </div>
  `;
  return { subject, text, html };
};

// ── Telegram ─────────────────────────────────────────────────────

export const buildDailyReportTelegramMessage = (data: DailyStatusReportTemplateData) => ({
  text: escapeHtml(plainText(data)),
  parseMode: "HTML" as const,
});

// ── LINE ─────────────────────────────────────────────────────────

const LINE_MAX_MONITORS = 30;

export const buildDailyReportLineMessage = (data: DailyStatusReportTemplateData) => {
  const monitorLines = data.allMonitors.slice(0, LINE_MAX_MONITORS).map((m) => {
    const line = `${statusIcon(m.status)} ${m.name} (${m.target}) - ${monitorStatusLabel(m)}`;
    if (m.downtimeWindows.length === 0) return line;
    return `${line}\n   └ ${formatDowntimeWindows(m.downtimeWindows)}`;
  });
  if (data.allMonitors.length > LINE_MAX_MONITORS) {
    monitorLines.push(`...and ${data.allMonitors.length - LINE_MAX_MONITORS} more`);
  }

  const allGood = data.offline === 0 && data.degraded === 0 && data.unknown === 0;

  return {
    altText: `Status Summary ${data.todayLabel}: Online ${data.online}/${data.total}, Offline ${data.offline}, Degraded ${data.degraded}`,
    flexContents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "Monitoring Hub", weight: "bold", size: "sm", color: "#0891b2" },
          { type: "text", text: "📊 Daily Status Summary", weight: "bold", size: "lg", wrap: true },
          {
            type: "text",
            text: `${data.todayLabel}  ·  ${formatTime(data.windowStart)}–${formatTime(data.windowEnd)}`,
            size: "xs",
            color: "#64748b",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: `Online ${data.online}/${data.total}  |  Offline ${data.offline}  |  Degraded ${data.degraded}`,
            weight: "bold",
            color: allGood ? "#047857" : "#dc2626",
            wrap: true,
          },
          {
            type: "text",
            text: `Unknown ${data.unknown}  |  Open incidents ${data.openIncidents}`,
            size: "sm",
            color: "#475569",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: "─── Monitor Status ───",
            size: "xs",
            color: "#64748b",
            weight: "bold",
          },
          {
            type: "text",
            text: monitorLines.length > 0 ? monitorLines.join("\n") : "No monitors",
            size: "xs",
            wrap: true,
          },
        ],
      },
    },
  };
};

// ── Slack ─────────────────────────────────────────────────────────

export const buildDailyReportSlackMessage = (data: DailyStatusReportTemplateData) => {
  const text = plainText(data);
  return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
};

// ── Discord ───────────────────────────────────────────────────────

export const buildDailyReportDiscordMessage = (data: DailyStatusReportTemplateData) => ({
  embeds: [
    {
      title: "📊 Daily Status Summary",
      description: plainText(data),
      color: data.offline > 0 ? 0xdc2626 : data.degraded > 0 ? 0xf59e0b : 0x10b981,
      timestamp: data.generatedAt,
    },
  ],
});

// ── Webhook ───────────────────────────────────────────────────────

export const buildDailyReportWebhookPayload = (data: DailyStatusReportTemplateData) => ({
  payload: {
    event: "daily_status_report",
    generatedAt: data.generatedAt,
    windowStart: data.windowStart,
    windowEnd: data.windowEnd,
    date: data.todayLabel,
    summary: {
      total: data.total,
      online: data.online,
      offline: data.offline,
      degraded: data.degraded,
      unknown: data.unknown,
      incidentsInWindow: data.incidentsInWindow,
      openIncidents: data.openIncidents,
    },
    monitors: data.allMonitors,
  },
});
