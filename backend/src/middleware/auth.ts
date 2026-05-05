import Elysia from "elysia";
import { jwt } from "@elysiajs/jwt";
import { config } from "../config";

export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))
  .derive({ as: "scoped" }, async ({ jwt, headers, set }) => {
    const authorization = headers["authorization"];
    if (!authorization?.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Unauthorized");
    }

    const token = authorization.slice(7);
    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      throw new Error("Invalid token");
    }

    return {
      currentUser: {
        id: payload.sub as string,
        role: payload.role as string,
      },
    };
  });
