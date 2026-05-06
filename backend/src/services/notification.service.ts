import type { IncidentStatus } from "../generated/prisma/enums";
import type { Monitor, NotificationChannel, Prisma } from "../generated/prisma/client";
import type { ChannelType } from "../generated/prisma/enums";
import nodemailer from "nodemailer";
import { decryptCredentialSecret, encryptCredentialSecret } from "../lib/credentialSecret";
import prisma from "../lib/prisma";

type JsonObject = Prisma.InputJsonObject;

type TelegramConfig = {
  botToken: string;
  chatId: string;
};
type LineConfig = {
  channelAccessToken: string;
  to: string;
};
type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  to: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeOptionalText = (value: string | undefined | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseTelegramConfig = (config: unknown): TelegramConfig | null => {
  if (!isObject(config)) return null;
  const botTokenRaw = typeof config.botToken === "string" ? config.botToken.trim() : "";
  const chatIdRaw = typeof config.chatId === "string" ? config.chatId.trim() : "";
  if (!botTokenRaw || !chatIdRaw) return null;
  return { botToken: botTokenRaw, chatId: chatIdRaw };
};

const parseLineConfig = (config: unknown): LineConfig | null => {
  if (!isObject(config)) return null;
  const channelAccessTokenRaw =
    typeof config.channelAccessToken === "string" ? config.channelAccessToken.trim() : "";
  const toRaw = typeof config.to === "string" ? config.to.trim() : "";
  if (!channelAccessTokenRaw || !toRaw) return null;
  return {
    channelAccessToken: channelAccessTokenRaw,
    to: toRaw,
  };
};

const parseEmailConfig = (config: unknown): EmailConfig | null => {
  if (!isObject(config)) return null;
  const hostRaw = typeof config.host === "string" ? config.host.trim() : "";
  const usernameRaw = typeof config.username === "string" ? config.username.trim() : "";
  const passwordRaw = typeof config.password === "string" ? config.password.trim() : "";
  const fromRaw = typeof config.from === "string" ? config.from.trim() : "";
  const toRaw = typeof config.to === "string" ? config.to.trim() : "";
  const portRaw =
    typeof config.port === "number"
      ? config.port
      : typeof config.port === "string"
        ? Number(config.port)
        : Number.NaN;
  const secureRaw = typeof config.secure === "boolean" ? config.secure : false;
  if (!hostRaw || !usernameRaw || !passwordRaw || !fromRaw || !toRaw || !Number.isFinite(portRaw)) return null;
  return {
    host: hostRaw,
    port: Math.trunc(portRaw),
    secure: secureRaw,
    username: usernameRaw,
    password: passwordRaw,
    from: fromRaw,
    to: toRaw,
  };
};

const resolveTelegramConfig = (channel: NotificationChannel): TelegramConfig | null => {
  const parsed = parseTelegramConfig(channel.config);
  if (!parsed) return null;
  return {
    botToken: decryptCredentialSecret(parsed.botToken),
    chatId: parsed.chatId,
  };
};

const resolveLineConfig = (channel: NotificationChannel): LineConfig | null => {
  const parsed = parseLineConfig(channel.config);
  if (!parsed) return null;
  return {
    channelAccessToken: decryptCredentialSecret(parsed.channelAccessToken),
    to: parsed.to,
  };
};

const resolveEmailConfig = (channel: NotificationChannel): EmailConfig | null => {
  const parsed = parseEmailConfig(channel.config);
  if (!parsed) return null;
  return {
    ...parsed,
    password: decryptCredentialSecret(parsed.password),
  };
};

export const toStoredChannelConfig = (
  type: string,
  input: {
    webhookUrl?: string;
    botToken?: string;
    chatId?: string;
    lineChannelAccessToken?: string;
    lineTo?: string;
    emailHost?: string;
    emailPort?: number;
    emailSecure?: boolean;
    emailUsername?: string;
    emailPassword?: string;
    emailFrom?: string;
    emailTo?: string;
  },
) => {
  if (type === "TELEGRAM") {
    const botToken = normalizeOptionalText(input.botToken);
    const chatId = normalizeOptionalText(input.chatId);
    if (!botToken || !chatId) {
      throw new Error("Telegram channel ต้องมี botToken และ chatId");
    }
    return {
      botToken: encryptCredentialSecret(botToken),
      chatId,
    } satisfies JsonObject;
  }
  if (type === "LINE") {
    const channelAccessToken = normalizeOptionalText(input.lineChannelAccessToken);
    const to = normalizeOptionalText(input.lineTo);
    if (!channelAccessToken || !to) {
      throw new Error("LINE channel ต้องมี channelAccessToken และ to");
    }
    return {
      channelAccessToken: encryptCredentialSecret(channelAccessToken),
      to,
    } satisfies JsonObject;
  }
  if (type === "EMAIL") {
    const host = normalizeOptionalText(input.emailHost);
    const username = normalizeOptionalText(input.emailUsername);
    const password = normalizeOptionalText(input.emailPassword);
    const from = normalizeOptionalText(input.emailFrom);
    const to = normalizeOptionalText(input.emailTo);
    const port = Number(input.emailPort);
    const secure = Boolean(input.emailSecure);
    if (!host || !username || !password || !from || !to || !Number.isFinite(port)) {
      throw new Error("EMAIL channel ต้องมี host, port, username, password, from, to");
    }
    return {
      host,
      port: Math.trunc(port),
      secure,
      username,
      password: encryptCredentialSecret(password),
      from,
      to,
    } satisfies JsonObject;
  }

  const webhookUrl = normalizeOptionalText(input.webhookUrl);
  if (!webhookUrl) {
    throw new Error("Webhook URL is required");
  }
  return { webhookUrl } satisfies JsonObject;
};

export const toDisplayChannelConfig = (channel: NotificationChannel) => {
  const isTelegram = channel.type === "TELEGRAM";
  if (isTelegram) {
    const parsed = parseTelegramConfig(channel.config);
    const plainToken = parsed ? decryptCredentialSecret(parsed.botToken) : "";
    const maskedToken =
      plainToken.length <= 8
        ? "•".repeat(Math.max(plainToken.length, 4))
        : `${plainToken.slice(0, 4)}${"•".repeat(Math.max(plainToken.length - 8, 6))}${plainToken.slice(-4)}`;
    return {
      chatId: parsed?.chatId ?? "",
      botTokenMasked: maskedToken,
    };
  }
  if (channel.type === "LINE") {
    const parsed = parseLineConfig(channel.config);
    const plainToken = parsed ? decryptCredentialSecret(parsed.channelAccessToken) : "";
    const maskedToken =
      plainToken.length <= 8
        ? "•".repeat(Math.max(plainToken.length, 4))
        : `${plainToken.slice(0, 4)}${"•".repeat(Math.max(plainToken.length - 8, 6))}${plainToken.slice(-4)}`;
    return {
      to: parsed?.to ?? "",
      channelAccessTokenMasked: maskedToken,
    };
  }
  if (channel.type === "EMAIL") {
    const parsed = parseEmailConfig(channel.config);
    return {
      host: parsed?.host ?? "",
      port: parsed?.port ?? 0,
      secure: parsed?.secure ?? false,
      username: parsed?.username ?? "",
      from: parsed?.from ?? "",
      to: parsed?.to ?? "",
      passwordMasked: "••••••••",
    };
  }

  const cfg = isObject(channel.config) ? channel.config : {};
  return {
    webhookUrl: typeof cfg.webhookUrl === "string" ? cfg.webhookUrl : "",
  };
};

type IncidentNotificationKind = "transition" | "reminder";

const buildIncidentMessage = (
  monitor: Monitor,
  status: IncidentStatus,
  message: string | null,
  kind: IncidentNotificationKind = "transition",
) => {
  const icon = status === "RESOLVED" ? "✅" : kind === "reminder" ? "⏰" : "🚨";
  const title =
    status === "RESOLVED"
      ? "Incident Resolved"
      : kind === "reminder"
        ? "Incident Reminder"
        : "Incident Opened";
  const details = message?.trim() || (status === "RESOLVED" ? "Monitor recovered" : "Monitor reported issue");
  return `${icon} ${title}\nMonitor: ${monitor.name}\nType: ${monitor.type}\nStatus: ${status}\nMessage: ${details}`;
};

const sendTelegram = async (config: TelegramConfig, text: string) => {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API failed (${response.status}): ${body}`);
  }
};

const sendWebhook = async (webhookUrl: string, payload: Record<string, unknown>) => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook delivery failed (${response.status}): ${body}`);
  }
};

