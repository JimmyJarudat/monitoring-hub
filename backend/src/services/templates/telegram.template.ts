import type { IncidentTemplateData, TelegramTemplateOutput, TestTemplateData } from "./types";

const formatThaiTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const DIVIDER = "─────────────────";

export const buildTelegramIncidentMessage = (data: IncidentTemplateData): TelegramTemplateOutput => {
  const icon =
    data.status === "RESOLVED" ? "✅" : data.kind === "reminder" ? "⏰" : "🚨";
  const title =
    data.status === "RESOLVED"
      ? "Incident Resolved"
      : data.kind === "reminder"
        ? "Incident Reminder"
        : "Incident Opened";
  const details =
    data.message?.trim() ||
    (data.status === "RESOLVED" ? "Monitor recovered" : "Monitor reported issue");
  const badgeIcon = data.status === "RESOLVED" ? "🟢" : data.kind === "reminder" ? "🟡" : "🔴";

  const lines = [
    `${icon} <b>${esc(title)}</b>`,
    DIVIDER,
    `${badgeIcon} <b>Status:</b> ${data.status}`,
    `📡 <b>Monitor:</b> ${esc(data.monitorName)}`,
    `🏷️ <b>Type:</b> ${esc(data.monitorType)}`,
    DIVIDER,
    `💬 <b>Details:</b>`,
    `<i>${esc(details)}</i>`,
    DIVIDER,
    `🕐 <b>Time:</b> ${formatThaiTime(data.sentAt)}`,
    `🆔 <code>${data.incidentId}</code>`,
    "",
    `<i>— Monitoring Hub</i>`,
  ];

  return { text: lines.join("\n"), parseMode: "HTML" };
};

export const buildTelegramTestMessage = (data: TestTemplateData): TelegramTemplateOutput => {
  const lines = [
    `🧪 <b>Test Message</b>`,
    DIVIDER,
    `📣 <b>Channel:</b> ${esc(data.channelName)}`,
    `🏷️ <b>Type:</b> ${esc(data.channelType)}`,
    `🕐 <b>Sent:</b> ${formatThaiTime(data.sentAt)}`,
    DIVIDER,
    `<i>— Monitoring Hub</i>`,
  ];

  return { text: lines.join("\n"), parseMode: "HTML" };
};
