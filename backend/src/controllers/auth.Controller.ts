import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { rateLimit } from "elysia-rate-limit";
import { createHash, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { authService } from "../services/auth.Service";
import { tokenService } from "../services/token.Service";
import { config } from "../config";
import { ok, fail } from "../lib/response";
import prisma from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { getResolvedEmailConfig } from "../services/systemConfig.service";

const writeAudit = (data: {
  userId: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) => {
  prisma.auditLog
    .create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: "Auth",
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        newValue: (data.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      },
    })
    .catch(() => {});
};

const PASSWORD_RESET_TTL_MS = 10 * 60_000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

const hashPasswordResetCode = (userId: string, code: string) =>
  createHash("sha256").update(`${userId}:${code}:${config.jwtSecret}`).digest("hex");

const getJsonRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const authController = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret, exp: "15m" }))
  .post(
    "/register",
    async ({ body, jwt, set, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip");
      const ua = request.headers.get("user-agent");

      if (await authService.findByUsernameOrEmail(body.username)) {
        set.status = 409;
        return fail("Username นี้ถูกใช้ไปแล้ว");
      }
      if (await authService.findByUsernameOrEmail(body.email)) {
        set.status = 409;
        return fail("Email นี้ถูกใช้ไปแล้ว");
      }

      const user = await authService.createUser(body.username, body.email, body.password);
      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);

      writeAudit({ userId: user.id, action: "REGISTER", ipAddress: ip, userAgent: ua, meta: { username: body.username, email: body.email } });

      set.status = 201;
      return ok({ accessToken, refreshToken, user });
    },
    {
      use: [rateLimit({ max: config.rateLimit.register.max, duration: config.rateLimit.register.windowMs, errorResponse: JSON.stringify(fail("ลงทะเบียนบ่อยเกินไป กรุณารอสักครู่")), generator: (req) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown" })],
      body: t.Object({
        username: t.String({ minLength: 3 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set, request }) => {
      const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("host") ?? undefined;
      const userAgent = request.headers.get("user-agent") ?? undefined;

      const user = await authService.findByUsernameOrEmail(body.identifier);

      if (!user) {
        writeAudit({ userId: null, action: "LOGIN_FAILED", ipAddress, userAgent, meta: { reason: "user_not_found", identifier: body.identifier } });
        set.status = 401;
        return fail("username/email หรือรหัสผ่านไม่ถูกต้อง");
      }

      // ตรวจ account lockout
      if (await authService.isLockedOut(user.id)) {
        writeAudit({ userId: user.id, action: "LOGIN_LOCKED", ipAddress, userAgent });
        set.status = 423;
        return fail(`บัญชีถูกล็อกชั่วคราว เนื่องจากพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณารอ ${config.lockout.durationMinutes} นาที`);
      }

      const valid = await authService.verifyPassword(body.password, user.password);

      // บันทึก login history
      await authService.recordLogin(user.id, valid ? "SUCCESS" : "FAILED", ipAddress, userAgent);

      if (!valid) {
        writeAudit({ userId: user.id, action: "LOGIN_FAILED", ipAddress, userAgent, meta: { reason: "wrong_password" } });
        set.status = 401;
        return fail("username/email หรือรหัสผ่านไม่ถูกต้อง");
      }

      // revoke token เดิมทั้งหมด — ใช้ได้ทีละ 1 session
      await tokenService.revokeAllByUser(user.id);

      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);
      const { password: _, ...safeUser } = user;

      writeAudit({ userId: user.id, action: "LOGIN_SUCCESS", ipAddress, userAgent });

      return ok({ accessToken, refreshToken, user: safeUser });
    },
    {
      use: [rateLimit({ max: config.rateLimit.login.max, duration: config.rateLimit.login.windowMs, errorResponse: JSON.stringify(fail("พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่")), generator: (req) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown" })],
      body: t.Object({
        identifier: t.String({ description: "username หรือ email" }),
        password: t.String(),
      }),
    }
  )
  .post(
    "/password-reset/request",
    async ({ body, request, set }) => {
      const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("host") ?? undefined;
      const userAgent = request.headers.get("user-agent") ?? undefined;
      const identifier = body.email.trim().toLowerCase();
      const emailConfig = await getResolvedEmailConfig();

      if (!emailConfig.host || !emailConfig.port || !emailConfig.username || !emailConfig.password || !emailConfig.from) {
        set.status = 503;
        return fail("ยังไม่ได้ตั้งค่า email สำหรับ reset password");
      }

      const user = await authService.findByUsernameOrEmail(identifier);
      const code = String(randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      writeAudit({
        userId: user?.id ?? null,
        action: "PASSWORD_RESET_REQUESTED",
        ipAddress,
        userAgent,
        meta: {
          identifier,
          matched: Boolean(user),
        },
      });

      if (user) {
        const previousCodes = await prisma.auditLog.findMany({
          where: {
            userId: user.id,
            action: "PASSWORD_RESET_OTP_CREATED",
            entity: "Auth",
            createdAt: { gte: new Date(Date.now() - PASSWORD_RESET_TTL_MS) },
          },
          select: { id: true, newValue: true },
          take: 20,
        });
        await Promise.all(
          previousCodes
            .filter((log) => !getJsonRecord(log.newValue).usedAt)
            .map((log) =>
              prisma.auditLog.update({
                where: { id: log.id },
                data: {
                  newValue: {
                    ...getJsonRecord(log.newValue),
                    usedAt: new Date().toISOString(),
                    revokedReason: "new_code_requested",
                  },
                },
              }),
            ),
        );

        const transporter = nodemailer.createTransport({
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          auth: { user: emailConfig.username, pass: emailConfig.password },
        });

        await transporter.sendMail({
          from: emailConfig.from,
          to: user.email,
          subject: "[Monitoring Hub] Password reset code",
          text: [
            "Your Monitoring Hub password reset code is:",
            "",
            code,
            "",
            "This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.",
          ].join("\n"),
          html: `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
              <h2>Password reset code</h2>
              <p>Use this code to reset your Monitoring Hub password. It expires in 10 minutes.</p>
              <div style="font-size:28px;font-weight:700;letter-spacing:6px;background:#f1f5f9;border-radius:8px;padding:16px 20px;display:inline-block">${code}</div>
              <p style="color:#64748b;font-size:13px">If you did not request a password reset, ignore this email.</p>
            </div>
          `,
        });

        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "PASSWORD_RESET_OTP_CREATED",
            entity: "Auth",
            entityId: user.id,
            ipAddress,
            userAgent,
            newValue: {
              codeHash: hashPasswordResetCode(user.id, code),
              expiresAt: expiresAt.toISOString(),
              usedAt: null,
              attempts: 0,
            },
          },
        });
      }

      return ok({
        message: "ถ้าพบอีเมลนี้ในระบบ เราจะส่งรหัสยืนยันไปให้ รหัสมีอายุ 10 นาที",
      });
    },
    {
      use: [rateLimit({ max: 5, duration: 15 * 60_000, errorResponse: JSON.stringify(fail("ขอรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่")), generator: (req) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown" })],
      body: t.Object({
        email: t.String({ format: "email", maxLength: 255 }),
      }),
    },
  )
  .post(
    "/password-reset/verify",
    async ({ body, set, request }) => {
      const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("host") ?? undefined;
      const userAgent = request.headers.get("user-agent") ?? undefined;
      const now = new Date();
      const email = body.email.trim().toLowerCase();
      const code = body.code.trim();
      const user = await authService.findByUsernameOrEmail(email);

      if (!user) {
        set.status = 400;
        return fail("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว");
      }

      const candidates = await prisma.auditLog.findMany({
        where: {
          action: "PASSWORD_RESET_OTP_CREATED",
          entity: "Auth",
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - PASSWORD_RESET_TTL_MS) },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const validLogs = candidates.filter((log) => {
        const meta = getJsonRecord(log.newValue);
        const attempts = typeof meta.attempts === "number" ? meta.attempts : 0;
        return !meta.usedAt && attempts < PASSWORD_RESET_MAX_ATTEMPTS && typeof meta.expiresAt === "string" && new Date(meta.expiresAt) > now;
      });
      const codeHash = hashPasswordResetCode(user.id, code);
      const tokenLog = validLogs.find((log) => getJsonRecord(log.newValue).codeHash === codeHash);

      if (!tokenLog?.userId) {
        const latest = validLogs[0];
        if (latest) {
          const meta = getJsonRecord(latest.newValue);
          await prisma.auditLog.update({
            where: { id: latest.id },
            data: {
              newValue: {
                ...meta,
                attempts: Math.min((typeof meta.attempts === "number" ? meta.attempts : 0) + 1, PASSWORD_RESET_MAX_ATTEMPTS),
              },
            },
          });
        }

        set.status = 400;
        return fail("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว");
      }

      writeAudit({
        userId: user.id,
        action: "PASSWORD_RESET_OTP_VERIFIED",
        ipAddress,
        userAgent,
        meta: { email },
      });

      return ok({ message: "ยืนยันรหัสสำเร็จ กรุณาตั้งรหัสผ่านใหม่" });
    },
    {
      use: [rateLimit({ max: 10, duration: 15 * 60_000, errorResponse: JSON.stringify(fail("พยายามยืนยันรหัสบ่อยเกินไป กรุณารอสักครู่")), generator: (req) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown" })],
      body: t.Object({
        email: t.String({ format: "email", maxLength: 255 }),
        code: t.String({ minLength: 6, maxLength: 6 }),
      }),
    },
  )
  .post(
    "/password-reset/confirm",
    async ({ body, set, request }) => {
      const ipAddress = request.headers.get("x-forwarded-for") ?? request.headers.get("host") ?? undefined;
      const userAgent = request.headers.get("user-agent") ?? undefined;
      const now = new Date();
      const email = body.email.trim().toLowerCase();
      const code = body.code.trim();
      const user = await authService.findByUsernameOrEmail(email);

      if (!user) {
        set.status = 400;
        return fail("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว");
      }

      const candidates = await prisma.auditLog.findMany({
        where: {
          action: "PASSWORD_RESET_OTP_CREATED",
          entity: "Auth",
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - PASSWORD_RESET_TTL_MS) },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const validLogs = candidates.filter((log) => {
        const meta = getJsonRecord(log.newValue);
        const attempts = typeof meta.attempts === "number" ? meta.attempts : 0;
        return !meta.usedAt && attempts < PASSWORD_RESET_MAX_ATTEMPTS && typeof meta.expiresAt === "string" && new Date(meta.expiresAt) > now;
      });
      const codeHash = hashPasswordResetCode(user.id, code);
      const tokenLog = validLogs.find((log) => getJsonRecord(log.newValue).codeHash === codeHash);

      if (!tokenLog?.userId) {
        const latest = validLogs[0];
        if (latest) {
          const meta = getJsonRecord(latest.newValue);
          await prisma.auditLog.update({
            where: { id: latest.id },
            data: {
              newValue: {
                ...meta,
                attempts: Math.min((typeof meta.attempts === "number" ? meta.attempts : 0) + 1, PASSWORD_RESET_MAX_ATTEMPTS),
              },
            },
          });
        }

        set.status = 400;
        return fail("รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว");
      }

      const hashed = await Bun.password.hash(body.password);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: tokenLog.userId },
          data: { password: hashed },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: tokenLog.userId } }),
        prisma.auditLog.update({
          where: { id: tokenLog.id },
          data: {
            newValue: {
              ...getJsonRecord(tokenLog.newValue),
              usedAt: now.toISOString(),
              attempts: getJsonRecord(tokenLog.newValue).attempts ?? 0,
            },
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: tokenLog.userId,
            action: "PASSWORD_RESET_COMPLETED",
            entity: "Auth",
            entityId: tokenLog.userId,
            ipAddress,
            userAgent,
          },
        }),
      ]);

      return ok({ message: "รีเซ็ตรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" });
    },
    {
      use: [rateLimit({ max: 10, duration: 15 * 60_000, errorResponse: JSON.stringify(fail("พยายามรีเซ็ตรหัสผ่านบ่อยเกินไป กรุณารอสักครู่")), generator: (req) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown" })],
      body: t.Object({
        email: t.String({ format: "email", maxLength: 255 }),
        code: t.String({ minLength: 6, maxLength: 6 }),
        password: t.String({ minLength: 8, maxLength: 255 }),
      }),
    },
  )
  .post(
    "/refresh",
    async ({ body, jwt, set }) => {
      const record = await tokenService.findValid(body.refreshToken);
      if (!record) {
        set.status = 401;
        return fail("Refresh token ไม่ถูกต้องหรือหมดอายุแล้ว");
      }

      await tokenService.revoke(body.refreshToken);
      const accessToken = await jwt.sign({ sub: record.userId, role: record.user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(record.userId);

      return ok({ accessToken, refreshToken });
    },
    {
      body: t.Object({ refreshToken: t.String() }),
    }
  )
  .post(
    "/logout",
    async ({ body, request }) => {
      const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip");
      const ua = request.headers.get("user-agent");

      const record = await prisma.refreshToken.findFirst({
        where: { token: body.refreshToken },
        select: { userId: true },
      });

      await tokenService.revoke(body.refreshToken);

      writeAudit({ userId: record?.userId ?? null, action: "LOGOUT", ipAddress: ip, userAgent: ua });

      return ok({ message: "ออกจากระบบแล้ว" });
    },
    {
      body: t.Object({ refreshToken: t.String() }),
    }
  );
