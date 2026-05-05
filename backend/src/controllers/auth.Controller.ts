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
        return { message: "Username already taken" };
      }

      const existingEmail = await authService.findByUsernameOrEmail(body.email);
      if (existingEmail) {
        set.status = 409;
        return { message: "Email already in use" };
      }

      const user = await authService.createUser(body.username, body.email, body.password);
      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);

      return { accessToken, refreshToken, user };
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
        return { message: "Invalid credentials" };
      }

      const valid = await authService.verifyPassword(body.password, user.password);
      if (!valid) {
        set.status = 401;
        return { message: "Invalid credentials" };
      }

      const accessToken = await jwt.sign({ sub: user.id, role: user.role.name });
      const { token: refreshToken } = await tokenService.createRefreshToken(user.id);
      const { password: _, ...safeUser } = user;

      return { accessToken, refreshToken, user: safeUser };
    },
    {
      body: t.Object({
        identifier: t.String({ description: "username or email" }),
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
        return { message: "Invalid or expired refresh token" };
      }

      // rotate: revoke เดิม ออกใหม่
      await tokenService.revoke(body.refreshToken);
      const accessToken = await jwt.sign({ sub: record.userId, role: record.user.role.name });
      const { token: newRefreshToken } = await tokenService.createRefreshToken(record.userId);

      return { accessToken, refreshToken: newRefreshToken };
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    }
  )
  .post(
    "/logout",
    async ({ body, set }) => {
      await tokenService.revoke(body.refreshToken);
      set.status = 204;
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    }
  );
