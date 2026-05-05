import Elysia, { t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { authService } from "../services/auth.Service";
import { config } from "../config";

export const authController = new Elysia({ prefix: "/auth" })
  .use(
    jwt({
      name: "jwt",
      secret: config.jwtSecret,
      exp: "7d",
    })
  )
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
      const token = await jwt.sign({ sub: user.id, role: user.role.name });

      return { token, user };
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
      // รับได้ทั้ง username และ email
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

      const token = await jwt.sign({ sub: user.id, role: user.role.name });
      const { password: _, ...safeUser } = user;

      return { token, user: safeUser };
    },
    {
      body: t.Object({
        identifier: t.String({ description: "username or email" }),
        password: t.String(),
      }),
    }
  );
