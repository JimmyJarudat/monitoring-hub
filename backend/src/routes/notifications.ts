import Elysia, { t } from "elysia";
import type { Prisma } from "../generated/prisma/client";
import { ok } from "../lib/response";
import prisma from "../lib/prisma";
import { logger } from "../lib/logger";
import { authMiddleware } from "@/middleware/auth";

const toNotificationDto = (
  row: Prisma.AppNotificationRecipientGetPayload<{
    include: { notification: true };
  }>,
) => ({
  id: row.notification.id,
  recipientId: row.id,
  title: row.notification.title,
  message: row.notification.message,
  type: row.notification.type,
  severity: row.notification.severity,
  href: row.notification.href,
  entity: row.notification.entity,
  entityId: row.notification.entityId,
  metadata: row.notification.metadata,
  createdAt: row.notification.createdAt,
  read: Boolean(row.readAt),
  readAt: row.readAt,
});

const getRecipientWhere = (userId: string, query?: {
  unread?: string;
  type?: string;
  severity?: string;
}) => {
  const notificationWhere: Prisma.AppNotificationWhereInput = {};
  const where: Prisma.AppNotificationRecipientWhereInput = {
    userId,
    dismissedAt: null,
  };

  if (query?.unread === "true") {
    where.readAt = null;
  }

  if (query?.type) {
    notificationWhere.type = query.type as never;
  }

  if (query?.severity) {
    notificationWhere.severity = query.severity as never;
  }

  if (Object.keys(notificationWhere).length > 0) {
    where.notification = notificationWhere;
  }

  return where;
};

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .use(authMiddleware)
  .get("/summary", async ({ currentUser }) => {
    try {
      const where = getRecipientWhere(currentUser.id);
      const [unreadCount, latest] = await Promise.all([
        prisma.appNotificationRecipient.count({
          where: { ...where, readAt: null },
        }),
        prisma.appNotificationRecipient.findMany({
          where,
          include: { notification: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 4,
        }),
      ]);

      return ok({
        unreadCount,
        latest: latest.map(toNotificationDto),
      });
    } catch (error) {
      logger.error("notifications", "summary failed", { error: String(error) });
      return ok({ unreadCount: 0, latest: [] });
    }
  })
  .get(
    "/",
    async ({ currentUser, query }) => {
      const page = Math.max(1, Number(query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
      const skip = (page - 1) * limit;
      const where = getRecipientWhere(currentUser.id, query);

      const [items, total, unreadCount] = await Promise.all([
        prisma.appNotificationRecipient.findMany({
          where,
          include: { notification: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
        prisma.appNotificationRecipient.count({ where }),
        prisma.appNotificationRecipient.count({
          where: {
            userId: currentUser.id,
            dismissedAt: null,
            readAt: null,
          },
        }),
      ]);

      return ok({
        items: items.map(toNotificationDto),
        page,
        limit,
        total,
        unreadCount,
        hasMore: skip + items.length < total,
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        unread: t.Optional(t.String()),
        type: t.Optional(t.String()),
        severity: t.Optional(t.String()),
      }),
    },
  )
  .patch("/:id/read", async ({ currentUser, params }) => {
    await prisma.appNotificationRecipient.updateMany({
      where: {
        userId: currentUser.id,
        notificationId: params.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return ok({ message: "read" });
  })
  .patch("/read-all", async ({ currentUser }) => {
    const result = await prisma.appNotificationRecipient.updateMany({
      where: {
        userId: currentUser.id,
        dismissedAt: null,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return ok({ updated: result.count });
  })
  .patch("/:id/dismiss", async ({ currentUser, params }) => {
    await prisma.appNotificationRecipient.updateMany({
      where: {
        userId: currentUser.id,
        notificationId: params.id,
        dismissedAt: null,
      },
      data: { dismissedAt: new Date(), readAt: new Date() },
    });
    return ok({ message: "hidden" });
  });
