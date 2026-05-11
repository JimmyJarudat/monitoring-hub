import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { config } from "../config";
import { fail, ok } from "../lib/response";
import prisma from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import {
  validateDomain,
  getDomainInfo,
  getDnsInfo,
  getSubdomainsInfo,
} from "../services/domain.service";

const domainParam = t.Object({ domain: t.String() });

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown";

const saveScanHistory = (data: {
  userId: string;
  domain: string;
  registrar: string | null;
  dnsProvider: string;
  nameserverCount: number;
  subdomainCount: number;
  onlineCount: number;
  durationMs: number;
  scannerIp: string;
}) => {
  prisma.domainScanHistory.create({ data }).catch(() => {});
};

export const domainRoutes = new Elysia({ prefix: "/domain" })
  .use(authMiddleware)
  .use(
    rateLimit({
      max: 30,
      duration: config.rateLimit.global.windowMs,
      errorResponse: JSON.stringify(fail("Domain scan too frequent. Please wait a moment before trying again.")),
      generator: clientIp,
    }),
  )
  // history ต้องอยู่ก่อน /:domain เพื่อไม่ให้ถูก match เป็น domain param
  .get(
    "/history",
    async ({ currentUser, query }) => {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        prisma.domainScanHistory.findMany({
          where: { userId: currentUser.id },
          orderBy: { scannedAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            domain: true,
            registrar: true,
            dnsProvider: true,
            nameserverCount: true,
            subdomainCount: true,
            onlineCount: true,
            durationMs: true,
            scannerIp: true,
            scannedAt: true,
          },
        }),
        prisma.domainScanHistory.count({ where: { userId: currentUser.id } }),
      ]);

      return ok({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:domain",
    async ({ params, set, currentUser, request }) => {
      const domain = params.domain.trim().toLowerCase();
      if (!validateDomain(domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }

      const start = Date.now();
      const result = await getDomainInfo(domain);

      saveScanHistory({
        userId: currentUser.id,
        domain,
        registrar: result.registrar,
        dnsProvider: result.dnsProvider,
        nameserverCount: result.nameservers.length,
        subdomainCount: result.subdomains.length,
        onlineCount: result.subdomains.filter((s) => s.online).length,
        durationMs: Date.now() - start,
        scannerIp: clientIp(request),
      });

      return result;
    },
    { params: domainParam },
  )
  .get(
    "/:domain/dns",
    async ({ params, set }) => {
      const domain = params.domain.trim().toLowerCase();
      if (!validateDomain(domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getDnsInfo(domain);
    },
    { params: domainParam },
  )
  .get(
    "/:domain/subdomains",
    async ({ params, set }) => {
      const domain = params.domain.trim().toLowerCase();
      if (!validateDomain(domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getSubdomainsInfo(domain);
    },
    { params: domainParam },
  );
