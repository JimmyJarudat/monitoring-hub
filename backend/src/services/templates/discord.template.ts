import type { DiscordTemplateOutput, IncidentTemplateData, TestTemplateData } from "./types";

const STATUS_CONFIG = {
  RESOLVED: { color: 0x2d9c5f, title: "✅ Incident Resolved" },
  OPEN_ALERT: { color: 0xd93025, title: "🚨 Incident Opened" },
  OPEN_REMINDER: { color: 0xd97706, title: "⏰ Incident Reminder" },
  OPEN_ESCALATION: { color: 0xc2410c, title: "🔥 Incident Escalation" },
};

export const buildDiscordIncidentMessage = (data: IncidentTemplateData): DiscordTemplateOutput => {
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

  return {
    embeds: [
      {
        title: cfg.title,
        color: cfg.color,
        fields: [
          { name: "Monitor", value: data.monitorName, inline: true },
          { name: "Type", value: data.monitorType, inline: true },
          { name: "Details", value: details, inline: false },
        ],
        footer: { text: `Monitoring Hub · ${data.incidentId}` },
        timestamp: data.sentAt,
      },
    ],
  };
};

export const buildDiscordTestMessage = (data: TestTemplateData): DiscordTemplateOutput => {
  return {
    embeds: [
      {
        title: "🧪 Test Message",
        color: 0x4a5568,
        fields: [
          { name: "Channel", value: data.channelName, inline: true },
          { name: "Type", value: data.channelType, inline: true },
        ],
        footer: { text: "Monitoring Hub" },
        timestamp: data.sentAt,
      },
    ],
  };
};
