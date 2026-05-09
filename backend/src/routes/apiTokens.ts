import Elysia, { t } from "elysia";
import { randomBytes } from "crypto";
import { authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { ok, fail } from "../lib/response";
import { hashApiToken } from "../lib/apiToken";

const generateToken = (): string => `mh_${randomBytes(20).toString("hex")}`;

const tokenPrefix = (token: string): string => `mh_${token.slice(3, 11)}`;

export const apiTokenRoutes = new Elysia({ prefix: "/api-tokens" })
  .use(authMiddleware)
  .get("/", async ({ currentUser }) => {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return ok(tokens);
  })
  .post(
    "/",
    async ({ currentUser, body }) => {
      const plain = generateToken();
      const token = await prisma.apiToken.create({
        data: {
          userId: currentUser.id,
          name: body.name.trim(),
          tokenHash: hashApiToken(plain),
          prefix: tokenPrefix(plain),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      return ok({
        id: token.id,
        name: token.name,
        prefix: token.prefix,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        token: plain,
      });
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        expiresAt: t.Optional(t.Nullable(t.String())),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ currentUser, params }) => {
      const existing = await prisma.apiToken.findFirst({
        where: { id: params.id, userId: currentUser.id },
      });
      if (!existing) return fail("ไม่พบ API token", 404);
      await prisma.apiToken.delete({ where: { id: params.id } });
      return ok({ message: "ยกเลิก API token แล้ว" });
    },
    { params: t.Object({ id: t.String() }) },
  );