const sendLineMessage = async (config: LineConfig, text: string) => {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.channelAccessToken}`,
    },
    body: JSON.stringify({
      to: config.to,
      messages: [{ type: "text", text }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE API failed (${response.status}): ${body}`);
  }
};

const sendEmailMessage = async (config: EmailConfig, subject: string, text: string) => {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });
  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject,
    text,
  });
};

const deliverChannelMessage = async (
  channel: NotificationChannel,
  content: { subject: string; text: string; webhookPayload: Record<string, unknown> },
) => {
  if (channel.type === "TELEGRAM") {
    const telegramConfig = resolveTelegramConfig(channel);
    if (!telegramConfig) {
      throw new Error("Invalid telegram config");
    }
    await sendTelegram(telegramConfig, content.text);
    return;
  }
  if (channel.type === "LINE") {
    const lineConfig = resolveLineConfig(channel);
    if (!lineConfig) {
      throw new Error("Invalid LINE config");
    }
    await sendLineMessage(lineConfig, content.text);
    return;
  }
  if (channel.type === "EMAIL") {
    const emailConfig = resolveEmailConfig(channel);
    if (!emailConfig) {
      throw new Error("Invalid EMAIL config");
    }
    await sendEmailMessage(emailConfig, content.subject, content.text);
    return;
  }

  const cfg = isObject(channel.config) ? channel.config : {};
  const webhookUrl = typeof cfg.webhookUrl === "string" ? cfg.webhookUrl : "";
  if (!webhookUrl) {
    throw new Error("Missing webhookUrl");
  }
  await sendWebhook(webhookUrl, content.webhookPayload);
};

