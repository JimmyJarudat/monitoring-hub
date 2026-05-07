import type { SubdomainDiscoveryPlugin } from "../types";
import { fetchJson, toSourceResults } from "../utils";

const TIMEOUT_MS = 8000;

interface SecurityTrailsResponse {
  subdomains?: string[];
}

export const securityTrailsPlugin: SubdomainDiscoveryPlugin = {
  name: "securitytrails",
  confidence: 45,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const apiKey = process.env.SECURITYTRAILS_API_KEY;
    if (!apiKey) return [];

    const data = await fetchJson<SecurityTrailsResponse>(
      `https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains`,
      TIMEOUT_MS,
      { Accept: "application/json", APIKEY: apiKey },
    );

    return toSourceResults((data?.subdomains ?? []).map((subdomain) => `${subdomain}.${domain}`), domain);
  },
};
