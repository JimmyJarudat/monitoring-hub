import Elysia, { t } from "elysia";
import { decryptCredentialSecret, encryptCredentialSecret } from "../lib/credentialSecret";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";

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

const normalizeOptionalText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toCredentialResponse = <
  T extends {
    secret: string;
    monitors?: unknown;
  },
>(
  credential: T,
) => ({
  ...credential,
  secret: decryptCredentialSecret(credential.secret),
});

export const credentialRoutes = new Elysia({ prefix: "/credentials" })
  .get("/", async () => {
    const credentials = await prisma.credential.findMany({
      include: {
        monitors: {
          select: {
            id: true,
            name: true,
            type: true,
            enabled: true,
          },
          orderBy: [{ name: "asc" }],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    return ok(
      credentials.map((credential) => ({
        ...toCredentialResponse(credential),
        usageCount: credential.monitors.length,
        monitors: credential.monitors,
      })),
    );
  })
  .post(
    "/",
    async ({ body }) => {
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

      return ok(toCredentialResponse(credential));
    },
    {
      body: credentialPayloadSchema,
    },
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const existing = await prisma.credential.findUnique({
        where: { id: params.id },
        select: { id: true },
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
          secret: encryptCredentialSecret(body.secret),
          notes: normalizeOptionalText(body.notes),
          metadata: body.metadata ?? null,
        },
      });

      return ok(toCredentialResponse(credential));
    },
    {
      params: t.Object({ id: t.String() }),
      body: credentialPayloadSchema,
    },
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      const existing = await prisma.credential.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          monitors: {
            select: {
              id: true,
              name: true,
            },
            orderBy: [{ name: "asc" }],
          },
        },
      });

      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ credential");
      }

      await prisma.credential.delete({
        where: { id: params.id },
      });

      return ok({
        message: "ลบ credential แล้ว",
        detachedMonitorCount: existing.monitors.length,
        detachedMonitors: existing.monitors,
      });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
