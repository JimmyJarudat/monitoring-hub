import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { authService } from "../services/auth.Service";
import { tokenService } from "../services/token.Service";
import { config } from "../config";

export const authController = new Elysia({ prefix: "/auth" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret, exp: "15m" }))
  .post(
    "/register",
    async ({ body, jwt, set }) => {
      const existingUsername = await authService.findByUsernameOrEmail(body.username);
      if (existingUsername) {
        set.status = 409;
        return { success: false, message: "Username นี้ถูกใช้ไปแล้ว" };
      }

      const existingEmail = await authService.findByUsernameOrEmail(body.email);
      if (existingEmail) {
        set.status = 409;
        return { success: false, message: "Email นี้ถูกใช้ไปแล้ว" };
      }

      const user = await authService.createUser(body.username, body.email, body.password);
      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);

      set.status = 201;
      return { success: true, accessToken, refreshToken, user };
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
      if (!user) {
        set.status = 401;
        return { success: false, message: "username/email หรือรหัสผ่านไม่ถูกต้อง" };
      }

      const valid = await authService.verifyPassword(body.password, user.password);
      if (!valid) {
        set.status = 401;
        return { success: false, message: "username/email หรือรหัสผ่านไม่ถูกต้อง" };
      }

      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);
      const { password: _, ...safeUser } = user;

      return { success: true, accessToken, refreshToken, user: safeUser };
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
        return { success: false, message: "Refresh token ไม่ถูกต้องหรือหมดอายุแล้ว" };
      }

      // Token Rotation: revoke เดิม ออก token คู่ใหม่
      await tokenService.revoke(body.refreshToken);
      const accessToken = await jwt.sign({ sub: record.userId, role: record.user.role.name });
      const { token: newRefreshToken } = await tokenService.createRefreshToken(record.userId);

      return { success: true, accessToken, refreshToken: newRefreshToken };
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    }
  )
  .post(
    "/logout",
    async ({ body }) => {
      const record = await tokenService.findValid(body.refreshToken);
      if (!record) {
        // Token ไม่มีอยู่หรือถูก revoke แล้ว ถือว่า logout สำเร็จ
        return { success: true, message: "ออกจากระบบแล้ว" };
      }

      await tokenService.revoke(body.refreshToken);
      return { success: true, message: "ออกจากระบบแล้ว" };
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    }
  );
