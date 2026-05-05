import Elysia from "elysia";
import { authController } from "../controllers/auth.Controller";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";

export const authRoutes = new Elysia()
  .use(authController)
  .use(authMiddleware)
  .get("/auth/me", async ({ currentUser }) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return user;
  });
