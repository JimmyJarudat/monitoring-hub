import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

export const serverLogRoutes = new Elysia({ prefix: "/server-logs" })

    .use(authMiddleware)
    .post(
    "/fail2ban/event",
    async ({ body }) => {
        console.log("[fail2ban]", body);
        return ok({ received: true });
    },
    {
        body: t.Object({
            ip: t.String(),
            action: t.Union([t.Literal("ban"), t.Literal("unban")]),
            jail: t.String(),
            timestamp: t.String(),
            failures: t.Number(),
        }),
    },
)