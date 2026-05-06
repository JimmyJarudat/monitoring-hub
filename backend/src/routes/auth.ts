import Elysia, { t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { ok } from "../lib/response";

export const authProtectedRoutes = new Elysia()
  .use(authMiddleware)
  .get("/auth/me", async ({ currentUser }) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: { select: { name: true } },
        createdAt: true,
      },
    });
    return ok(user);
  })
  .get(
    "/auth/login-history",
    async ({ currentUser, query }) => {
      const requestedPage = Number(query.page ?? 1);
      const requestedLimit = Number(query.limit ?? 30);
      const page = Number.isFinite(requestedPage) ? Math.max(Math.trunc(requestedPage), 1) : 1;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
        : 30;
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        prisma.loginHistory.findMany({
          where: { userId: currentUser.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
          select: {
            id: true,
            status: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
          },
        }),
        prisma.loginHistory.count({ where: { userId: currentUser.id } }),
      ]);

      return ok({
        items,
        page,
        limit,
        total,
        hasMore: skip + items.length < total,
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    },
  );
