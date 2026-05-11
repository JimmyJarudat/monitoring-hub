import Elysia, { t } from "elysia";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { ok, fail } from "../lib/response";
import { getSystemConfig } from "../services/systemConfig.service";
import { validatePasswordPolicy } from "../services/passwordPolicy.service";

export const authProtectedRoutes = new Elysia()
  .use(authMiddleware)
  .get("/system-config", async () => {
    return ok(await getSystemConfig());
  })
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
  )
  .patch(
    "/auth/profile",
    async ({ body, currentUser, set }) => {
      const existing = await prisma.user.findUnique({ where: { id: currentUser.id } });
      if (!existing) { set.status = 404; return fail("User not found"); }

      if (body.username && body.username !== existing.username) {
        const dup = await prisma.user.findFirst({
          where: { username: body.username, NOT: { id: currentUser.id } },
        });
        if (dup) {
          set.status = 409;
          return fail("Username is already in use");
        }
      }

      if (body.email && body.email !== existing.email) {
        const dup = await prisma.user.findFirst({
          where: { email: body.email, NOT: { id: currentUser.id } },
        });
        if (dup) {
          set.status = 409;
          return fail("Email is already in use");
        }
      }

      const user = await prisma.user.update({
        where: { id: currentUser.id },
        data: {
          ...(body.username ? { username: body.username.trim() } : {}),
          ...(body.email ? { email: body.email.trim().toLowerCase() } : {}),
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: { select: { name: true } },
          createdAt: true,
        },
      });

      return ok(user);
    },
    {
      body: t.Partial(
        t.Object({
          username: t.String({ minLength: 3, maxLength: 80 }),
          email: t.String({ format: "email", maxLength: 255 }),
        }),
      ),
    },
  )
  .post(
    "/auth/change-password",
    async ({ body, currentUser, set }) => {
      const existing = await prisma.user.findUnique({ where: { id: currentUser.id } });
      if (!existing) {
        set.status = 404;
        return fail("User not found");
      }

      const valid = await Bun.password.verify(body.currentPassword, existing.password);
      if (!valid) {
        set.status = 400;
        return fail("Current password is incorrect.");
      }
      const policyError = await validatePasswordPolicy(body.newPassword);
      if (policyError) {
        set.status = 400;
        return fail(policyError);
      }

      const hashed = await Bun.password.hash(body.newPassword);
      await prisma.user.update({ where: { id: currentUser.id }, data: { password: hashed } });
      await prisma.refreshToken.deleteMany({ where: { userId: currentUser.id } });

      return ok({ message: "Password changed successfully. Please sign in again." });
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 1, maxLength: 255 }),
      }),
    },
  );
