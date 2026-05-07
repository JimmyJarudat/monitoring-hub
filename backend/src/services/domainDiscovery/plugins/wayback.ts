import type { SubdomainDiscoveryPlugin } from "../types";
import { fetchJson, toSourceResults } from "../utils";

const TIMEOUT_MS = 8000;

export const waybackPlugin: SubdomainDiscoveryPlugin = {
  name: "wayback",
  confidence: 25,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const data = await fetchJson<unknown[]>(
      `https://web.archive.org/cdx?url=*.${encodeURIComponent(domain)}/*&output=json&fl=timestamp,original&collapse=urlkey&limit=500`,
      TIMEOUT_MS,
    );
    if (!Array.isArray(data)) return [];

    return toSourceResults(
      data.slice(1).map((row) => {
        if (!Array.isArray(row)) return { host: "" };
        return {
          host: String(row[1] ?? ""),
          firstSeen: String(row[0] ?? ""),
          lastSeen: String(row[0] ?? ""),
        };
      }),
      domain,
    );
  },
};
