import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import { decryptCredentialSecret, encryptCredentialSecret } from "../lib/credentialSecret";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";

const credentialTypeSchema = t.Union([
  t.Literal("SNMP_COMMUNITY"),
  t.Literal("USERNAME_PASSWORD"),
  t.Literal("API_TOKEN"),
  t.Literal("SSH_KEY"),
]);

const credentialPayloadSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  type: credentialTypeSchema,
  username: t.Optional(t.String({ maxLength: 255 })),
  secret: t.String({ minLength: 1, maxLength: 5000 }),
  notes: t.Optional(t.String({ maxLength: 1000 })),
  metadata: t.Optional(t.Any()),
});

const credentialPatchSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  type: credentialTypeSchema,
  username: t.Optional(t.String({ maxLength: 255 })),
  secret: t.Optional(t.String({ minLength: 1, maxLength: 5000 })),
  notes: t.Optional(t.String({ maxLength: 1000 })),
  metadata: t.Optional(t.Any()),
});

const normalizeOptionalText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const maskSecret = (encrypted: string) => {
  const plain = decryptCredentialSecret(encrypted);
  if (plain.length <= 6) return "•".repeat(plain.length);
  return `${plain.slice(0, 2)}${"•".repeat(Math.max(plain.length - 4, 4))}${plain.slice(-2)}`;
};

export const credentialRoutes = new Elysia({ prefix: "/credentials" })
  .use(authMiddleware)
  .get("/", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);

    const credentials = await prisma.credential.findMany({
      include: {
        monitors: {
          select: { id: true, name: true, type: true, enabled: true },
          orderBy: [{ name: "asc" }],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return ok(
      credentials.map((c) => ({
        ...c,
        secret: maskSecret(c.secret),
        usageCount: c.monitors.length,
      })),
    );
  })
  .get(
    "/:id/reveal",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const credential = await prisma.credential.findUnique({
        where: { id: params.id },
        select: { id: true, secret: true },
      });

      if (!credential) {
        set.status = 404;
        return fail("ไม่พบ credential");
      }

      return ok({ secret: decryptCredentialSecret(credential.secret) });
    },
    { params: t.Object({ id: t.String() }) },
  )
  .post(
    "/",
    async ({ body, currentUser }) => {
      requireAdminRole(currentUser.role);

      const credential = await prisma.credential.create({
        data: {
          name: body.name.trim(),
          type: body.type,
          username: normalizeOptionalText(body.username),
          secret: encryptCredentialSecret(body.secret),
          notes: normalizeOptionalText(body.notes),
          metadata: body.metadata ?? null,
        },
      });

      return ok({ ...credential, secret: maskSecret(credential.secret) });
    },
    { body: credentialPayloadSchema },
  )
  .patch(
    "/:id",
    async ({ params, body, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.credential.findUnique({
        where: { id: params.id },
        select: { id: true, secret: true },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ credential");
      }

      const credential = await prisma.credential.update({
        where: { id: params.id },
        data: {
          name: body.name.trim(),
          type: body.type,
          username: normalizeOptionalText(body.username),
          secret: body.secret ? encryptCredentialSecret(body.secret) : existing.secret,
          notes: normalizeOptionalText(body.notes),
          metadata: body.metadata ?? null,
        },
      });

      return ok({ ...credential, secret: maskSecret(credential.secret) });
    },
    {
      params: t.Object({ id: t.String() }),
      body: credentialPatchSchema,
    },
  )
  .delete(
    "/:id",
    async ({ params, set, currentUser }) => {
      requireAdminRole(currentUser.role);

      const existing = await prisma.credential.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          monitors: {
            select: { id: true, name: true },
            orderBy: [{ name: "asc" }],
          },
        },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ credential");
      }

      await prisma.credential.delete({ where: { id: params.id } });

      return ok({
        message: "ลบ credential แล้ว",
        detachedMonitorCount: existing.monitors.length,
        detachedMonitors: existing.monitors,
      });
    },
    { params: t.Object({ id: t.String() }) },
  );
