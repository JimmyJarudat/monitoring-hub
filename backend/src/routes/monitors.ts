import Elysia, { t } from "elysia";
import type { Prisma } from "../generated/prisma/client";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import { notifyAdmins } from "../services/appNotification.service";
import { runMonitorCheck } from "../services/monitor.Runner";
import { notifyIncidentNow } from "../services/notification.service";

const monitorTypes = ["PING", "TCP", "HTTP", "TLS_CERT", "DNS", "SNMP", "SYSTEM", "DOCKER", "DATABASE"] as const;
const databaseTypes = [
  "postgresql",
  "mariadb",
  "redis",
  "mongodb",
  "mysql",
  "sqlite",
  "sqlserver",
  "mssql",
] as const;
type MonitorType = (typeof monitorTypes)[number];

type MonitorConfig = Prisma.InputJsonObject;
type SummaryStatus = "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";
type CheckedAtFilter = {
  gte?: Date;
  lte?: Date;
};
type MonitorStatusFilter = "UP" | "DOWN" | "DEGRADED";
type DeviceMetricGroup = "SYSTEM" | "DISK" | "NET";
type CredentialType = "SNMP_COMMUNITY" | "USERNAME_PASSWORD" | "API_TOKEN" | "SSH_KEY";

const monitorBody = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.Union([
    t.Literal("PING"),
    t.Literal("TCP"),
    t.Literal("HTTP"),
    t.Literal("TLS_CERT"),
    t.Literal("DNS"),
    t.Literal("SNMP"),
    t.Literal("SYSTEM"),
    t.Literal("DOCKER"),
    t.Literal("DATABASE"),
  ]),
  config: t.Record(t.String(), t.Any()),
  credentialId: t.Optional(t.String()),
  interval: t.Optional(t.Number({ minimum: 10 })),
  enabled: t.Optional(t.Boolean()),
});

const alertRuleBody = t.Object({
  metric: t.String({ minLength: 1, maxLength: 80 }),
  operator: t.Union([t.Literal("GT"), t.Literal("LT"), t.Literal("EQ"), t.Literal("NEQ")]),
  threshold: t.Number(),
  severity: t.Union([t.Literal("INFO"), t.Literal("WARNING"), t.Literal("CRITICAL")]),
  enabled: t.Optional(t.Boolean()),
  channelIds: t.Optional(t.Array(t.String())),
});

const isMonitorConfig = (value: unknown): value is MonitorConfig => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const allowedAlertMetrics = new Set([
  "status",
  "response_time",
  "cpu.used_pct",
  "memory.used_pct",
  "disk.used_pct",
]);

const validateAlertRuleInput = (
  monitorType: MonitorType,
  body: { metric: string; threshold: number },
) => {
  if (!allowedAlertMetrics.has(body.metric)) return "metric This metric is not supported yet.";
  if (!Number.isFinite(body.threshold)) return "Threshold must be a number.";
  if (body.metric === "status" && ![1, 2, 3].includes(body.threshold)) {
    return "Status threshold must be one of the following values: 1 = DOWN, 2 = DEGRADED, 3 = UP.";
  }
  if (body.metric === "response_time" && body.threshold < 0) {
    return "Response time threshold must be greater than or equal to 0.";
  }
  if (body.metric.endsWith("_pct")) {
    if (monitorType !== "SYSTEM" && monitorType !== "SNMP") {
      return "CPU/RAM/Disk rules can only be used with SYSTEM or SNMP monitors.";
    }
    if (body.threshold < 0 || body.threshold > 100) return "percent threshold must be 0-100";
  }
  return null;
};

const syncAlertRuleChannels = async (
  tx: Prisma.TransactionClient,
  alertRuleId: string,
  channelIds: string[] | undefined,
) => {
  if (!channelIds) return;
  const uniqueChannelIds = Array.from(new Set(channelIds.filter((id) => id.trim().length > 0)));
  const existingChannels = await tx.notificationChannel.findMany({
    where: { id: { in: uniqueChannelIds } },
    select: { id: true },
  });

  if (existingChannels.length !== uniqueChannelIds.length) {
    throw new Error("Some notification channels were not found in the system.");
  }

  await tx.alertRuleChannel.deleteMany({ where: { alertRuleId } });
  if (uniqueChannelIds.length > 0) {
    await tx.alertRuleChannel.createMany({
      data: uniqueChannelIds.map((channelId) => ({ alertRuleId, channelId })),
    });
  }
};

