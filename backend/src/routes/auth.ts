import Elysia from "elysia";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";

export const authProtectedRoutes = new Elysia()
  .use(authMiddleware)
  .get("/auth/me", async ({ currentUser }) => {
    return prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: { select: { name: true } },
        createdAt: true,
      },
    });
  });
