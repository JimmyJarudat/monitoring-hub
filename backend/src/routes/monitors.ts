import Elysia, { t } from "elysia";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { runMonitorCheck } from "../services/monitor.Runner";

const monitorTypes = ["PING", "TCP", "HTTP", "DOCKER", "DATABASE"] as const;
type MonitorType = (typeof monitorTypes)[number];

type MonitorConfig = Prisma.InputJsonObject;
type SummaryStatus = "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";

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
    if (!config.type) {
      return "DATABASE monitor ต้องระบุ config.type";
    }

    if (config.type === "sqlite") {
      if (!config.filename && !config.database) {
        return "SQLite monitor ต้องระบุ config.filename หรือ config.database";
      }

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
    "/:id",
    async ({ params, set }) => {
      const monitor = await prisma.monitor.findUnique({
        where: { id: params.id },
        include: {
          results: {
            orderBy: { checkedAt: "desc" },
            take: 20,
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

      return ok(monitor);
    },
    {
      params: t.Object({ id: t.String() }),
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
