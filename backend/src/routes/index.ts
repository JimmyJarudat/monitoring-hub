import Elysia from "elysia";
import { authController } from "../controllers/auth.Controller";
import { authProtectedRoutes } from "./auth";
import { authMiddleware } from "../middleware/auth";

// Public routes — ไม่ต้องมี token
export const publicRoutes = new Elysia()
  .get("/health", () => ({ status: "ok" }))
  .use(authController); // /auth/register, /auth/login, /auth/refresh, /auth/logout

// Protected routes — ต้องมี token ทุก route
export const protectedRoutes = new Elysia()
  .use(authMiddleware)
  .use(authProtectedRoutes); // /auth/me
  // เพิ่ม routes อื่นๆ ที่ต้องการ auth ที่นี่
