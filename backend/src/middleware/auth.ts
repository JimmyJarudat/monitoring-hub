import Elysia from "elysia";
import { jwt } from "@elysiajs/jwt";
import { decodeJwt } from "jose";
import { config } from "../config";
import prisma from "../lib/prisma";
import { hashApiToken } from "../lib/apiToken";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const METHOD_COLOR: Record<string, string> = {
  GET:    "\x1b[32m",
  POST:   "\x1b[34m",
  PATCH:  "\x1b[33m",
  PUT:    "\x1b[33m",
  DELETE: "\x1b[31m",
};

const STATUS_COLOR = (status: number) => {
  if (status < 300) return "\x1b[32m";
  if (status < 400) return "\x1b[36m";
  if (status < 500) return "\x1b[33m";
  return "\x1b[31m";
};

const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";
const BOLD  = "\x1b[1m";

const formatLog = (method: string, path: string, user: string, status: number) => {
  const mc   = METHOD_COLOR[method] ?? "\x1b[37m";
  const sc   = STATUS_COLOR(status);
  const m    = `${mc}${BOLD}${method.padEnd(6)}${RESET}`;
  const p    = `${BOLD}${path}${RESET}`;
  const u    = `${DIM}${user}${RESET}`;
  const s    = `${sc}${BOLD}${status}${RESET}`;
  const time = `${DIM}${new Date().toTimeString().slice(0, 8)}${RESET}`;
  return `${time}  ${m}  ${p}  ${u}  ${s}`;
};

const resolveUser = (reqInfo?: { username?: string; userId?: string }) => {
  if (reqInfo?.username && reqInfo?.userId) return `${reqInfo.username} ${DIM}(${reqInfo.userId})${RESET}`;
  return reqInfo?.username ?? reqInfo?.userId ?? "guest";
};

export const authMiddleware = new Elysia({ name: "authMiddleware" })
  .use(jwt({ name: "jwt", secret: config.jwtSecret }))
  .derive({ as: "scoped" }, async ({ jwt, headers, request }) => {
    const authorization = headers["authorization"];
    if (!authorization?.startsWith("Bearer ")) {
      throw new AuthError("กรุณาระบุ Bearer token");
    }

    const token = authorization.slice(7);

    if (token.startsWith("mh_")) {
      const hash = hashApiToken(token);
      const apiToken = await prisma.apiToken.findUnique({
        where: { tokenHash: hash },
        include: { user: { select: { id: true, username: true, role: { select: { name: true } } } } },
      });
      if (!apiToken) throw new AuthError("API token ไม่ถูกต้อง");
      if (apiToken.expiresAt && apiToken.expiresAt < new Date()) throw new AuthError("API token หมดอายุแล้ว");
      void prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return {
        currentUser: { id: apiToken.user.id, role: apiToken.user.role.name },
        _reqInfo: {
          method: request.method,
          path: new URL(request.url).pathname,
          username: apiToken.user.username,
          userId: apiToken.user.id,
        },
      };
    }

    let userId: string | undefined;

    try {
      const decoded = decodeJwt(token);
      userId = decoded.sub as string | undefined;
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        throw new AuthError("Token หมดอายุแล้ว กรุณา refresh token");
      }
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError("Token ไม่ถูกต้อง");
    }

    let payload: Awaited<ReturnType<typeof jwt.verify>>;
    try {
      payload = await jwt.verify(token);
    } catch {
      throw new AuthError("Token ไม่ถูกต้อง (signature ผิดพลาด)");
    }

    if (!payload) {
      throw new AuthError("Token ไม่ถูกต้อง (signature ผิดพลาด)");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
      select: { id: true, username: true, role: { select: { name: true } } },
    });

    if (!user) throw new AuthError("ไม่พบผู้ใช้");

    return {
      currentUser: { id: user.id, role: user.role.name },
      _reqInfo: {
        method: request.method,
        path: new URL(request.url).pathname,
        username: user.username,
        userId: user.id,
      },
    };
  })
  .onAfterHandle({ as: "scoped" }, ({ _reqInfo, set }) => {
    const status = typeof set.status === "number" ? set.status : 200;
    console.log(formatLog(_reqInfo.method, _reqInfo.path, resolveUser(_reqInfo), status));
  })
  .onError({ as: "scoped" }, ({ _reqInfo, set, request }) => {
    const status = typeof set.status === "number" ? set.status : 500;
    const method = _reqInfo?.method ?? request.method;
    const path   = _reqInfo?.path ?? new URL(request.url).pathname;
    console.log(formatLog(method, path, resolveUser(_reqInfo), status));
  });