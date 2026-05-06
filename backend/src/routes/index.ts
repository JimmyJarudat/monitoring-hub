import Elysia from "elysia";
import { authController } from "../controllers/auth.Controller";
import { authProtectedRoutes } from "./auth";
import { authMiddleware } from "../middleware/auth";
import { auditMiddleware } from "../middleware/audit";
import { monitorRoutes } from "./monitors";
import { incidentRoutes } from "./incidents";
import { groupRoutes } from "./groups";
import { credentialRoutes } from "./credentials";
import { adminRoutes } from "./admin";
import { alertRuleRoutes } from "./alertRules";
import { channelRoutes } from "./channels";
import { ok } from "../lib/response";

// Public routes — ไม่ต้องมี token
export const publicRoutes = new Elysia()
  .get("/health", () => ok({ status: "ok" }))
  .use(authController); // /auth/register, /auth/login, /auth/refresh, /auth/logout

// Protected routes — ต้องมี token ทุก route
export const protectedRoutes = new Elysia()
  .use(authMiddleware)
  .use(auditMiddleware)
  .use(authProtectedRoutes) // /auth/me
  .use(monitorRoutes) // /monitors
  .use(incidentRoutes) // /incidents
  .use(alertRuleRoutes) // /alert-rules
  .use(groupRoutes) // /groups
  .use(credentialRoutes) // /credentials
  .use(channelRoutes) // /channels
  .use(adminRoutes); // /admin
