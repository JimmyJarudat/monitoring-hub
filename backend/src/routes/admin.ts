import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import { ok, fail } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import {
  clearRetentionHistory,
  getRetentionConfig,
  saveRetentionConfig,
  getRetentionLastRun,
  getRetentionStats,
  runRetentionCleanup,
} from "../services/retention.service";

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(authMiddleware)
  .get(
    "/audit-logs",
    async ({ query, currentUser }) => {
      requireAdminRole(currentUser.role);

      const requestedPage = Number(query.page ?? 1);
      const requestedLimit = Number(query.limit ?? 50);
      const page = Number.isFinite(requestedPage) ? Math.max(Math.trunc(requestedPage), 1) : 1;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
        : 50;
      const skip = (page - 1) * limit;
      const createdAt: Prisma.DateTimeFilter = {};
      const from = typeof query.from === "string" ? new Date(query.from) : null;
      const to = typeof query.to === "string" ? new Date(query.to) : null;
      const search = typeof query.search === "string" ? query.search.trim() : "";

      if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
      if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;

      const where: Prisma.AuditLogWhereInput = {
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
        ...(query.entity ? { entity: { contains: query.entity, mode: "insensitive" } } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
        ...(search
          ? {
              OR: [
                { action: { contains: search, mode: "insensitive" } },
                { entity: { contains: search, mode: "insensitive" } },
                { entityId: { contains: search, mode: "insensitive" } },
                { ipAddress: { contains: search, mode: "insensitive" } },
                { userAgent: { contains: search, mode: "insensitive" } },
                { user: { username: { contains: search, mode: "insensitive" } } },
                { user: { email: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };

      const [items, total, actionRows, entityRows] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: {
                  select: { name: true },
                },
              },
            },
          },
        }),
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          distinct: ["action"],
          orderBy: { action: "asc" },
          select: { action: true },
          take: 200,
        }),
        prisma.auditLog.findMany({
          distinct: ["entity"],
          orderBy: { entity: "asc" },
          select: { entity: true },
          take: 200,
        }),
      ]);

      return ok({
        items,
        page,
        limit,
        total,
        hasMore: skip + items.length < total,
        filters: {
          actions: actionRows.map((row) => row.action),
          entities: entityRows.map((row) => row.entity),
        },
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        action: t.Optional(t.String()),
        entity: t.Optional(t.String()),
        userId: t.Optional(t.String()),
        search: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    },
  )
  .get("/retention", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);
    const [config, lastRun, stats] = await Promise.all([
      getRetentionConfig(),
      getRetentionLastRun(),
      getRetentionStats(),
    ]);
    return ok({ config, lastRun, stats });
  })
  .patch(
    "/retention",
    async ({ body, currentUser }) => {
      requireAdminRole(currentUser.role);
      await saveRetentionConfig(body);
      return ok({ message: "บันทึกการตั้งค่าสำเร็จ" });
    },
    {
      body: t.Object({
        results_days: t.Number({ minimum: 1, maximum: 365 }),
        metrics_days: t.Number({ minimum: 1, maximum: 365 }),
        audit_days: t.Number({ minimum: 1, maximum: 365 }),
        auto_cleanup_enabled: t.Boolean(),
      }),
    },
  )
  .post("/retention/run", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);
    try {
      const summary = await runRetentionCleanup();
      return ok(summary);
    } catch (error) {
      return fail("Cleanup ล้มเหลว: " + String(error));
    }
  })
  .post(
    "/retention/clear",
    async ({ body, currentUser }) => {
      requireAdminRole(currentUser.role);
      try {
        const config = await getRetentionConfig();
        const summary = await clearRetentionHistory(body, config);
        const stats = await getRetentionStats();
        return ok({ summary, stats });
      } catch (error) {
        return fail("ล้างข้อมูลไม่สำเร็จ: " + String(error));
      }
    },
    {
      body: t.Object({
        targets: t.Array(t.Union([t.Literal("results"), t.Literal("metrics"), t.Literal("audit")]), {
          minItems: 1,
        }),
        mode: t.Union([t.Literal("expired"), t.Literal("all")]),
        olderThanDays: t.Optional(t.Number({ minimum: 1, maximum: 3650 })),
      }),
    },
  );
