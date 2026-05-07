import Elysia, { t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { config } from "../config";
import { fail } from "../lib/response";
import {
  validateDomain,
  getDomainInfo,
  getDnsInfo,
  getSubdomainsInfo,
} from "../services/domain.service";

const domainParam = t.Object({ domain: t.String() });
const clientIp = (req: Request) => {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown";
};

export const domainRoutes = new Elysia({ prefix: "/domain" })
  .use(
    rateLimit({
      max: 30,
      duration: config.rateLimit.global.windowMs,
      errorResponse: JSON.stringify(fail("สแกน domain บ่อยเกินไป กรุณารอสักครู่")),
      generator: clientIp,
    }),
  )
  .get(
    "/:domain",
    async ({ params, set }) => {
      const domain = params.domain.trim().toLowerCase();
      if (!validateDomain(domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getDomainInfo(domain);
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
