import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

export const alertRuleRoutes = new Elysia({ prefix: "/alert-rules" })
  .use(authMiddleware)
  .get(
    "/",
    async ({ currentUser, query }) => {
      requireAdminRole(currentUser.role);

      const enabled =
        query.enabled === "true" ? true : query.enabled === "false" ? false : undefined;
      const monitorId =
        typeof query.monitorId === "string" && query.monitorId.trim()
          ? query.monitorId.trim()
          : undefined;
      const metric =
        typeof query.metric === "string" && query.metric.trim()
          ? query.metric.trim()
          : undefined;

      const rules = await prisma.alertRule.findMany({
        where: {
          ...(enabled !== undefined ? { enabled } : {}),
          ...(monitorId ? { monitorId } : {}),
          ...(metric ? { metric } : {}),
        },
        orderBy: [{ createdAt: "desc" }],
        include: {
          monitor: {
            select: {
              id: true,
              name: true,
              type: true,
              enabled: true,
            },
          },
          channels: {
            include: {
              channel: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  enabled: true,
                },
              },
            },
          },
          incidents: {
            where: { status: "OPEN" },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              message: true,
              startedAt: true,
            },
          },
        },
      });

      return ok(
        rules.map((rule) => ({
          id: rule.id,
          monitorId: rule.monitorId,
          metric: rule.metric,
          operator: rule.operator,
          threshold: rule.threshold,
          severity: rule.severity,
          enabled: rule.enabled,
          createdAt: rule.createdAt,
          monitor: rule.monitor,
          channels: rule.channels,
          openIncident: rule.incidents[0] ?? null,
        })),
      );
    },
    {
      query: t.Object({
        enabled: t.Optional(t.String()),
        monitorId: t.Optional(t.String()),
        metric: t.Optional(t.String()),
      }),
    },
  );
