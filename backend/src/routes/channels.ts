import Elysia, { t } from "elysia";
import { requireAdminRole } from "../lib/authorization";
import prisma from "../lib/prisma";
import { fail, ok } from "../lib/response";
import { authMiddleware } from "../middleware/auth";
import {
  testNotificationChannelDraft,
  testNotificationChannel,
  toDisplayChannelConfig,
  toStoredChannelConfig,
} from "../services/notification.service";

const channelTypeSchema = t.Union([
  t.Literal("LINE"),
  t.Literal("SLACK"),
  t.Literal("DISCORD"),
  t.Literal("EMAIL"),
  t.Literal("TELEGRAM"),
]);

const channelBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  type: channelTypeSchema,
  enabled: t.Optional(t.Boolean()),
  webhookUrl: t.Optional(t.String({ minLength: 1, maxLength: 3000 })),
  botToken: t.Optional(t.String({ minLength: 1, maxLength: 3000 })),
  chatId: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  lineChannelAccessToken: t.Optional(t.String({ minLength: 1, maxLength: 3000 })),
  lineTo: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  emailHost: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  emailPort: t.Optional(t.Numeric({ minimum: 1, maximum: 65535 })),
  emailSecure: t.Optional(t.Boolean()),
  emailUsername: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  emailPassword: t.Optional(t.String({ minLength: 1, maxLength: 3000 })),
  emailFrom: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  emailTo: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
});

