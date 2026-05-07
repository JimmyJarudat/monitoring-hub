import Elysia, { t } from "elysia";
import { fail } from "../lib/response";
import {
  validateDomain,
  getDomainInfo,
  getDnsInfo,
  getSubdomainsInfo,
} from "../services/domain.service";

const domainParam = t.Object({ domain: t.String() });

export const domainRoutes = new Elysia({ prefix: "/domain" })
  .get(
    "/:domain",
    async ({ params, set }) => {
      if (!validateDomain(params.domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getDomainInfo(params.domain);
    },
    { params: domainParam },
  )
  .get(
    "/:domain/dns",
    async ({ params, set }) => {
      if (!validateDomain(params.domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getDnsInfo(params.domain);
    },
    { params: domainParam },
  )
  .get(
    "/:domain/subdomains",
    async ({ params, set }) => {
      if (!validateDomain(params.domain)) {
        set.status = 400;
        return fail("Invalid domain format");
      }
      return getSubdomainsInfo(params.domain);
    },
    { params: domainParam },
  );
