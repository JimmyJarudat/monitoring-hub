import Elysia from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { config } from "../config";
import { fail } from "../lib/response";

export const securityMiddleware = new Elysia({ name: "securityMiddleware" })
  // CORS
  .use(
    cors({
      origin: config.cors.origins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )
  // Rate limit ทั่วไป
  .use(
    rateLimit({
      max: config.rateLimit.global.max,
      duration: config.rateLimit.global.windowMs,
      errorResponse: JSON.stringify(fail("คำขอมากเกินไป กรุณารอสักครู่")),
      generator: (req) =>
        req.headers.get("x-forwarded-for") ??
        req.headers.get("cf-connecting-ip") ??
        "unknown",
    })
  )
  // Security headers — global เพื่อให้ครอบทุก route
  .onAfterHandle({ as: "global" }, ({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["X-XSS-Protection"] = "1; mode=block";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    set.headers["Content-Security-Policy"] = "default-src 'self'";
  });