export const channelRoutes = new Elysia({ prefix: "/channels" })
  .use(authMiddleware)
  .get("/", async ({ currentUser }) => {
    requireAdminRole(currentUser.role);

    const channels = await prisma.notificationChannel.findMany({
      orderBy: [{ createdAt: "desc" }],
    });

    return ok(
      channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        enabled: channel.enabled,
        createdAt: channel.createdAt,
        config: toDisplayChannelConfig(channel),
      })),
    );
  })
  .post(
    "/",
    async ({ body, currentUser, set }) => {
      requireAdminRole(currentUser.role);

      try {
        const channel = await prisma.notificationChannel.create({
          data: {
            name: body.name.trim(),
            type: body.type,
            enabled: body.enabled ?? true,
            config: toStoredChannelConfig(body.type, {
              webhookUrl: body.webhookUrl,
              botToken: body.botToken,
              chatId: body.chatId,
              lineChannelAccessToken: body.lineChannelAccessToken,
              lineTo: body.lineTo,
              emailHost: body.emailHost,
              emailPort: body.emailPort,
              emailSecure: body.emailSecure,
              emailUsername: body.emailUsername,
              emailPassword: body.emailPassword,
              emailFrom: body.emailFrom,
              emailTo: body.emailTo,
            }),
          },
        });

        return ok({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          enabled: channel.enabled,
          createdAt: channel.createdAt,
          config: toDisplayChannelConfig(channel),
        });
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "สร้าง notification channel ไม่สำเร็จ");
      }
    },
    { body: channelBodySchema },
  )
  .post(
    "/test-draft",
    async ({ body, currentUser, set }) => {
      requireAdminRole(currentUser.role);
      try {
        await testNotificationChannelDraft({
          name: body.name,
          type: body.type,
          configInput: {
            webhookUrl: body.webhookUrl,
            botToken: body.botToken,
            chatId: body.chatId,
            lineChannelAccessToken: body.lineChannelAccessToken,
            lineTo: body.lineTo,
            emailHost: body.emailHost,
            emailPort: body.emailPort,
            emailSecure: body.emailSecure,
            emailUsername: body.emailUsername,
            emailPassword: body.emailPassword,
            emailFrom: body.emailFrom,
            emailTo: body.emailTo,
          },
        });
        return ok({ message: "ส่ง draft test message แล้ว" });
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "ส่ง draft test message ไม่สำเร็จ");
      }
    },
    { body: channelBodySchema },
  )
  .patch(
    "/:id",
    async ({ params, body, currentUser, set }) => {
      requireAdminRole(currentUser.role);
      const existing = await prisma.notificationChannel.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ notification channel");
      }

      const nextType = body.type ?? existing.type;

      try {
        const existingConfig =
          typeof existing.config === "object" && existing.config !== null && !Array.isArray(existing.config)
            ? (existing.config as Record<string, unknown>)
            : {};
        const mergedBotToken =
          body.botToken && body.botToken.trim().length > 0
            ? body.botToken
            : typeof existingConfig.botToken === "string"
              ? existingConfig.botToken
              : undefined;
        const mergedChatId =
          body.chatId && body.chatId.trim().length > 0
            ? body.chatId
            : typeof existingConfig.chatId === "string"
              ? existingConfig.chatId
              : undefined;
        const mergedWebhookUrl =
          body.webhookUrl && body.webhookUrl.trim().length > 0
            ? body.webhookUrl
            : typeof existingConfig.webhookUrl === "string"
              ? existingConfig.webhookUrl
              : undefined;
        const mergedLineChannelAccessToken =
          body.lineChannelAccessToken && body.lineChannelAccessToken.trim().length > 0
            ? body.lineChannelAccessToken
            : typeof existingConfig.channelAccessToken === "string"
              ? existingConfig.channelAccessToken
              : undefined;
        const mergedLineTo =
          body.lineTo && body.lineTo.trim().length > 0
            ? body.lineTo
            : typeof existingConfig.to === "string"
              ? existingConfig.to
              : undefined;
        const mergedEmailHost =
          body.emailHost && body.emailHost.trim().length > 0
            ? body.emailHost
            : typeof existingConfig.host === "string"
              ? existingConfig.host
              : undefined;
        const mergedEmailPort =
          typeof body.emailPort === "number"
            ? body.emailPort
            : typeof existingConfig.port === "number"
              ? existingConfig.port
              : undefined;
        const mergedEmailSecure =
          typeof body.emailSecure === "boolean"
            ? body.emailSecure
            : typeof existingConfig.secure === "boolean"
              ? existingConfig.secure
              : undefined;
        const mergedEmailUsername =
          body.emailUsername && body.emailUsername.trim().length > 0
            ? body.emailUsername
            : typeof existingConfig.username === "string"
              ? existingConfig.username
              : undefined;
        const mergedEmailPassword =
          body.emailPassword && body.emailPassword.trim().length > 0
            ? body.emailPassword
            : typeof existingConfig.password === "string"
              ? existingConfig.password
              : undefined;
        const mergedEmailFrom =
          body.emailFrom && body.emailFrom.trim().length > 0
            ? body.emailFrom
            : typeof existingConfig.from === "string"
              ? existingConfig.from
              : undefined;
        const mergedEmailTo =
          body.emailTo && body.emailTo.trim().length > 0
            ? body.emailTo
            : typeof existingConfig.to === "string"
              ? existingConfig.to
              : undefined;

        const channel = await prisma.notificationChannel.update({
          where: { id: params.id },
          data: {
            name: body.name.trim(),
            type: nextType,
            enabled: body.enabled ?? existing.enabled,
            config: toStoredChannelConfig(nextType, {
              webhookUrl: mergedWebhookUrl,
              botToken: mergedBotToken,
              chatId: mergedChatId,
              lineChannelAccessToken: mergedLineChannelAccessToken,
              lineTo: mergedLineTo,
              emailHost: mergedEmailHost,
              emailPort: mergedEmailPort,
              emailSecure: mergedEmailSecure,
              emailUsername: mergedEmailUsername,
              emailPassword: mergedEmailPassword,
              emailFrom: mergedEmailFrom,
              emailTo: mergedEmailTo,
            }),
          },
        });

        return ok({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          enabled: channel.enabled,
          createdAt: channel.createdAt,
          config: toDisplayChannelConfig(channel),
        });
      } catch (error) {
        set.status = 400;
        return fail(error instanceof Error ? error.message : "อัปเดต notification channel ไม่สำเร็จ");
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: channelBodySchema,
    },
  )
  .post(
    "/:id/test",
    async ({ params, currentUser, set }) => {
      requireAdminRole(currentUser.role);
      try {
        await testNotificationChannel(params.id);
        return ok({ message: "ส่งข้อความทดสอบแล้ว" });
      } catch (error) {
        if (error instanceof Error && error.message === "ไม่พบ notification channel") {
          set.status = 404;
          return fail(error.message);
        }
        set.status = 400;
        return fail(error instanceof Error ? error.message : "ส่งข้อความทดสอบไม่สำเร็จ");
      }
    },
    { params: t.Object({ id: t.String() }) },
  )
  .delete(
    "/:id",
    async ({ params, currentUser, set }) => {
      requireAdminRole(currentUser.role);
      const existing = await prisma.notificationChannel.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return fail("ไม่พบ notification channel");
      }

      await prisma.notificationChannel.delete({ where: { id: params.id } });
      return ok({ message: "ลบ notification channel แล้ว" });
    },
    { params: t.Object({ id: t.String() }) },
  );
