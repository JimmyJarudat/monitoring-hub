import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

const groupPayloadSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  color: t.Optional(t.String({ maxLength: 32 })),
  monitorIds: t.Optional(t.Array(t.String())),
});

const normalizeOptionalText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const since24h = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

export const groupRoutes = new Elysia({ prefix: "/groups" })
  .use(authMiddleware)
  .get("/", async () => {
    const groups = await prisma.monitorGroup.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        monitors: {
          orderBy: { createdAt: "asc" },
          include: {
            monitor: {
              select: {
                id: true,
                name: true,
                type: true,
                enabled: true,
                interval: true,
                config: true,
                results: {
                  orderBy: { checkedAt: "desc" },
                  take: 1,
                  select: {
                    status: true,
                    checkedAt: true,
                    responseTimeMs: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const items = groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      monitorCount: group.monitors.length,
      monitors: group.monitors.map(({ monitor }) => ({
        id: monitor.id,
        name: monitor.name,
        type: monitor.type,
        enabled: monitor.enabled,
        interval: monitor.interval,
        config: monitor.config,
        latestResult: monitor.results[0] ?? null,
      })),
    }));

    return ok(items);
  })
  .get(
    "/:id",
    async ({ params, set }) => {
      const group = await prisma.monitorGroup.findUnique({
        where: { id: params.id },
        include: {
          monitors: {
            orderBy: { createdAt: "asc" },
            include: {
              monitor: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  enabled: true,
                  interval: true,
                  config: true,
                  results: {
                    orderBy: { checkedAt: "desc" },
                    take: 1,
                    select: {
                      status: true,
                      checkedAt: true,
                      responseTimeMs: true,
                    },
                  },
                  incidents: {
                    where: { status: "OPEN" },
                    orderBy: { startedAt: "desc" },
                    take: 1,
                    select: {
                      id: true,
                      status: true,
                      message: true,
                      startedAt: true,
                      resolvedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!group) {
        set.status = 404;
        return fail("ไม่พบกลุ่ม");
      }

      const monitorIds = group.monitors.map(({ monitor }) => monitor.id);
      const startedSince = since24h();

      const [results24h, incidents, openIncidentCount] = await Promise.all([
        monitorIds.length > 0
          ? prisma.monitorResult.findMany({
              where: {
                monitorId: { in: monitorIds },
                checkedAt: { gte: startedSince },
              },
              select: {
                monitorId: true,
                status: true,
                responseTimeMs: true,
                checkedAt: true,
              },
            })
          : Promise.resolve([]),
        monitorIds.length > 0
          ? prisma.incident.findMany({
              where: {
                monitorId: { in: monitorIds },
              },
              orderBy: [{ startedAt: "desc" }, { id: "desc" }],
              take: 12,
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
            })
          : Promise.resolve([]),
        monitorIds.length > 0
          ? prisma.incident.count({
              where: {
                monitorId: { in: monitorIds },
                status: "OPEN",
              },
            })
          : Promise.resolve(0),
      ]);

      const resultsByMonitor = new Map<
        string,
        Array<{
          status: "UP" | "DOWN" | "DEGRADED";
          responseTimeMs: number | null;
          checkedAt: Date;
        }>
      >();

      for (const result of results24h) {
        const current = resultsByMonitor.get(result.monitorId) ?? [];
        current.push(result);
        resultsByMonitor.set(result.monitorId, current);
      }

      const monitors = group.monitors.map(({ monitor }) => {
        const recentResults = resultsByMonitor.get(monitor.id) ?? [];
        const upCount = recentResults.filter((result) => result.status === "UP").length;
        const downCount = recentResults.filter((result) => result.status === "DOWN").length;
        const responseTimes = recentResults
          .map((result) => result.responseTimeMs)
          .filter((value): value is number => typeof value === "number");
        const uptime24h =
          recentResults.length > 0 ? Math.round((upCount / recentResults.length) * 10000) / 100 : null;

        return {
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          enabled: monitor.enabled,
          interval: monitor.interval,
          config: monitor.config,
          latestResult: monitor.results[0] ?? null,
          activeIncident: monitor.incidents[0] ?? null,
          checkCount24h: recentResults.length,
          downCount24h: downCount,
          uptime24h,
          avgResponseTimeMs:
            responseTimes.length > 0
              ? Math.round(
                  responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length,
                )
              : null,
        };
      });

      const enabledMonitors = monitors.filter((monitor) => monitor.enabled);
      const latestStatuses = enabledMonitors.map((monitor) => monitor.latestResult?.status ?? null);
      const groupResponseTimes = results24h
        .map((result) => result.responseTimeMs)
        .filter((value): value is number => typeof value === "number");
      const groupUpCount = results24h.filter((result) => result.status === "UP").length;

      return ok({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        monitorCount: monitors.length,
        monitors,
        incidents,
        summary: {
          total: monitors.length,
          enabled: enabledMonitors.length,
          disabled: monitors.length - enabledMonitors.length,
          devices: monitors.filter((monitor) => monitor.type === "SNMP" || monitor.type === "SYSTEM").length,
          up: latestStatuses.filter((status) => status === "UP").length,
          degraded: latestStatuses.filter((status) => status === "DEGRADED").length,
          down: latestStatuses.filter((status) => status === "DOWN").length,
          pending: latestStatuses.filter((status) => status === null).length,
          openIncidents: openIncidentCount,
          uptime24h:
            results24h.length > 0
              ? Math.round((groupUpCount / results24h.length) * 10000) / 100
              : null,
          avgResponseTimeMs:
            groupResponseTimes.length > 0
              ? Math.round(
                  groupResponseTimes.reduce((total, value) => total + value, 0) /
                    groupResponseTimes.length,
                )
              : null,
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )
  .post(
    "/",
    async ({ body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const name = body.name.trim();
      const existing = await prisma.monitorGroup.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) {
        set.status = 409;
        return fail("This group name is already in use.");
      }

      const monitorIds = Array.from(new Set(body.monitorIds ?? []));

      if (monitorIds.length > 0) {
        const monitorCount = await prisma.monitor.count({
          where: { id: { in: monitorIds } },
        });

        if (monitorCount !== monitorIds.length) {
          set.status = 400;
          return fail("Some monitor entries are invalid.");
        }
      }

      const group = await prisma.monitorGroup.create({
        data: {
          name,
          description: normalizeOptionalText(body.description),
          color: normalizeOptionalText(body.color),
          monitors: monitorIds.length
            ? {
                create: monitorIds.map((monitorId) => ({
                  monitorId,
                })),
              }
            : undefined,
        },
        include: {
          monitors: {
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
          },
        },
      });

      return ok({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        monitorCount: group.monitors.length,
        monitors: group.monitors.map(({ monitor }) => monitor),
      });
    },
    {
      body: groupPayloadSchema,
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.monitorGroup.findUnique({
        where: { id: params.id },
        select: { id: true, name: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("Group not found.");
      }

      const name = body.name.trim();
      if (name !== existing.name) {
        const duplicate = await prisma.monitorGroup.findUnique({
          where: { name },
          select: { id: true },
        });

        if (duplicate) {
          set.status = 409;
          return fail("This group name is already in use.");
        }
      }

      const monitorIds = Array.from(new Set(body.monitorIds ?? []));
      if (monitorIds.length > 0) {
        const monitorCount = await prisma.monitor.count({
          where: { id: { in: monitorIds } },
        });

        if (monitorCount !== monitorIds.length) {
          set.status = 400;
          return fail("Some monitor entries are invalid.");
        }
      }

      const group = await prisma.monitorGroup.update({
        where: { id: params.id },
        data: {
          name,
          description: normalizeOptionalText(body.description),
          color: normalizeOptionalText(body.color),
          monitors: {
            deleteMany: {},
            ...(monitorIds.length
              ? {
                  create: monitorIds.map((monitorId) => ({
                    monitorId,
                  })),
                }
              : {}),
          },
        },
        include: {
          monitors: {
            include: {
              monitor: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  enabled: true,
                  interval: true,
                  config: true,
                  results: {
                    orderBy: { checkedAt: "desc" },
                    take: 1,
                    select: {
                      status: true,
                      checkedAt: true,
                      responseTimeMs: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return ok({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        monitorCount: group.monitors.length,
        monitors: group.monitors.map(({ monitor }) => ({
          id: monitor.id,
          name: monitor.name,
          type: monitor.type,
          enabled: monitor.enabled,
          interval: monitor.interval,
          config: monitor.config,
          latestResult: monitor.results[0] ?? null,
        })),
      });
    },
    {
      params: t.Object({ id: t.String() }),
      body: groupPayloadSchema,
    },
  )
  .delete(
    "/:id",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.monitorGroup.findUnique({
        where: { id: params.id },
        select: { id: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("Group not found.");
      }

      await prisma.monitorGroup.delete({
        where: { id: params.id },
      });

      return ok({ message: "Group deleted successfully." });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