const alertRuleInclude = {
  channels: {
    include: {
      channel: {
        select: { id: true, name: true, type: true, enabled: true },
      },
    },
  },
} satisfies Prisma.AlertRuleInclude;

const getCompatibleCredentialTypes = (
  type: MonitorType,
  config: MonitorConfig,
): CredentialType[] => {
  if (type === "SNMP" || type === "SYSTEM") return ["SNMP_COMMUNITY"];
  if (type === "HTTP" && config.authType === "basic") return ["USERNAME_PASSWORD"];
  if (type === "HTTP" && config.authType === "bearer") return ["API_TOKEN"];
  if (type === "DOCKER") return ["API_TOKEN"];
  if (type === "DATABASE" && config.type !== "sqlite") return ["USERNAME_PASSWORD"];
  return [];
};

const validateCredentialBinding = async (
  credentialId: string | undefined,
  type: MonitorType,
  config: MonitorConfig,
) => {
  if (!credentialId) return null;

  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { id: true, type: true, name: true },
  });

  if (!credential) {
    return "The selected credential was not found.";
  }

  const compatibleTypes = getCompatibleCredentialTypes(type, config);
  if (!compatibleTypes.includes(credential.type as CredentialType)) {
    return `Credential "${credential.name}" is not compatible with this monitor type`;
  }

  return null;
};

const validateMonitorConfig = (type: MonitorType, config: MonitorConfig) => {
  if (type === "PING" && !config.host) {
    return "PING monitor requires config.host";
  }

  if (type === "TCP" && (!config.host || !config.port)) {
    return "TCP monitor requires config.host and config.port";
  }

  if (type === "HTTP" && !config.url) {
    return "HTTP monitor requires config.url";
  }

  if (
    type === "TLS_CERT" &&
    !(typeof config.url === "string" && config.url.trim()) &&
    !(typeof config.host === "string" && config.host.trim())
  ) {
    return "TLS certificate monitor requires config.url or config.host";
  }

  if (type === "DNS" && !(typeof config.host === "string" && config.host.trim())) {
    return "DNS monitor requires config.host";
  }

  if (type === "SNMP" && !(typeof config.host === "string" && config.host.trim())) {
    return "SNMP monitor requires config.host";
  }

  if (type === "SYSTEM" && !(typeof config.host === "string" && config.host.trim())) {
    return "SYSTEM monitor requires config.host";
  }

  if (type === "DOCKER" && (!config.portainerUrl || !config.apiKey || !config.endpointId)) {
    return "DOCKER monitor requires config.portainerUrl, config.apiKey and config.endpointId";
  }

  if (type === "DATABASE") {
    if (typeof config.type !== "string") {
      return "DATABASE monitor requires config.type";
    }

    if (!databaseTypes.includes(config.type as (typeof databaseTypes)[number])) {
      return `DATABASE monitor does not support config.type: ${config.type}`;
    }

    if (config.type === "sqlite") {
      if (!config.filename && !config.database) {
        return "SQLite monitor requires config.filename or config.database";
      }

      return null;
    }

    if (config.type === "mongodb" && typeof config.uri === "string" && config.uri.trim()) {
      return null;
    }

    if (!config.host || !config.port) {
      return "DATABASE monitor requires config.host and config.port";
    }
  }

  return null;
};

