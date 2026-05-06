import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import { ok, fail } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import {
  clearRetentionHistory,
  getRetentionConfig,
  saveRetentionConfig,
  getRetentionLastRun,
  getRetentionStats,
  runRetentionCleanup,
} from "../services/retention.service";

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .use(authMiddleware)
  .get("/retention", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);
    const [config, lastRun, stats] = await Promise.all([
      getRetentionConfig(),
      getRetentionLastRun(),
      getRetentionStats(),
    ]);
    return ok({ config, lastRun, stats });
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
        auto_cleanup_enabled: t.Boolean(),
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
  })
  .post(
    "/retention/clear",
    async ({ body, currentUser }) => {
      requireAdminRole(currentUser.role);
      try {
        const config = await getRetentionConfig();
        const summary = await clearRetentionHistory(body, config);
        const stats = await getRetentionStats();
        return ok({ summary, stats });
      } catch (error) {
        return fail("ล้างข้อมูลไม่สำเร็จ: " + String(error));
      }
    },
    {
      body: t.Object({
        targets: t.Array(t.Union([t.Literal("results"), t.Literal("metrics"), t.Literal("audit")]), {
          minItems: 1,
        }),
        mode: t.Union([t.Literal("expired"), t.Literal("all")]),
        olderThanDays: t.Optional(t.Number({ minimum: 1, maximum: 3650 })),
      }),
    },
  });
