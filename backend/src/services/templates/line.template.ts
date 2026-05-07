import type { IncidentTemplateData, LineTemplateOutput, TestTemplateData } from "./types";

const STATUS_COLORS = {
  RESOLVED: { bg: "#2D9C5F", text: "✅ Incident Resolved" },
  OPEN_ALERT: { bg: "#D93025", text: "🚨 Incident Opened" },
  OPEN_REMINDER: { bg: "#D97706", text: "⏰ Incident Reminder" },
  OPEN_ESCALATION: { bg: "#C2410C", text: "🔥 Incident Escalation" },
};

const formatThaiTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

const row = (label: string, value: string) => ({
  type: "box",
  layout: "horizontal",
  spacing: "sm",
  contents: [
    {
      type: "text",
      text: label,
      size: "sm",
      color: "#888888",
      flex: 3,
    },
    {
      type: "text",
      text: value || "-",
      size: "sm",
      color: "#333333",
      flex: 7,
      wrap: true,
    },
  ],
});

const divider = () => ({ type: "separator", margin: "sm" });

export const buildLineIncidentMessage = (data: IncidentTemplateData): LineTemplateOutput => {
  const colorMap =
    data.status === "RESOLVED"
      ? STATUS_COLORS.RESOLVED
      : data.kind === "escalation"
        ? STATUS_COLORS.OPEN_ESCALATION
        : data.kind === "reminder"
        ? STATUS_COLORS.OPEN_REMINDER
        : STATUS_COLORS.OPEN_ALERT;

  const statusBadge =
    data.status === "RESOLVED"
      ? "RESOLVED"
      : data.kind === "escalation"
        ? "ESCALATION"
        : data.kind === "reminder"
          ? "ONGOING"
          : "ALERT";

  const flexContents = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: colorMap.bg,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: colorMap.text,
          color: "#FFFFFF",
          weight: "bold",
          size: "md",
        },
        {
          type: "text",
          text: statusBadge,
          color: "#DDDDDD",
          size: "xs",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        row("Monitor", data.monitorName),
        row("Type", data.monitorType),
        divider(),
        row("Details", data.message || (data.status === "RESOLVED" ? "Monitor recovered" : "Monitor reported issue")),
        divider(),
        row("Time", formatThaiTime(data.sentAt)),
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F5F5F5",
      paddingAll: "10px",
      contents: [
        {
          type: "text",
          text: "Monitoring Hub",
          size: "xs",
          color: "#AAAAAA",
          align: "center",
          flex: 1,
        },
      ],
    },
    styles: {
      footer: { separator: true },
    },
  };

  const altText = `${colorMap.text} — ${data.monitorName}`;
  return { altText, flexContents };
};

export const buildLineTestMessage = (data: TestTemplateData): LineTemplateOutput => {
  const flexContents = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#4A5568",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: "🧪 Test Message",
          color: "#FFFFFF",
          weight: "bold",
          size: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        row("Channel", data.channelName),
        row("Type", data.channelType),
        row("Sent", formatThaiTime(data.sentAt)),
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      backgroundColor: "#F5F5F5",
      paddingAll: "10px",
      contents: [
        {
          type: "text",
          text: "Monitoring Hub",
          size: "xs",
          color: "#AAAAAA",
          align: "center",
          flex: 1,
        },
      ],
    },
    styles: { footer: { separator: true } },
  };

  return { altText: "🧪 Monitoring Hub test message", flexContents };
};
