import type { IncidentTemplateData, SlackTemplateOutput, TestTemplateData } from "./types";

type SlackBlock = Record<string, unknown>;

const STATUS_CONFIG = {
  RESOLVED: { emoji: "✅", label: "Incident Resolved" },
  OPEN_ALERT: { emoji: "🚨", label: "Incident Opened" },
  OPEN_REMINDER: { emoji: "⏰", label: "Incident Reminder" },
  OPEN_ESCALATION: { emoji: "🔥", label: "Incident Escalation" },
};

const formatThaiTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export const buildSlackIncidentMessage = (data: IncidentTemplateData): SlackTemplateOutput => {
  const cfg =
    data.status === "RESOLVED"
      ? STATUS_CONFIG.RESOLVED
      : data.kind === "escalation"
        ? STATUS_CONFIG.OPEN_ESCALATION
        : data.kind === "reminder"
        ? STATUS_CONFIG.OPEN_REMINDER
        : STATUS_CONFIG.OPEN_ALERT;

  const details =
    data.message?.trim() ||
    (data.status === "RESOLVED" ? "Monitor recovered" : "Monitor reported issue");

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${cfg.emoji} ${cfg.label}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Monitor:*\n${data.monitorName}` },
        { type: "mrkdwn", text: `*Type:*\n${data.monitorType}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Details:*\n${details}` },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🕐 ${formatThaiTime(data.sentAt)}  ·  \`${data.incidentId}\`  ·  Monitoring Hub`,
        },
      ],
    },
  ];

  return {
    text: `${cfg.emoji} ${cfg.label} — ${data.monitorName}`,
    blocks,
  };
};

export const buildSlackTestMessage = (data: TestTemplateData): SlackTemplateOutput => {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🧪 Test Message", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Channel:*\n${data.channelName}` },
        { type: "mrkdwn", text: `*Type:*\n${data.channelType}` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🕐 ${formatThaiTime(data.sentAt)}  ·  Monitoring Hub`,
        },
      ],
    },
  ];

  return {
    text: `🧪 Test Message — ${data.channelName}`,
    blocks,
  };
};
