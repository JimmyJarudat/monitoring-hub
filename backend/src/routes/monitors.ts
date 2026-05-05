import Elysia, { t } from "elysia";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { runMonitorCheck } from "../services/monitor.Runner";

const monitorTypes = ["PING", "TCP", "HTTP", "DOCKER", "DATABASE"] as const;
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

const monitorBody = t.Object({
  name: t.String({ minLength: 1 }),
  type: t.Union([
    t.Literal("PING"),
    t.Literal("TCP"),
    t.Literal("HTTP"),
    t.Literal("DOCKER"),
    t.Literal("DATABASE"),
  ]),
  config: t.Record(t.String(), t.Any()),
  interval: t.Optional(t.Number({ minimum: 10 })),
  enabled: t.Optional(t.Boolean()),
});

const isMonitorConfig = (value: unknown): value is MonitorConfig => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const validateMonitorConfig = (type: MonitorType, config: MonitorConfig) => {
  if (type === "PING" && !config.host) {
    return "PING monitor ต้องระบุ config.host";
  }

  if (type === "TCP" && (!config.host || !config.port)) {
    return "TCP monitor ต้องระบุ config.host และ config.port";
  }

  if (type === "HTTP" && !config.url) {
    return "HTTP monitor ต้องระบุ config.url";
  }

  if (type === "DOCKER" && (!config.portainerUrl || !config.apiKey || !config.endpointId)) {
    return "DOCKER monitor ต้องระบุ config.portainerUrl, config.apiKey และ config.endpointId";
  }

  if (type === "DATABASE") {
    if (typeof config.type !== "string") {
      return "DATABASE monitor ต้องระบุ config.type";
    }

    if (!databaseTypes.includes(config.type as (typeof databaseTypes)[number])) {
      return `DATABASE monitor ไม่รองรับ config.type: ${config.type}`;
    }

    if (config.type === "sqlite") {
      if (!config.filename && !config.database) {
        return "SQLite monitor ต้องระบุ config.filename หรือ config.database";
      }

      return null;
    }

    if (config.type === "mongodb" && typeof config.uri === "string" && config.uri.trim()) {
      return null;
    }

    if (!config.host || !config.port) {
      return "DATABASE monitor ต้องระบุ config.host และ config.port";
    }
  }

  return null;
};

export const monitorRoutes = new Elysia({ prefix: "/monitors" })
  .get("/", async ({ query }) => {
    const type = typeof query.type === "string" ? query.type : undefined;
    const enabled =
      query.enabled === "true" ? true : query.enabled === "false" ? false : undefined;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const monitors = await prisma.monitor.findMany({
      where: {
        ...(type && monitorTypes.includes(type as MonitorType)
          ? { type: type as MonitorType }
          : {}),
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

      const where: Prisma.MonitorResultWhereInput = {
        ...(Object.keys(checkedAt).length > 0 ? { checkedAt } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.monitorId ? { monitorId: query.monitorId } : {}),
        ...(query.type ? { monitor: { type: query.type } } : {}),
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
        type: t.Optional(
          t.Union([
            t.Literal("PING"),
            t.Literal("TCP"),
            t.Literal("HTTP"),
            t.Literal("DOCKER"),
            t.Literal("DATABASE"),
          ]),
        ),
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
          alertRules: true,
          incidents: {
            orderBy: { startedAt: "desc" },
            take: 20,
          },
        },
      });

      if (!monitor) {
        set.status = 404;
        return fail("ไม่พบ monitor");
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
    async ({ body, set }) => {
      if (!isMonitorConfig(body.config)) {
        set.status = 400;
        return fail("config ต้องเป็น object");
      }

      const configError = validateMonitorConfig(body.type, body.config);
      if (configError) {
        set.status = 400;
        return fail(configError);
      }

      const data: Prisma.MonitorCreateInput = {
        name: body.name.trim(),
        type: body.type,
        config: body.config,
        interval: body.interval ?? 60,
        enabled: body.enabled ?? true,
      };

      const monitor = await prisma.monitor.create({ data });

      set.status = 201;
      return ok(monitor);
    },
    {
      body: monitorBody,
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const existing = await prisma.monitor.findUnique({ where: { id: params.id } });
      const bodyConfig = body.config;

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ monitor");
      }

      if (bodyConfig !== undefined && !isMonitorConfig(bodyConfig)) {
        set.status = 400;
        return fail("config ต้องเป็น object");
      }

      const type = (body.type ?? existing.type) as MonitorType;
      const config = bodyConfig ?? existing.config;

      if (!isMonitorConfig(config)) {
        set.status = 400;
        return fail("config ต้องเป็น object");
      }

      const configError = validateMonitorConfig(type, config);

      if (configError) {
        set.status = 400;
        return fail(configError);
      }

      const data: Prisma.MonitorUpdateInput = {};

      if (body.name !== undefined) data.name = body.name.trim();
      if (body.type !== undefined) data.type = body.type;
      if (bodyConfig !== undefined) data.config = bodyConfig;
      if (body.interval !== undefined) data.interval = body.interval;
      if (body.enabled !== undefined) data.enabled = body.enabled;

      const monitor = await prisma.monitor.update({
        where: { id: params.id },
        data,
      });

      return ok(monitor);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(monitorBody),
    },
  )
  .post(
    "/:id/check",
    async ({ params, set }) => {
      const monitor = await prisma.monitor.findUnique({ where: { id: params.id } });

      if (!monitor) {
        set.status = 404;
        return fail("ไม่พบ monitor");
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
    async ({ params, set }) => {
      const existing = await prisma.monitor.findUnique({ where: { id: params.id } });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ monitor");
      }

      await prisma.monitor.delete({ where: { id: params.id } });
      return ok({ message: "ลบ monitor แล้ว" });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
