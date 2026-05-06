import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import { ok, fail } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import {
  getRetentionConfig,
  saveRetentionConfig,
  getRetentionLastRun,
  runRetentionCleanup,
} from "../services/retention.service";

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(authMiddleware)
  .get("/retention", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);
    const [config, lastRun] = await Promise.all([getRetentionConfig(), getRetentionLastRun()]);
    return ok({ config, lastRun });
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
  });
