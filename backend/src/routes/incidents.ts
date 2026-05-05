import Elysia, { t } from "elysia";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";

type IncidentStatusFilter = "OPEN" | "RESOLVED";
type CheckedAtFilter = {
  gte?: Date;
  lte?: Date;
};

export const incidentRoutes = new Elysia({ prefix: "/incidents" })
  .get(
    "/",
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
      const startedAt: CheckedAtFilter = {};
      const from = typeof query.from === "string" ? new Date(query.from) : null;
      const to = typeof query.to === "string" ? new Date(query.to) : null;

      if (from && !Number.isNaN(from.getTime())) {
        startedAt.gte = from;
      }

      if (to && !Number.isNaN(to.getTime())) {
        startedAt.lte = to;
      }

      const where: Prisma.IncidentWhereInput = {
        ...(Object.keys(startedAt).length > 0 ? { startedAt } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.monitorId ? { monitorId: query.monitorId } : {}),
        ...(query.type ? { monitor: { type: query.type as any } } : {}),
      };

      const incidents = await prisma.incident.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
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
          alertRule: {
            select: {
              id: true,
              metric: true,
              operator: true,
              threshold: true,
              severity: true,
              enabled: true,
            },
          },
        },
      });

      const hasMore = incidents.length > limit;
      const items = incidents.slice(0, limit);
      const statusCounts = items.reduce(
        (counts, incident) => {
          counts[incident.status] += 1;
          return counts;
        },
        { OPEN: 0, RESOLVED: 0 } as Record<IncidentStatusFilter, number>,
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
        status: t.Optional(t.Union([t.Literal("OPEN"), t.Literal("RESOLVED")])),
        monitorId: t.Optional(t.String()),
        type: t.Optional(
          t.Union([
            t.Literal("PING"),
            t.Literal("TCP"),
            t.Literal("HTTP"),
            t.Literal("TLS_CERT"),
            t.Literal("DOCKER"),
            t.Literal("DATABASE"),
          ]),
        ),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const existing = await prisma.incident.findUnique({
        where: { id: params.id },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ incident");
      }

      const data: Prisma.IncidentUpdateInput = {
        status: body.status,
        resolvedAt: body.status === "RESOLVED" ? new Date() : null,
      };

      if (body.message !== undefined) {
        data.message = body.message?.trim() || null;
      }

      const incident = await prisma.incident.update({
        where: { id: params.id },
        data,
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
          alertRule: {
            select: {
              id: true,
              metric: true,
              operator: true,
              threshold: true,
              severity: true,
              enabled: true,
            },
          },
        },
      });

      return ok(incident);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        status: t.Union([t.Literal("OPEN"), t.Literal("RESOLVED")]),
        message: t.Optional(t.String()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      const existing = await prisma.incident.findUnique({
        where: { id: params.id },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ incident");
      }

      await prisma.incident.delete({
        where: { id: params.id },
      });

      return ok({ message: "ลบ incident แล้ว" });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
