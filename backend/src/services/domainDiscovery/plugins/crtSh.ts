import type { SubdomainDiscoveryPlugin } from "../types";
import { fetchJson, toSourceResults } from "../utils";

const TIMEOUT_MS = 12000;

interface CrtShEntry {
  name_value: string;
}

export const crtShPlugin: SubdomainDiscoveryPlugin = {
  name: "crt.sh",
  confidence: 35,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const data = await fetchJson<CrtShEntry[]>(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
      TIMEOUT_MS,
    );
    if (!Array.isArray(data)) return [];
    return toSourceResults(
      data.flatMap((entry) => entry.name_value.split("\n")),
      domain,
    );
  },
};
