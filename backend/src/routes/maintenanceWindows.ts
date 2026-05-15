import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

const payloadSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 160 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  startsAt: t.String(),
  endsAt: t.String(),
  enabled: t.Optional(t.Boolean()),
  monitorId: t.Optional(t.String()),
  groupId: t.Optional(t.String()),
});

const normalizeOptionalText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const parseDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validatePayload = async (body: {
  startsAt: string;
  endsAt: string;
  monitorId?: string;
  groupId?: string;
}) => {
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  const monitorId = normalizeOptionalText(body.monitorId);
  const groupId = normalizeOptionalText(body.groupId);

  if (!startsAt || !endsAt) return { error: "Invalid maintenance window date range." };
  if (startsAt >= endsAt) return { error: "Maintenance window end time must be after start time." };
  if ((monitorId ? 1 : 0) + (groupId ? 1 : 0) !== 1) {
    return { error: "Select exactly one maintenance target: monitor or group." };
  }

  if (monitorId) {
    const monitor = await prisma.monitor.findUnique({ where: { id: monitorId }, select: { id: true } });
    if (!monitor) return { error: "Selected monitor was not found." };
  }

  if (groupId) {
    const group = await prisma.monitorGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) return { error: "Selected group was not found." };
  }

  return { startsAt, endsAt, monitorId, groupId };
};

const includeTarget = {
  monitor: { select: { id: true, name: true, type: true } },
  group: { select: { id: true, name: true, color: true, monitors: { select: { monitorId: true } } } },
};

export const maintenanceWindowRoutes = new Elysia({ prefix: "/maintenance-windows" })
  .use(authMiddleware)
  .get("/", async () => {
    const windows = await prisma.maintenanceWindow.findMany({
      orderBy: [{ startsAt: "desc" }],
      include: includeTarget,
    });

    return ok(
      windows.map((window) => ({
        ...window,
        targetMonitorCount: window.monitorId ? 1 : window.group?.monitors.length ?? 0,
      })),
    );
  })
  .post(
    "/",
    async ({ body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const validated = await validatePayload(body);
      if ("error" in validated) {
        set.status = 400;
        return fail(validated.error);
      }

      const window = await prisma.maintenanceWindow.create({
        data: {
          title: body.title.trim(),
          description: normalizeOptionalText(body.description),
          startsAt: validated.startsAt,
          endsAt: validated.endsAt,
          enabled: body.enabled ?? true,
          monitorId: validated.monitorId,
          groupId: validated.groupId,
        },
        include: includeTarget,
      });

      return ok({ ...window, targetMonitorCount: window.monitorId ? 1 : window.group?.monitors.length ?? 0 });
    },
    { body: payloadSchema },
  )
  .patch(
    "/:id",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.maintenanceWindow.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!existing) {
        set.status = 404;
        return fail("Maintenance window not found.");
      }

      const validated = await validatePayload(body);
      if ("error" in validated) {
        set.status = 400;
        return fail(validated.error);
      }

      const window = await prisma.maintenanceWindow.update({
        where: { id: params.id },
        data: {
          title: body.title.trim(),
          description: normalizeOptionalText(body.description),
          startsAt: validated.startsAt,
          endsAt: validated.endsAt,
          enabled: body.enabled ?? true,
          monitorId: validated.monitorId,
          groupId: validated.groupId,
        },
        include: includeTarget,
      });

      return ok({ ...window, targetMonitorCount: window.monitorId ? 1 : window.group?.monitors.length ?? 0 });
    },
    { params: t.Object({ id: t.String() }), body: payloadSchema },
  )
  .delete(
    "/:id",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.maintenanceWindow.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!existing) {
        set.status = 404;
        return fail("Maintenance window not found.");
      }

      await prisma.maintenanceWindow.delete({ where: { id: params.id } });
      return ok({ message: "Maintenance window deleted successfully." });
    },
    { params: t.Object({ id: t.String() }) },
  );
