import type { MonitorStatus } from "../generated/prisma/enums";
import type { NotificationChannel } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import { logger } from "../lib/logger";
import { getSystemConfig, type ScheduledReportConfig } from "./systemConfig.service";
import { deliverChannelMessage, type AllChannelContent } from "./notification.service";
import { notifyAdmins } from "./appNotification.service";
import {
  buildDailyReportDiscordMessage,
  buildDailyReportEmailMessage,
  buildDailyReportLineMessage,
  buildDailyReportSlackMessage,
  buildDailyReportTelegramMessage,
  buildDailyReportWebhookPayload,
  type DailyStatusReportTemplateData,
} from "./templates";

const TICK_MS = 60_000;
const SENT_ACTION = "SCHEDULED_DAILY_STATUS_REPORT_SENT";

let timer: ReturnType<typeof setInterval> | null = null;

const pad2 = (value: number) => String(value).padStart(2, "0");

const extractTarget = (type: string, config: unknown): string => {
  if (!config || typeof config !== "object") return "-";
  const c = config as Record<string, unknown>;
  if (type === "HTTP") return String(c.url ?? "-");
  if (type === "TLS_CERT") return String(c.url ?? c.host ?? "-");
  if (type === "TCP") return `${c.host ?? "-"}:${c.port ?? "-"}`;
  if (type === "DOCKER") return String(c.portainerUrl ?? "-");
  if (type === "DATABASE") return String(c.host ?? c.filename ?? c.database ?? "-");
  return String(c.host ?? "-");
};
const localDateKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const localTimeKey = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const formatTodayLabel = (date: Date) => new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(date);

const resolveChannels = async (config: ScheduledReportConfig): Promise<NotificationChannel[]> => {
  if (config.channelIds.length > 0) {
    return prisma.notificationChannel.findMany({
      where: { enabled: true, id: { in: config.channelIds } },
      orderBy: [{ createdAt: "asc" }],
    });
  }
  return prisma.notificationChannel.findMany({
    where: { enabled: true },
    orderBy: [{ createdAt: "asc" }],
  });
};

const buildDailyStatusReport = async (now = new Date()): Promise<DailyStatusReportTemplateData> => {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [monitors, incidentsInWindow, openIncidents] = await Promise.all([
    prisma.monitor.findMany({
      where: { enabled: true },
      orderBy: [{ name: "asc" }],
      include: {
        results: {
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
        incidents: {
          where: {
            startedAt: { lt: windowEnd },
            OR: [{ resolvedAt: null }, { resolvedAt: { gt: windowStart } }],
          },
          orderBy: { startedAt: "asc" },
        },
      },
    }),
    prisma.incident.count({ where: { startedAt: { gte: windowStart, lte: windowEnd } } }),
    prisma.incident.count({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } } }),
  ]);

  const rows = monitors.map((monitor) => {
    const latest = monitor.results[0] ?? null;
    const downtimeWindows = monitor.incidents.map((incident) => ({
      start: incident.startedAt.toISOString(),
      end: incident.resolvedAt?.toISOString() ?? null,
    }));
    return {
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      target: extractTarget(monitor.type, monitor.config),
      status: (latest?.status ?? "UNKNOWN") as MonitorStatus | "UNKNOWN",
      message: latest?.message ?? null,
      checkedAt: latest?.checkedAt?.toISOString() ?? null,
      downtimeWindows,
    };
  });

  const offlineMonitors = rows.filter((m) => m.status === "DOWN");
  const degradedMonitors = rows.filter((m) => m.status === "DEGRADED");
  const unknownMonitors = rows.filter((m) => m.status === "UNKNOWN");

  return {
    generatedAt: now.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    todayLabel: formatTodayLabel(now),
    total: rows.length,
    online: rows.filter((m) => m.status === "UP").length,
    offline: offlineMonitors.length,
    degraded: degradedMonitors.length,
    unknown: unknownMonitors.length,
    incidentsInWindow,
    openIncidents,
    allMonitors: rows,
    offlineMonitors,
    degradedMonitors,
    unknownMonitors,
  };
};

const buildContent = (report: DailyStatusReportTemplateData): AllChannelContent => ({
  telegram: buildDailyReportTelegramMessage(report),
  line: buildDailyReportLineMessage(report),
  email: buildDailyReportEmailMessage(report),
  slack: buildDailyReportSlackMessage(report),
  discord: buildDailyReportDiscordMessage(report),
  webhook: buildDailyReportWebhookPayload(report),
});

export const sendScheduledAvailabilityReport = async (reason: "scheduled" | "manual" = "manual") => {
  const { scheduledReport } = await getSystemConfig();
  const channels = await resolveChannels(scheduledReport);
  if (channels.length === 0) {
    throw new Error("No enabled notification channels available for sending daily status reports.");
  }

  const report = await buildDailyStatusReport();
  const content = buildContent(report);
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
    throw new Error(`Failed to send daily status report to some channels.: ${errors.join(" | ")}`);
  }

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: SENT_ACTION,
      entity: "ScheduledReport",
      newValue: {
        reason,
        sentDate: localDateKey(new Date()),
        channelIds: channels.map((channel) => channel.id),
        summary: {
          total: report.total,
          online: report.online,
          offline: report.offline,
          degraded: report.degraded,
          unknown: report.unknown,
          incidentsInWindow: report.incidentsInWindow,
          openIncidents: report.openIncidents,
        },
      },
    },
  });

  await notifyAdmins({
    type: "REPORT",
    severity: report.offline > 0 || report.openIncidents > 0 ? "WARNING" : "SUCCESS",
    title: "Daily status report sent",
    message: `Online ${report.online}/${report.total} · Offline ${report.offline} · Open incidents ${report.openIncidents}`,
    href: "/scheduled-reports",
    entity: "ScheduledReport",
  });

  return { message: "Daily status report sent successfully." };
};

const tick = async () => {
  const { scheduledReport } = await getSystemConfig();
  if (!scheduledReport.enabled) return;

  const now = new Date();
  if (localTimeKey(now) !== scheduledReport.time) return;

  const sentDate = localDateKey(now);
  const existing = await prisma.auditLog.findFirst({
    where: {
      action: SENT_ACTION,
      entity: "ScheduledReport",
      createdAt: { gte: startOfDay(now) },
    },
  });
  if (existing) return;

  await sendScheduledAvailabilityReport("scheduled");
  logger.info("report", "scheduled daily status report sent", { sentDate });
};

export const startScheduledReportScheduler = () => {
  if (timer) return;
  timer = setInterval(() => {
    void tick().catch((error) => logger.error("report", "scheduled report tick failed", { error: String(error) }));
  }, TICK_MS);
  logger.info("report", "scheduled report scheduler started");
};

export const stopScheduledReportScheduler = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info("report", "scheduled report scheduler stopped");
};
