import type { IncidentStatus } from "../generated/prisma/enums";
import type { Monitor, NotificationChannel, Prisma } from "../generated/prisma/client";
import type { ChannelType } from "../generated/prisma/enums";
import nodemailer from "nodemailer";
import { decryptCredentialSecret, encryptCredentialSecret } from "../lib/credentialSecret";
import prisma from "../lib/prisma";
import { logger } from "../lib/logger";
import {
  buildLineIncidentMessage,
  buildLineTestMessage,
  buildTelegramIncidentMessage,
  buildTelegramTestMessage,
  buildEmailIncidentMessage,
  buildEmailTestMessage,
  buildWebhookIncidentPayload,
  buildWebhookTestPayload,
  buildSlackIncidentMessage,
  buildSlackTestMessage,
  buildDiscordIncidentMessage,
  buildDiscordTestMessage,
  type IncidentTemplateData,
} from "./templates";

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

type IncidentNotificationKind = "transition" | "reminder" | "escalation";

const INCIDENT_NOTIFICATION_SENT_ACTION = "INCIDENT_NOTIFICATION_SENT";
const INCIDENT_NOTIFICATION_SUPPRESSED_ACTION = "INCIDENT_NOTIFICATION_SUPPRESSED";
const INCIDENT_NOTIFICATION_RETRY_ACTION = "INCIDENT_NOTIFICATION_RETRY";
const INCIDENT_NOTIFICATION_RETRY_SENT_ACTION = "INCIDENT_NOTIFICATION_RETRY_SENT";
const INCIDENT_NOTIFICATION_RETRY_FAILED_ACTION = "INCIDENT_NOTIFICATION_RETRY_FAILED";
const INCIDENT_TRANSITION_COOLDOWN_MS = 5 * 60 * 1000;
const INCIDENT_REMINDER_COOLDOWN_MS = 60 * 1000;
const INCIDENT_ESCALATION_COOLDOWN_MS = 60 * 1000;
const RETRY_TICK_MS = 30_000;
const RETRY_BATCH_SIZE = 20;
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_RETRY_ATTEMPTS = RETRY_BACKOFF_MS.length;

let retryTimer: ReturnType<typeof setInterval> | null = null;

const getIncidentCooldownMs = (kind: IncidentNotificationKind) => {
  if (kind === "transition") return INCIDENT_TRANSITION_COOLDOWN_MS;
  if (kind === "escalation") return INCIDENT_ESCALATION_COOLDOWN_MS;
  return INCIDENT_REMINDER_COOLDOWN_MS;
};

const normalizeFingerprintMessage = (message: string | null) =>
  (message ?? "").replace(/\s+/g, " ").trim().slice(0, 240);

const buildIncidentNotificationFingerprint = (params: {
  alertRuleId?: string | null;
  status: IncidentStatus;
  message: string | null;
  kind: IncidentNotificationKind;
}) =>
  JSON.stringify({
    kind: params.kind,
    status: params.status,
    alertRuleId: params.alertRuleId ?? null,
    message: normalizeFingerprintMessage(params.message),
  });

const getAuditString = (value: unknown, key: string) =>
  isObject(value) && typeof value[key] === "string" ? value[key] : null;

const getAuditNumber = (value: unknown, key: string) => {
  if (!isObject(value)) return null;
  const raw = value[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
};

const shouldSendIncidentNotification = async (params: {
  incidentId: string;
  fingerprint: string;
  kind: IncidentNotificationKind;
  now: Date;
}) => {
  const cooldownMs = getIncidentCooldownMs(params.kind);
  const recentLogs = await prisma.auditLog.findMany({
    where: {
      action: INCIDENT_NOTIFICATION_SENT_ACTION,
      entity: "Incident",
      entityId: params.incidentId,
      createdAt: { gte: new Date(params.now.getTime() - cooldownMs) },
    },
    orderBy: { createdAt: "desc" },
    select: { newValue: true },
    take: 30,
  });

  return !recentLogs.some((log) => getAuditString(log.newValue, "fingerprint") === params.fingerprint);
};

const recordIncidentNotificationAudit = async (params: {
  action: typeof INCIDENT_NOTIFICATION_SENT_ACTION | typeof INCIDENT_NOTIFICATION_SUPPRESSED_ACTION;
  monitorId: string;
  incidentId: string;
  alertRuleId?: string | null;
  status: IncidentStatus;
  message: string | null;
  kind: IncidentNotificationKind;
  fingerprint: string;
  channelIds?: string[];
  deliveredChannelIds?: string[];
  failedChannels?: { id: string; name: string; type: ChannelType; error: string }[];
  reason?: string;
}) => {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entity: "Incident",
      entityId: params.incidentId,
      newValue: {
        monitorId: params.monitorId,
        alertRuleId: params.alertRuleId ?? null,
        status: params.status,
        kind: params.kind,
        message: params.message,
        fingerprint: params.fingerprint,
        channelIds: params.channelIds ?? [],
        deliveredChannelIds: params.deliveredChannelIds ?? [],
        failedChannels: params.failedChannels ?? [],
        reason: params.reason ?? null,
      },
    },
  });
};

