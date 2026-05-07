import Elysia from "elysia";
import type { Prisma } from "../generated/prisma/client";
import prisma from "../lib/prisma";
import { logger } from "../lib/logger";

const AUDITED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "webhook",
];

type AuditContext = {
  request: Request;
  set?: { status?: number | string };
  body?: unknown;
  params?: Record<string, unknown>;
  currentUser?: {
    id?: string;
    role?: string;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSensitiveKey = (key: string) => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
};

const sanitizeAuditValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item));
  if (!isObject(value)) return String(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : sanitizeAuditValue(item),
    ]),
  ) as Prisma.InputJsonObject;
};

const toEntityName = (segment: string | undefined) => {
  if (!segment) return "System";
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

const resolveAuditTarget = (pathname: string, params: Record<string, unknown> | undefined) => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "admin" && segments[1] === "retention") {
    return { entity: "Retention", entityId: segments[2] ?? null };
  }
  if (segments.includes("alert-rules")) {
    return {
      entity: "AlertRule",
      entityId: typeof params?.ruleId === "string" ? params.ruleId : segments[segments.length - 1] ?? null,
    };
  }
  return {
    entity: toEntityName(segments[0]),
    entityId:
      typeof params?.id === "string"
        ? params.id
        : segments.length > 1
          ? segments[1]
          : null,
  };
};

const resolveAction = (method: string, pathname: string, entity: string) => {
  if (pathname.endsWith("/check")) return "RUN_CHECK";
  if (pathname.includes("/test")) return "TEST_NOTIFICATION_CHANNEL";
  if (pathname.endsWith("/retention/run")) return "RUN_RETENTION_CLEANUP";
  if (pathname.endsWith("/retention/clear")) return "CLEAR_RETENTION_DATA";
  if (method === "POST") return `CREATE_${entity.toUpperCase()}`;
  if (method === "PATCH" || method === "PUT") return `UPDATE_${entity.toUpperCase()}`;
  if (method === "DELETE") return `DELETE_${entity.toUpperCase()}`;
  return `${method}_${entity.toUpperCase()}`;
};

const getStatusCode = (status: number | string | undefined) => {
  if (typeof status === "number") return status;
  if (typeof status === "string") {
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : 200;
  }
  return 200;
};

export const auditMiddleware = new Elysia({ name: "auditMiddleware" }).onAfterHandle(
  { as: "global" },
  async (context) => {
    const ctx = context as AuditContext;
    const method = ctx.request.method.toUpperCase();
    if (!AUDITED_METHODS.has(method)) return;

    const status = getStatusCode(ctx.set?.status);
    if (status >= 400) return;

    const url = new URL(ctx.request.url);
    const pathname = url.pathname;
    const { entity, entityId } = resolveAuditTarget(pathname, ctx.params);
    const action = resolveAction(method, pathname, entity);

    try {
      await prisma.auditLog.create({
        data: {
          userId: ctx.currentUser?.id ?? null,
          action,
          entity,
          entityId,
          ipAddress:
            ctx.request.headers.get("x-forwarded-for") ??
            ctx.request.headers.get("cf-connecting-ip") ??
            null,
          userAgent: ctx.request.headers.get("user-agent"),
          newValue: {
            method,
            path: pathname,
            status,
            params: sanitizeAuditValue(ctx.params ?? {}),
            body: sanitizeAuditValue(ctx.body ?? null),
          } as Prisma.InputJsonObject,
        },
      });
    } catch (error) {
      logger.error("audit", "failed to record audit log", { error: String(error) });
    }
  },
);
