import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { ok, fail } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

const userSelect = {
  id: true,
  username: true,
  email: true,
  role: { select: { id: true, name: true } },
  createdAt: true,
} as const;

export const userRoutes = new Elysia({ prefix: "/admin/users" })
  .use(authMiddleware)
  .get("/", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);

    const users = await prisma.user.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: {
        ...userSelect,
        loginHistory: {
          where: { status: "SUCCESS" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return ok(
      users.map(({ loginHistory, ...user }) => ({
        ...user,
        lastLoginAt: loginHistory[0]?.createdAt ?? null,
      })),
    );
  })
  .get("/roles", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);
    const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
    return ok(roles);
  })
  .post(
    "/",
    async ({ body, currentUser, set }) => {
      requireAdminRole(currentUser.role);

      const dupUsername = await prisma.user.findUnique({ where: { username: body.username } });
      if (dupUsername) {
        set.status = 409;
        return fail("Username นี้ถูกใช้ไปแล้ว");
      }
      const dupEmail = await prisma.user.findUnique({ where: { email: body.email } });
      if (dupEmail) {
        set.status = 409;
        return fail("Email นี้ถูกใช้ไปแล้ว");
      }
      const role = await prisma.role.findUnique({ where: { id: body.roleId } });
      if (!role) {
        set.status = 400;
        return fail("ไม่พบ role ที่เลือก");
      }

      const hashed = await Bun.password.hash(body.password);
      const user = await prisma.user.create({
        data: {
          username: body.username.trim(),
          email: body.email.trim().toLowerCase(),
          password: hashed,
          roleId: body.roleId,
        },
        select: userSelect,
      });

      set.status = 201;
      return ok({ ...user, lastLoginAt: null });
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 80 }),
        email: t.String({ format: "email", maxLength: 255 }),
        password: t.String({ minLength: 8, maxLength: 255 }),
        roleId: t.String(),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, currentUser, set }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.user.findUnique({
        where: { id: params.id },
        include: { role: true },
      });
      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ user");
      }

      if (body.username && body.username !== existing.username) {
        const dup = await prisma.user.findFirst({
          where: { username: body.username, NOT: { id: params.id } },
        });
        if (dup) {
          set.status = 409;
          return fail("Username นี้ถูกใช้ไปแล้ว");
        }
      }

      if (body.email && body.email !== existing.email) {
        const dup = await prisma.user.findFirst({
          where: { email: body.email, NOT: { id: params.id } },
        });
        if (dup) {
          set.status = 409;
          return fail("Email นี้ถูกใช้ไปแล้ว");
        }
      }

      if (body.roleId && body.roleId !== existing.roleId) {
        if (params.id === currentUser.id) {
          set.status = 400;
          return fail("ไม่สามารถเปลี่ยน role ของตัวเองได้");
        }
        if (existing.role.name === "ADMIN") {
          const newRole = await prisma.role.findUnique({ where: { id: body.roleId } });
          if (newRole?.name !== "ADMIN") {
            const adminCount = await prisma.user.count({ where: { role: { name: "ADMIN" } } });
            if (adminCount <= 1) {
              set.status = 400;
              return fail("ไม่สามารถลด role ของ admin คนสุดท้ายได้");
            }
          }
        }
      }

      const user = await prisma.user.update({
        where: { id: params.id },
        data: {
          ...(body.username ? { username: body.username.trim() } : {}),
          ...(body.email ? { email: body.email.trim().toLowerCase() } : {}),
          ...(body.roleId ? { roleId: body.roleId } : {}),
        },
        select: userSelect,
      });

      return ok({ ...user, lastLoginAt: null });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Partial(
        t.Object({
          username: t.String({ minLength: 3, maxLength: 80 }),
          email: t.String({ format: "email", maxLength: 255 }),
          roleId: t.String(),
        }),
      ),
    },
  )
  .post(
    "/:id/reset-password",
    async ({ params, body, currentUser, set }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.user.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ user");
      }

      const hashed = await Bun.password.hash(body.password);
      await prisma.user.update({ where: { id: params.id }, data: { password: hashed } });
      await prisma.refreshToken.deleteMany({ where: { userId: params.id } });

      return ok({ message: "รีเซ็ต password แล้ว session ทั้งหมดถูก revoke" });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ password: t.String({ minLength: 8, maxLength: 255 }) }),
    },
  )
  .delete(
    "/:id",
    async ({ params, currentUser, set }) => {
      requireAdminRole(currentUser.role);

      if (params.id === currentUser.id) {
        set.status = 400;
        return fail("ไม่สามารถลบบัญชีของตัวเองได้");
      }

      const existing = await prisma.user.findUnique({
        where: { id: params.id },
        include: { role: true },
      });
      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ user");
      }

      if (existing.role.name === "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: { name: "ADMIN" } } });
        if (adminCount <= 1) {
          set.status = 400;
          return fail("ไม่สามารถลบ admin คนสุดท้ายได้");
        }
      }

      await prisma.user.delete({ where: { id: params.id } });
      return ok({ message: "ลบ user แล้ว" });
    },
    { params: t.Object({ id: t.String() }) },
  );
