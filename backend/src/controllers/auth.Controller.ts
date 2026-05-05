import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
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
      body: t.Object({
        username: t.String({ minLength: 3 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 8 }),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }) => {
      const user = await authService.findByUsernameOrEmail(body.identifier);
      if (!user || !(await authService.verifyPassword(body.password, user.password))) {
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

      // Token Rotation: revoke เดิม ออกคู่ใหม่
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
