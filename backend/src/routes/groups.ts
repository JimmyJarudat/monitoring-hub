import Elysia, { t } from "elysia";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";

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

export const groupRoutes = new Elysia({ prefix: "/groups" })
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
  .post(
    "/",
    async ({ body, set }) => {
      const name = body.name.trim();
      const existing = await prisma.monitorGroup.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) {
        set.status = 409;
        return fail("ชื่อกลุ่มนี้ถูกใช้งานแล้ว");
      }

      const monitorIds = Array.from(new Set(body.monitorIds ?? []));

      if (monitorIds.length > 0) {
        const monitorCount = await prisma.monitor.count({
          where: { id: { in: monitorIds } },
        });

        if (monitorCount !== monitorIds.length) {
          set.status = 400;
          return fail("มี monitor บางรายการไม่ถูกต้อง");
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
    async ({ params, body, set }) => {
      const existing = await prisma.monitorGroup.findUnique({
        where: { id: params.id },
        select: { id: true, name: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบกลุ่ม");
      }

      const name = body.name.trim();
      if (name !== existing.name) {
        const duplicate = await prisma.monitorGroup.findUnique({
          where: { name },
          select: { id: true },
        });

        if (duplicate) {
          set.status = 409;
          return fail("ชื่อกลุ่มนี้ถูกใช้งานแล้ว");
        }
      }

      const monitorIds = Array.from(new Set(body.monitorIds ?? []));
      if (monitorIds.length > 0) {
        const monitorCount = await prisma.monitor.count({
          where: { id: { in: monitorIds } },
        });

        if (monitorCount !== monitorIds.length) {
          set.status = 400;
          return fail("มี monitor บางรายการไม่ถูกต้อง");
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
    async ({ params, set }) => {
      const existing = await prisma.monitorGroup.findUnique({
        where: { id: params.id },
        select: { id: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบกลุ่ม");
      }

      await prisma.monitorGroup.delete({
        where: { id: params.id },
      });

      return ok({ message: "ลบกลุ่มแล้ว" });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