const enqueueIncidentNotificationRetries = async (params: {
  monitorId: string;
  incidentId: string;
  alertRuleId?: string | null;
  status: IncidentStatus;
  message: string | null;
  kind: IncidentNotificationKind;
  fingerprint: string;
  failedChannels: { id: string; name: string; type: ChannelType; error: string }[];
  now: Date;
}) => {
  if (params.failedChannels.length === 0) return;

  await prisma.auditLog.createMany({
    data: params.failedChannels.map((channel) => ({
      action: INCIDENT_NOTIFICATION_RETRY_ACTION,
      entity: "Incident",
      entityId: params.incidentId,
      newValue: {
        status: "PENDING",
        attempts: 0,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        nextRetryAt: new Date(params.now.getTime() + RETRY_BACKOFF_MS[0]).toISOString(),
        monitorId: params.monitorId,
        incidentId: params.incidentId,
        alertRuleId: params.alertRuleId ?? null,
        incidentStatus: params.status,
        message: params.message,
        kind: params.kind,
        fingerprint: params.fingerprint,
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        lastError: channel.error,
      },
    })),
  });
};

const sendTelegram = async (config: TelegramConfig, text: string, parseMode: "HTML" = "HTML") => {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: parseMode,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook delivery failed (${response.status}): ${body}`);
  }
};

const sendLineFlexMessage = async (
  config: LineConfig,
  altText: string,
  flexContents: object,
) => {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.channelAccessToken}`,
    },
    body: JSON.stringify({
      to: config.to,
      messages: [{ type: "flex", altText, contents: flexContents }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE API failed (${response.status}): ${body}`);
  }
};

const sendEmailMessage = async (
  config: EmailConfig,
  subject: string,
  text: string,
  html: string,
) => {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
  await transporter.sendMail({ from: config.from, to: config.to, subject, text, html });
};

type AllChannelContent = {
  telegram: { text: string; parseMode: "HTML" };
  line: { altText: string; flexContents: object };
  email: { subject: string; text: string; html: string };
  slack: { text: string; blocks: Record<string, unknown>[] };
  discord: { embeds: Record<string, unknown>[] };
  webhook: { payload: Record<string, unknown> };
};

const buildIncidentContent = (data: IncidentTemplateData): AllChannelContent => ({
  telegram: buildTelegramIncidentMessage(data),
  line: buildLineIncidentMessage(data),
  email: buildEmailIncidentMessage(data),
  slack: buildSlackIncidentMessage(data),
  discord: buildDiscordIncidentMessage(data),
  webhook: buildWebhookIncidentPayload(data),
});

const buildTestContent = (data: { channelName: string; channelType: string; sentAt: string }): AllChannelContent => ({
  telegram: buildTelegramTestMessage(data),
  line: buildLineTestMessage(data),
  email: buildEmailTestMessage(data),
  slack: buildSlackTestMessage(data),
  discord: buildDiscordTestMessage(data),
  webhook: buildWebhookTestPayload(data),
});

const deliverChannelMessage = async (channel: NotificationChannel, content: AllChannelContent) => {
  if (channel.type === "TELEGRAM") {
    const cfg = resolveTelegramConfig(channel);
    if (!cfg) throw new Error("Invalid telegram config");
    await sendTelegram(cfg, content.telegram.text, content.telegram.parseMode);
    return;
  }
  if (channel.type === "LINE") {
    const cfg = resolveLineConfig(channel);
    if (!cfg) throw new Error("Invalid LINE config");
    await sendLineFlexMessage(cfg, content.line.altText, content.line.flexContents);
    return;
  }
  if (channel.type === "EMAIL") {
    const cfg = resolveEmailConfig(channel);
    if (!cfg) throw new Error("Invalid EMAIL config");
    await sendEmailMessage(cfg, content.email.subject, content.email.text, content.email.html);
    return;
  }

  const cfg = isObject(channel.config) ? channel.config : {};
  const webhookUrl = typeof cfg.webhookUrl === "string" ? cfg.webhookUrl : "";
  if (!webhookUrl) throw new Error("Missing webhookUrl");

  if (channel.type === "SLACK") {
    await sendWebhook(webhookUrl, content.slack);
    return;
  }
  if (channel.type === "DISCORD") {
    await sendWebhook(webhookUrl, content.discord);
    return;
  }

  await sendWebhook(webhookUrl, content.webhook.payload);
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

export const notifyIncidentEscalation = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId?: string | null;
  message: string | null;
}) => {
  await notifyIncident({
    ...params,
    status: "OPEN",
    kind: "escalation",
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
  const now = new Date();
  const fingerprint = buildIncidentNotificationFingerprint(params);
  const shouldSend = await shouldSendIncidentNotification({
    incidentId: params.incidentId,
    fingerprint,
    kind: params.kind,
    now,
  });
  if (!shouldSend) {
    await recordIncidentNotificationAudit({
      action: INCIDENT_NOTIFICATION_SUPPRESSED_ACTION,
      monitorId: params.monitor.id,
      incidentId: params.incidentId,
      alertRuleId: params.alertRuleId,
      status: params.status,
      message: params.message,
      kind: params.kind,
      fingerprint,
      reason: "cooldown",
    });
    return;
  }

  let channels = params.alertRuleId
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

  // Rule has no specific channels assigned → fall back to all enabled channels
  if (params.alertRuleId && channels.length === 0) {
    channels = await prisma.notificationChannel.findMany({
      where: { enabled: true },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  if (channels.length === 0) return;

  const templateData: IncidentTemplateData = {
    monitorName: params.monitor.name,
    monitorType: params.monitor.type,
    status: params.status,
    message: params.message,
    kind: params.kind,
    incidentId: params.incidentId,
    sentAt: now.toISOString(),
  };
  const content = buildIncidentContent(templateData);
  const deliveredChannelIds: string[] = [];
  const failedChannels: { id: string; name: string; type: ChannelType; error: string }[] = [];

  await Promise.all(
    channels.map(async (channel) => {
      try {
        await deliverChannelMessage(channel, content);
        deliveredChannelIds.push(channel.id);
      } catch (error) {
        failedChannels.push({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.error("notify", `failed channel ${channel.id} (${channel.type})`, { error: String(error) });
      }
    }),
  );

  await recordIncidentNotificationAudit({
    action: INCIDENT_NOTIFICATION_SENT_ACTION,
    monitorId: params.monitor.id,
    incidentId: params.incidentId,
    alertRuleId: params.alertRuleId,
    status: params.status,
    message: params.message,
    kind: params.kind,
    fingerprint,
    channelIds: channels.map((channel) => channel.id),
    deliveredChannelIds,
    failedChannels,
  });
  await enqueueIncidentNotificationRetries({
    monitorId: params.monitor.id,
    incidentId: params.incidentId,
    alertRuleId: params.alertRuleId,
    status: params.status,
    message: params.message,
    kind: params.kind,
    fingerprint,
    failedChannels,
    now,
  });
};

const parseRetryPayload = (value: unknown) => {
  const status = getAuditString(value, "status");
  const nextRetryAt = getAuditString(value, "nextRetryAt");
  const monitorId = getAuditString(value, "monitorId");
  const incidentId = getAuditString(value, "incidentId");
  const incidentStatus = getAuditString(value, "incidentStatus");
  const kind = getAuditString(value, "kind");
  const channelId = getAuditString(value, "channelId");
  const attempts = getAuditNumber(value, "attempts") ?? 0;

  if (
    status !== "PENDING" ||
    !nextRetryAt ||
    !monitorId ||
    !incidentId ||
    (incidentStatus !== "OPEN" && incidentStatus !== "RESOLVED") ||
    (kind !== "transition" && kind !== "reminder" && kind !== "escalation") ||
    !channelId
  ) {
    return null;
  }

  return {
    status,
    attempts,
    maxAttempts: getAuditNumber(value, "maxAttempts") ?? MAX_RETRY_ATTEMPTS,
    nextRetryAt,
    monitorId,
    incidentId,
    alertRuleId: getAuditString(value, "alertRuleId"),
    incidentStatus,
    message: getAuditString(value, "message"),
    kind,
    fingerprint: getAuditString(value, "fingerprint"),
    channelId,
    channelName: getAuditString(value, "channelName"),
    channelType: getAuditString(value, "channelType"),
    lastError: getAuditString(value, "lastError"),
  };
};

const retryIncidentNotification = async (retryLog: {
  id: string;
  newValue: unknown;
}) => {
  const payload = parseRetryPayload(retryLog.newValue);
  if (!payload) return;
  if (new Date(payload.nextRetryAt).getTime() > Date.now()) return;

  const [monitor, channel] = await Promise.all([
    prisma.monitor.findUnique({ where: { id: payload.monitorId } }),
    prisma.notificationChannel.findUnique({ where: { id: payload.channelId } }),
  ]);

  if (!monitor || !channel || !channel.enabled) {
    await prisma.auditLog.update({
      where: { id: retryLog.id },
      data: {
        action: INCIDENT_NOTIFICATION_RETRY_FAILED_ACTION,
        newValue: {
          ...payload,
          status: "FAILED",
          finishedAt: new Date().toISOString(),
          lastError: !monitor ? "Monitor not found" : !channel ? "Channel not found" : "Channel disabled",
        },
      },
    });
    return;
  }

  const content = buildIncidentContent({
    monitorName: monitor.name,
    monitorType: monitor.type,
    status: payload.incidentStatus,
    message: payload.message,
    kind: payload.kind,
    incidentId: payload.incidentId,
    sentAt: new Date().toISOString(),
  });

  try {
    await deliverChannelMessage(channel, content);
    await prisma.auditLog.update({
      where: { id: retryLog.id },
      data: {
        action: INCIDENT_NOTIFICATION_RETRY_SENT_ACTION,
        newValue: {
          ...payload,
          status: "SENT",
          attempts: payload.attempts + 1,
          deliveredAt: new Date().toISOString(),
          lastError: null,
        },
      },
    });
  } catch (error) {
    const attempts = payload.attempts + 1;
    const isFinal = attempts >= payload.maxAttempts;
    await prisma.auditLog.update({
      where: { id: retryLog.id },
      data: {
        action: isFinal ? INCIDENT_NOTIFICATION_RETRY_FAILED_ACTION : INCIDENT_NOTIFICATION_RETRY_ACTION,
        newValue: {
          ...payload,
          status: isFinal ? "FAILED" : "PENDING",
          attempts,
          nextRetryAt: isFinal
            ? null
            : new Date(Date.now() + RETRY_BACKOFF_MS[Math.min(attempts, RETRY_BACKOFF_MS.length - 1)]).toISOString(),
          finishedAt: isFinal ? new Date().toISOString() : null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      },
    });
  }
};

export const processNotificationRetryQueue = async () => {
  const now = new Date();
  const retryLogs = await prisma.auditLog.findMany({
    where: {
      action: INCIDENT_NOTIFICATION_RETRY_ACTION,
      entity: "Incident",
      createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, newValue: true },
    take: RETRY_BATCH_SIZE,
  });

  const dueRetryLogs = retryLogs.filter((log) => {
    const payload = parseRetryPayload(log.newValue);
    return payload && new Date(payload.nextRetryAt).getTime() <= now.getTime();
  });

  await Promise.all(dueRetryLogs.map((log) => retryIncidentNotification(log)));
};

export const startNotificationRetryScheduler = () => {
  if (retryTimer) return;

  retryTimer = setInterval(() => {
    void processNotificationRetryQueue().catch((error) => {
      logger.error("notify", "retry queue tick failed", { error: String(error) });
    });
  }, RETRY_TICK_MS);

  void processNotificationRetryQueue().catch((error) => {
    logger.error("notify", "initial retry queue failed", { error: String(error) });
  });

  logger.info("notify", "retry scheduler started");
};

export const stopNotificationRetryScheduler = () => {
  if (!retryTimer) return;
  clearInterval(retryTimer);
  retryTimer = null;
  logger.info("notify", "retry scheduler stopped");
};

export const notifyIncidentNow = async (params: {
  monitor: Monitor;
  incidentId: string;
  alertRuleId: string;
  message: string | null;
}) => {
  const linkedChannels = (
    await prisma.alertRuleChannel.findMany({
      where: { alertRuleId: params.alertRuleId, channel: { enabled: true } },
      include: { channel: true },
    })
  ).map((item) => item.channel);

  const channels =
    linkedChannels.length > 0
      ? linkedChannels
      : await prisma.notificationChannel.findMany({
          where: { enabled: true },
          orderBy: [{ createdAt: "asc" }],
        });

  if (channels.length === 0) {
    throw new Error("ไม่มี enabled notification channel ที่ผูกกับ rule นี้ และไม่มี global channel ที่เปิดใช้งาน");
  }

  const content = buildIncidentContent({
    monitorName: params.monitor.name,
    monitorType: params.monitor.type,
    status: "OPEN",
    message: params.message,
    kind: "transition",
    incidentId: params.incidentId,
    sentAt: new Date().toISOString(),
  });

  const errors: string[] = [];
  await Promise.all(
    channels.map(async (channel) => {
      try {
        await deliverChannelMessage(channel, content);
      } catch (error) {
        errors.push(`${channel.name} (${channel.type}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );

  if (errors.length > 0) {
    throw new Error(`ส่งไม่สำเร็จ: ${errors.join(" | ")}`);
  }
};

export const testNotificationChannel = async (channelId: string) => {
  const channel = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
  if (!channel) {
    throw new Error("ไม่พบ notification channel");
  }

  const content = buildTestContent({
    channelName: channel.name,
    channelType: channel.type,
    sentAt: new Date().toISOString(),
  });
  await deliverChannelMessage(channel, content);
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

  const content = buildTestContent({
    channelName: draftChannel.name,
    channelType: draftChannel.type,
    sentAt: new Date().toISOString(),
  });
  await deliverChannelMessage(draftChannel, content);
};