export const notifyIncidentTransition = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  status: IncidentStatus;
  message: string | null;
}) => {
  await notifyIncident({
    ...params,
    kind: "transition",
  });
};

export const notifyIncidentReminder = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  message: string | null;
}) => {
  await notifyIncident({
    ...params,
    status: "OPEN",
    kind: "reminder",
  });
};

const notifyIncident = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  status: IncidentStatus;
  message: string | null;
  kind: IncidentNotificationKind;
}) => {
  const channels = params.alertRuleId
    ? (
        await prisma.alertRuleChannel.findMany({
          where: {
            alertRuleId: params.alertRuleId,
            channel: { enabled: true },
          },
          include: { channel: true },
        })
      ).map((item) => item.channel)
    : await prisma.notificationChannel.findMany({
        where: { enabled: true },
        orderBy: [{ createdAt: "asc" }],
      });

  if (channels.length === 0) return;

  const text = buildIncidentMessage(params.monitor, params.status, params.message, params.kind);
  const subjectStatus = params.kind === "reminder" ? "REMINDER" : params.status;
  const subject = `[Monitoring Hub] ${subjectStatus} - ${params.monitor.name}`;
  const webhookPayload = {
    incidentId: params.incidentId,
    alertRuleId: params.alertRuleId ?? null,
    kind: params.kind,
    status: params.status,
    monitor: {
      id: params.monitor.id,
      name: params.monitor.name,
      type: params.monitor.type,
    },
    message: params.message,
    sentAt: new Date().toISOString(),
  };

  await Promise.all(
    channels.map(async (channel) => {
      try {
        await deliverChannelMessage(channel, { subject, text, webhookPayload });
      } catch (error) {
        console.error(`[notify] failed channel ${channel.id} (${channel.type})`, error);
      }
    }),
  );
};

export const testNotificationChannel = async (channelId: string) => {
  const channel = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new Error("ไม่พบ notification channel");
  }

  const sentAt = new Date().toISOString();
  const text = `🧪 Monitoring Hub test message\nChannel: ${channel.name}\nType: ${channel.type}\nSent: ${sentAt}`;
  const subject = `[Monitoring Hub] Test channel - ${channel.name}`;
  const webhookPayload = {
    type: "channel_test",
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    sentAt,
  };

  await deliverChannelMessage(channel, { subject, text, webhookPayload });
};

export const testNotificationChannelDraft = async (params: {
  name: string;
  type: ChannelType;
  configInput: {
    webhookUrl?: string;
    botToken?: string;
    chatId?: string;
    lineChannelAccessToken?: string;
    lineTo?: string;
    emailHost?: string;
    emailPort?: number;
    emailSecure?: boolean;
    emailUsername?: string;
    emailPassword?: string;
    emailFrom?: string;
    emailTo?: string;
  };
}) => {
  const storedConfig = toStoredChannelConfig(params.type, params.configInput);
  const draftChannel = {
    id: "draft-test",
    name: params.name.trim() || "Draft channel",
    type: params.type,
    enabled: true,
    config: storedConfig,
    createdAt: new Date(),
  } as NotificationChannel;

  const sentAt = new Date().toISOString();
  const text = `🧪 Monitoring Hub draft test message\nChannel: ${draftChannel.name}\nType: ${draftChannel.type}\nSent: ${sentAt}`;
  const subject = `[Monitoring Hub] Draft test - ${draftChannel.name}`;
  const webhookPayload = {
    type: "channel_draft_test",
    channelName: draftChannel.name,
    channelType: draftChannel.type,
    sentAt,
  };

  await deliverChannelMessage(draftChannel, { subject, text, webhookPayload });
};
