import type { EmailTemplateOutput, IncidentTemplateData, TestTemplateData } from "./types";

const formatThaiTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "medium" });

const STATUS_STYLES = {
  RESOLVED: { bg: "#2D9C5F", label: "RESOLVED", icon: "✅" },
  OPEN_ALERT: { bg: "#D93025", label: "ALERT", icon: "🚨" },
  OPEN_REMINDER: { bg: "#D97706", label: "REMINDER", icon: "⏰" },
};

const baseHtml = (accentColor: string, headerIcon: string, headerTitle: string, bodyHtml: string) => `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Monitoring Hub</title>
</head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:${accentColor};padding:24px 28px;">
              <div style="font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">
                ${headerIcon}&nbsp;&nbsp;${headerTitle}
              </div>
              <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">Monitoring Hub</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#FFFFFF;padding:24px 28px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:14px 28px;text-align:center;">
              <span style="font-size:12px;color:#94A3B8;">
                Monitoring Hub &middot; Lightweight NMS &middot; Automated notification
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const detailRow = (label: string, value: string) => `
  <tr>
    <td style="padding:7px 0;font-size:13px;color:#64748B;white-space:nowrap;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:7px 0 7px 12px;font-size:13px;color:#1E293B;font-weight:500;">${value || "—"}</td>
  </tr>`;

export const buildEmailIncidentMessage = (data: IncidentTemplateData): EmailTemplateOutput => {
  const style =
    data.status === "RESOLVED"
      ? STATUS_STYLES.RESOLVED
      : data.kind === "reminder"
        ? STATUS_STYLES.OPEN_REMINDER
        : STATUS_STYLES.OPEN_ALERT;

  const details =
    data.message?.trim() ||
    (data.status === "RESOLVED" ? "Monitor recovered" : "Monitor reported issue");

  const subject = `[Monitoring Hub] ${style.label} — ${data.monitorName}`;

  const statusBadge = `
    <span style="display:inline-block;background:${style.bg};color:#FFF;font-size:11px;font-weight:700;
      padding:3px 10px;border-radius:999px;letter-spacing:0.5px;">${style.label}</span>`;

  const bodyHtml = `
    ${statusBadge}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      ${detailRow("Monitor", data.monitorName)}
      ${detailRow("Type", data.monitorType)}
    </table>
    <div style="margin:20px 0;border-top:1px solid #E2E8F0;"></div>
    <div style="font-size:12px;color:#94A3B8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">Details</div>
    <div style="background:#F8FAFC;border-left:3px solid ${style.bg};padding:10px 14px;
      border-radius:0 6px 6px 0;font-size:13px;color:#334155;line-height:1.6;">
      ${details}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      ${detailRow("Time", formatThaiTime(data.sentAt))}
      ${detailRow("Incident ID", `<code style="font-size:11px;background:#F1F5F9;padding:2px 6px;border-radius:4px;">${data.incidentId}</code>`)}
    </table>`;

  const text = [
    `[Monitoring Hub] ${style.label} — ${data.monitorName}`,
    `Monitor: ${data.monitorName}`,
    `Type:    ${data.monitorType}`,
    `Details: ${details}`,
    `Time:    ${formatThaiTime(data.sentAt)}`,
    `ID:      ${data.incidentId}`,
  ].join("\n");

  return {
    subject,
    text,
    html: baseHtml(style.bg, style.icon, `${style.icon} Incident ${style.label}`, bodyHtml),
  };
};

export const buildEmailTestMessage = (data: TestTemplateData): EmailTemplateOutput => {
  const subject = `[Monitoring Hub] Test — ${data.channelName}`;

  const bodyHtml = `
    <div style="font-size:14px;color:#334155;margin-bottom:16px;">
      การทดสอบช่องทางแจ้งเตือนสำเร็จแล้ว
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Channel", data.channelName)}
      ${detailRow("Type", data.channelType)}
      ${detailRow("Sent", formatThaiTime(data.sentAt))}
    </table>`;

  const text = [
    `[Monitoring Hub] Test — ${data.channelName}`,
    `Channel: ${data.channelName}`,
    `Type:    ${data.channelType}`,
    `Sent:    ${formatThaiTime(data.sentAt)}`,
  ].join("\n");

  return {
    subject,
    text,
    html: baseHtml("#4A5568", "🧪", "Test Message", bodyHtml),
  };
};
