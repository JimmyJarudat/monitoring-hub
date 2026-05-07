import type { SubdomainDiscoveryPlugin } from "../types";
import { fetchJson, toSourceResults } from "../utils";

const TIMEOUT_MS = 8000;

interface AlienVaultResponse {
  passive_dns?: Array<{
    hostname?: string;
    address?: string;
    first?: string;
    last?: string;
  }>;
}

export const alienVaultPlugin: SubdomainDiscoveryPlugin = {
  name: "alienvault-otx",
  confidence: 35,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const data = await fetchJson<AlienVaultResponse>(
      `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/passive_dns`,
      TIMEOUT_MS,
    );

    return toSourceResults(
      (data?.passive_dns ?? []).map((record) => ({
        host: record.hostname ?? "",
        ip: record.address,
        firstSeen: record.first,
        lastSeen: record.last,
      })),
      domain,
    );
  },
};
