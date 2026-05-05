import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { rateLimit } from "elysia-rate-limit";
import { authService } from "../services/auth.Service";
import { tokenService } from "../services/token.Service";
import { config } from "../config";
import { ok, fail } from "../lib/response";

export const authController = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret, exp: "15m" }))
  .post(
    "/register",
    async ({ body, jwt, set }) => {
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
        set.status = 401;
        return fail("username/email หรือรหัสผ่านไม่ถูกต้อง");
      }

      // ตรวจ account lockout
      if (await authService.isLockedOut(user.id)) {
        set.status = 423;
        return fail(`บัญชีถูกล็อกชั่วคราว เนื่องจากพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณารอ ${config.lockout.durationMinutes} นาที`);
      }

      const valid = await authService.verifyPassword(body.password, user.password);

      // บันทึก login history
      await authService.recordLogin(user.id, valid ? "SUCCESS" : "FAILED", ipAddress, userAgent);

      if (!valid) {
        set.status = 401;
        return fail("username/email หรือรหัสผ่านไม่ถูกต้อง");
      }

      // revoke token เดิมทั้งหมด — ใช้ได้ทีละ 1 session
      await tokenService.revokeAllByUser(user.id);

      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);
      const { password: _, ...safeUser } = user;

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
    async ({ body }) => {
      await tokenService.revoke(body.refreshToken);
      return ok({ message: "ออกจากระบบแล้ว" });
    },
    {
      body: t.Object({ refreshToken: t.String() }),
    }
  );
