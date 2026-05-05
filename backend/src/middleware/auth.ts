import Elysia from "elysia";
import { jwt } from "@elysiajs/jwt";
import { decodeJwt } from "jose";
import { config } from "../config";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))
  .derive({ as: "scoped" }, async ({ jwt, headers }) => {
    const authorization = headers["authorization"];
    if (!authorization?.startsWith("Bearer ")) {
      throw new AuthError("กรุณาระบุ Bearer token");
    }

    const token = authorization.slice(7);

    // แยกกรณี: หมดอายุ vs ผิดรูปแบบ/ปลอม
    try {
      const decoded = decodeJwt(token);
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        throw new AuthError("Token หมดอายุแล้ว กรุณา refresh token");
      }
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError("Token ไม่ถูกต้อง");
    }

    // ตรวจ signature ด้วย secret — กันปลอม
    const payload = await jwt.verify(token);
    if (!payload) {
      throw new AuthError("Token ไม่ถูกต้อง (signature ผิดพลาด)");
    }

    return {
      currentUser: {
        id: payload.sub as string,
        role: payload.role as string,
      },
    };
  });
