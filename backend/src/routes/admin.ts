import Elysia, { t } from "elysia";
import { ok, fail } from "../lib/response";
import { authMiddleware, AuthError } from "../middleware/auth";
import {
  getRetentionConfig,
  saveRetentionConfig,
  getRetentionLastRun,
  runRetentionCleanup,
} from "../services/retention.service";

const requireAdmin = (role: string) => {
  if (role.toLowerCase() !== "admin") {
    throw new AuthError("เฉพาะ Admin เท่านั้น", 403);
  }
};

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(authMiddleware)
  .get("/retention", async ({ currentUser }) => {
    requireAdmin(currentUser.role);
    const [config, lastRun] = await Promise.all([getRetentionConfig(), getRetentionLastRun()]);
    return ok({ config, lastRun });
  })
  .patch(
    "/retention",
    async ({ body, currentUser }) => {
      requireAdmin(currentUser.role);
      await saveRetentionConfig(body);
      return ok({ message: "บันทึกการตั้งค่าสำเร็จ" });
    },
    {
      body: t.Object({
        results_days: t.Number({ minimum: 1, maximum: 365 }),
        metrics_days: t.Number({ minimum: 1, maximum: 365 }),
        audit_days: t.Number({ minimum: 1, maximum: 365 }),
      }),
    },
  )
  .post("/retention/run", async ({ currentUser }) => {
    requireAdmin(currentUser.role);
    try {
      const summary = await runRetentionCleanup();
      return ok(summary);
    } catch (error) {
      return fail("Cleanup ล้มเหลว: " + String(error));
    }
  });