export const monitorRoutes = new Elysia({ prefix: "/monitors" })
  .use(authMiddleware)
  .get("/", async ({ query }) => {
    const type = typeof query.type === "string" ? query.type : undefined;
    const groupId = typeof query.groupId === "string" && query.groupId.trim() ? query.groupId : undefined;
    const enabled =
      query.enabled === "true" ? true : query.enabled === "false" ? false : undefined;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const monitors = await prisma.monitor.findMany({
      where: {
        ...(type && monitorTypes.includes(type as MonitorType)
          ? { type: type as any }
          : {}),
        ...(groupId ? { groups: { some: { groupId } } } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        results: {
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
        incidents: {
          where: { status: "OPEN" },
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        credential: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    const monitorStats = await Promise.all(
      monitors.map(async (monitor) => {
        const [lastDown, recentResults] = await Promise.all([
          prisma.monitorResult.findFirst({
            where: {
              monitorId: monitor.id,
              status: "DOWN",
            },
            orderBy: { checkedAt: "desc" },
          }),
          prisma.monitorResult.findMany({
            where: {
              monitorId: monitor.id,
              checkedAt: { gte: since24h },
            },
            select: { status: true },
          }),
        ]);

        const upCount = recentResults.filter((result) => result.status === "UP").length;
        const downCount = recentResults.filter((result) => result.status === "DOWN").length;
        const uptime24h =
          recentResults.length > 0 ? Math.round((upCount / recentResults.length) * 10000) / 100 : null;

        return {
          ...monitor,
          latestResult: monitor.results[0] ?? null,
          lastDownAt: lastDown?.checkedAt ?? null,
          downCount24h: downCount,
          checkCount24h: recentResults.length,
          uptime24h,
          activeIncident: monitor.incidents[0] ?? null,
        };
      }),
    );

    return ok(monitorStats);
  })
  .get("/summary", async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const monitors = await prisma.monitor.findMany({
      where: { enabled: true },
      include: {
        results: {
          orderBy: { checkedAt: "desc" },
          take: 1,
        },
      },
    });

    const latestStatuses: SummaryStatus[] = monitors.map(
      (monitor) => monitor.results[0]?.status ?? "UNKNOWN",
    );
    const [openIncidents, results24h] = await Promise.all([
      prisma.incident.count({ where: { status: "OPEN" } }),
      prisma.monitorResult.findMany({
        where: { checkedAt: { gte: since24h } },
        select: { status: true, responseTimeMs: true },
      }),
    ]);
    const upCount24h = results24h.filter((result) => result.status === "UP").length;
    const responseTimes = results24h
      .map((result) => result.responseTimeMs)
      .filter((time): time is number => typeof time === "number");

    return ok({
      total: monitors.length,
      up: latestStatuses.filter((status) => status === "UP").length,
      degraded: latestStatuses.filter((status) => status === "DEGRADED").length,
      down: latestStatuses.filter((status) => status === "DOWN").length,
      unknown: latestStatuses.filter((status) => status === "UNKNOWN").length,
      openIncidents,
      uptime24h:
        results24h.length > 0 ? Math.round((upCount24h / results24h.length) * 10000) / 100 : null,
      avgResponseTimeMs:
        responseTimes.length > 0
          ? Math.round(responseTimes.reduce((total, time) => total + time, 0) / responseTimes.length)
          : null,
    });
  })
  .get(
    "/results",
    async ({ query }) => {
      const requestedLimit = Number(query.limit ?? 50);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
        : 50;
      const requestedPage = Number(query.page ?? 1);
      const page = Number.isFinite(requestedPage)
        ? Math.max(Math.trunc(requestedPage), 1)
        : 1;
      const skip = (page - 1) * limit;
      const checkedAt: CheckedAtFilter = {};
      const from = typeof query.from === "string" ? new Date(query.from) : null;
      const to = typeof query.to === "string" ? new Date(query.to) : null;

      if (from && !Number.isNaN(from.getTime())) {
        checkedAt.gte = from;
      }

      if (to && !Number.isNaN(to.getTime())) {
        checkedAt.lte = to;
      }

      const monitorWhere: Prisma.MonitorWhereInput = {
        ...(query.type ? { type: query.type as any } : {}),
        ...(query.groupId ? { groups: { some: { groupId: query.groupId } } } : {}),
      };

      const where: Prisma.MonitorResultWhereInput = {
        ...(Object.keys(checkedAt).length > 0 ? { checkedAt } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.monitorId ? { monitorId: query.monitorId } : {}),
        ...(Object.keys(monitorWhere).length > 0 ? { monitor: monitorWhere } : {}),
      };

      const results = await prisma.monitorResult.findMany({
        where,
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit + 1,
        include: {
          monitor: {
            select: {
              id: true,
              name: true,
              type: true,
              enabled: true,
              interval: true,
              config: true,
            },
          },
        },
      });

      const hasMore = results.length > limit;
      const items = results.slice(0, limit);
      const statusCounts = items.reduce(
        (counts, result) => {
          counts[result.status] += 1;
          return counts;
        },
        { UP: 0, DOWN: 0, DEGRADED: 0 } as Record<MonitorStatusFilter, number>,
      );

      return ok({
        items,
        page,
        limit,
        hasMore,
        statusCounts,
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal("UP"), t.Literal("DOWN"), t.Literal("DEGRADED")]),
        ),
        monitorId: t.Optional(t.String()),
        groupId: t.Optional(t.String()),
        type: t.Optional(
          t.Union([
            t.Literal("PING"),
            t.Literal("TCP"),
            t.Literal("HTTP"),
            t.Literal("TLS_CERT"),
            t.Literal("DNS"),
            t.Literal("SNMP"),
            t.Literal("SYSTEM"),
            t.Literal("DOCKER"),
            t.Literal("DATABASE"),
          ]),
        ),
      }),
    },
  )
  .get(
    "/:id/metrics",
    async ({ params, query, set }) => {
      const existing = await prisma.monitor.findUnique({
        where: { id: params.id },
        select: { id: true, name: true, type: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("Monitor not found");
      }

      const requestedLimit = Number(query.limit ?? 5000);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 20000)
        : 5000;
      const collectedAt: CheckedAtFilter = {};
      const from = typeof query.from === "string" ? new Date(query.from) : null;
      const to = typeof query.to === "string" ? new Date(query.to) : null;

      if (from && !Number.isNaN(from.getTime())) collectedAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) collectedAt.lte = to;

      const samples = await prisma.deviceMetricSample.findMany({
        where: {
          monitorId: params.id,
          ...(Object.keys(collectedAt).length > 0 ? { collectedAt } : {}),
          ...(query.metricGroup ? { metricGroup: query.metricGroup } : {}),
          ...(query.metricKey ? { metricKey: query.metricKey } : {}),
          ...(query.instance ? { instance: query.instance } : {}),
        },
        orderBy: [{ collectedAt: "asc" }, { metricKey: "asc" }, { instance: "asc" }],
        take: limit,
      });

      const grouped = new Map<
        string,
        {
          metricGroup: DeviceMetricGroup;
          metricKey: string;
          instance: string | null;
          unit: string;
          points: Array<{ collectedAt: Date; value: number }>;
        }
      >();

      for (const sample of samples) {
        const key = `${sample.metricGroup}:${sample.metricKey}:${sample.instance ?? ""}`;
        const current = grouped.get(key);

        if (!current) {
          grouped.set(key, {
            metricGroup: sample.metricGroup as DeviceMetricGroup,
            metricKey: sample.metricKey,
            instance: sample.instance,
            unit: sample.unit,
            points: [{ collectedAt: sample.collectedAt, value: sample.value }],
          });
          continue;
        }

        current.points.push({ collectedAt: sample.collectedAt, value: sample.value });
      }

      return ok({
        monitor: existing,
        sampleCount: samples.length,
        series: Array.from(grouped.values()),
      });
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 20000 })),
        metricGroup: t.Optional(
          t.Union([t.Literal("SYSTEM"), t.Literal("DISK"), t.Literal("NET")]),
        ),
        metricKey: t.Optional(t.String()),
        instance: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:id",
    async ({ params, query, set }) => {
      const requestedResultsLimit = Number(query.resultsLimit ?? 20);
      const resultsLimit = Number.isFinite(requestedResultsLimit)
        ? Math.min(Math.max(Math.trunc(requestedResultsLimit), 1), 200)
        : 20;
      const checkedAt: CheckedAtFilter = {};
      const from = typeof query.from === "string" ? new Date(query.from) : null;
      const to = typeof query.to === "string" ? new Date(query.to) : null;

      if (from && !Number.isNaN(from.getTime())) {
        checkedAt.gte = from;
      }

      if (to && !Number.isNaN(to.getTime())) {
        checkedAt.lte = to;
      }

      const monitor = await prisma.monitor.findUnique({
        where: { id: params.id },
        include: {
          results: {
            where: Object.keys(checkedAt).length > 0 ? { checkedAt } : undefined,
            orderBy: { checkedAt: "desc" },
            take: resultsLimit + 1,
          },
          alertRules: {
            orderBy: [{ createdAt: "asc" }],
            include: alertRuleInclude,
          },
          incidents: {
            orderBy: { startedAt: "desc" },
            take: 20,
          },
          credential: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      });

      if (!monitor) {
        set.status = 404;
        return fail("Monitor not found");
      }

      const hasMoreResults = monitor.results.length > resultsLimit;

      return ok({
        ...monitor,
        results: monitor.results.slice(0, resultsLimit),
        hasMoreResults,
      });
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        resultsLimit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      if (!isMonitorConfig(body.config)) {
        set.status = 400;
        return fail("config must be an object");
      }

      const configError = validateMonitorConfig(body.type, body.config);
      if (configError) {
        set.status = 400;
        return fail(configError);
      }

      const credentialError = await validateCredentialBinding(
        body.credentialId,
        body.type,
        body.config,
      );
      if (credentialError) {
        set.status = 400;
        return fail(credentialError);
      }

      const data: Prisma.MonitorCreateInput = {
        name: body.name.trim(),
        type: body.type as any,
        config: body.config,
        ...(body.credentialId ? { credential: { connect: { id: body.credentialId } } } : {}),
        interval: body.interval ?? 60,
        enabled: body.enabled ?? true,
      };

      const monitor = await prisma.monitor.create({ data });
      await notifyAdmins({
        type: "MONITOR",
        severity: "INFO",
        title: "Monitor created",
        message: `New monitor added: ${monitor.name} (${monitor.type})`,
        href: `/monitors/${monitor.id}`,
        entity: "Monitor",
        entityId: monitor.id,
        metadata: {
          monitorId: monitor.id,
          monitorName: monitor.name,
          monitorType: monitor.type,
          createdByUserId: currentUser.id,
        },
      });

      set.status = 201;
      return ok(monitor);
    },
    {
      body: monitorBody,
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.monitor.findUnique({ where: { id: params.id } });
      const bodyConfig = body.config;

      if (!existing) {
        set.status = 404;
        return fail("Monitor not found");
      }

      if (bodyConfig !== undefined && !isMonitorConfig(bodyConfig)) {
        set.status = 400;
        return fail("config must be an object");
      }

      const type = (body.type ?? existing.type) as MonitorType;
      const config = bodyConfig ?? existing.config;

      if (!isMonitorConfig(config)) {
        set.status = 400;
        return fail("config must be an object");
      }

      const configError = validateMonitorConfig(type, config);

      if (configError) {
        set.status = 400;
        return fail(configError);
      }

      const nextCredentialId = body.credentialId !== undefined
        ? body.credentialId || undefined
        : existing.credentialId || undefined;
      const credentialError = await validateCredentialBinding(nextCredentialId, type, config);
      if (credentialError) {
        set.status = 400;
        return fail(credentialError);
      }

      const data: Prisma.MonitorUpdateInput = {};

      if (body.name !== undefined) data.name = body.name.trim();
      if (body.type !== undefined) data.type = body.type as any;
      if (bodyConfig !== undefined) data.config = bodyConfig;
      if (body.credentialId !== undefined) {
        data.credential = body.credentialId
          ? { connect: { id: body.credentialId } }
          : { disconnect: true };
      }
      if (body.interval !== undefined) data.interval = body.interval;
      if (body.enabled !== undefined) data.enabled = body.enabled;

      const monitor = await prisma.monitor.update({
        where: { id: params.id },
        data,
      });

      if (body.enabled !== undefined && body.enabled !== existing.enabled) {
        void notifyAdmins({
          type: "MONITOR",
          severity: body.enabled ? "INFO" : "WARNING",
          title: body.enabled ? "Monitor enabled" : "Monitor disabled",
          message: `"${monitor.name}" has been ${body.enabled ? "enabled" : "disabled"}`,
          entity: "Monitor",
          entityId: monitor.id,
          href: `/monitors/${monitor.id}`,
        });
      }

      return ok(monitor);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(monitorBody),
    },
  )
  .post(
    "/:id/alert-rules",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const monitor = await prisma.monitor.findUnique({
        where: { id: params.id },
        select: { id: true, type: true },
      });
      if (!monitor) {
        set.status = 404;
        return fail("Monitor not found");
      }

      const validationError = validateAlertRuleInput(monitor.type as MonitorType, body);
      if (validationError) {
        set.status = 400;
        return fail(validationError);
      }

      try {
        const rule = await prisma.$transaction(async (tx) => {
          const created = await tx.alertRule.create({
            data: {
              monitorId: monitor.id,
              metric: body.metric.trim(),
              operator: body.operator,
              threshold: body.threshold,
              severity: body.severity,
              enabled: body.enabled ?? true,
            },
          });
          await syncAlertRuleChannels(tx, created.id, body.channelIds);
          return tx.alertRule.findUniqueOrThrow({
            where: { id: created.id },
            include: alertRuleInclude,
          });
        });

        set.status = 201;
        return ok(rule);
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "Failed to create alert rule");
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: alertRuleBody,
    },
  )
  .patch(
    "/:id/alert-rules/:ruleId",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.alertRule.findFirst({
        where: { id: params.ruleId, monitorId: params.id },
        include: { monitor: { select: { type: true } } },
      });
      if (!existing) {
        set.status = 404;
        return fail("Alert rule not found");
      }

      const nextMetric = body.metric ?? existing.metric;
      const nextThreshold = body.threshold ?? existing.threshold;
      const validationError = validateAlertRuleInput(existing.monitor.type as MonitorType, {
        metric: nextMetric,
        threshold: nextThreshold,
      });
      if (validationError) {
        set.status = 400;
        return fail(validationError);
      }

      try {
        const rule = await prisma.$transaction(async (tx) => {
          await tx.alertRule.update({
            where: { id: existing.id },
            data: {
              metric: body.metric?.trim(),
              operator: body.operator,
              threshold: body.threshold,
              severity: body.severity,
              enabled: body.enabled,
            },
          });
          await syncAlertRuleChannels(tx, existing.id, body.channelIds);
          return tx.alertRule.findUniqueOrThrow({
            where: { id: existing.id },
            include: alertRuleInclude,
          });
        });

        return ok(rule);
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "Failed to update alert rule");
      }
    },
    {
      params: t.Object({ id: t.String(), ruleId: t.String() }),
      body: t.Partial(alertRuleBody),
    },
  )
  .delete(
    "/:id/alert-rules/:ruleId",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);
      const existing = await prisma.alertRule.findFirst({
        where: { id: params.ruleId, monitorId: params.id },
        select: { id: true },
      });
      if (!existing) {
        set.status = 404;
        return fail("Alert rule not found");
      }
      await prisma.alertRule.delete({ where: { id: existing.id } });
      return ok({ message: "Alert rule deleted" });
    },
    {
      params: t.Object({ id: t.String(), ruleId: t.String() }),
    },
  )
  .post(
    "/:id/alert-rules/:ruleId/notify",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const rule = await prisma.alertRule.findFirst({
        where: { id: params.ruleId, monitorId: params.id },
        include: { monitor: true },
      });
      if (!rule) {
        set.status = 404;
        return fail("Alert rule not found");
      }

      const openIncident = await prisma.incident.findFirst({
        where: { alertRuleId: rule.id, status: "OPEN" },
        orderBy: { startedAt: "desc" },
      });
      if (!openIncident) {
        set.status = 400;
        return fail("No open incident found for this rule");
      }

      try {
        await notifyIncidentNow({
          monitor: rule.monitor,
          incidentId: openIncident.id,
          alertRuleId: rule.id,
          message: openIncident.message,
        });
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "Failed to send notification");
      }

      return ok({ message: "Notification sent" });
    },
    {
      params: t.Object({ id: t.String(), ruleId: t.String() }),
    },
  )
  .post(
    "/:id/check",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const monitor = await prisma.monitor.findUnique({ where: { id: params.id } });

      if (!monitor) {
        set.status = 404;
        return fail("Monitor not found");
      }

      const result = await runMonitorCheck(monitor);
      return ok(result);
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )
  .delete(
    "/:id",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.monitor.findUnique({ where: { id: params.id } });

      if (!existing) {
        set.status = 404;
        return fail("Monitor not found");
      }

      await prisma.monitor.delete({ where: { id: params.id } });

      void notifyAdmins({
        type: "MONITOR",
        severity: "WARNING",
        title: "Monitor deleted",
        message: `"${existing.name}" (${existing.type}) was deleted by admin`,
        entity: "Monitor",
        entityId: existing.id,
      });

      return ok({ message: "Monitor deleted" });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
