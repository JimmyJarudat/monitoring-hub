import type { SubdomainDiscoveryPlugin } from "../types";
import { runCliTool, toSourceResults } from "../utils";

const TIMEOUT_MS = 15000;

export const subfinderPlugin: SubdomainDiscoveryPlugin = {
  name: "subfinder",
  confidence: 45,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const hosts = await runCliTool("subfinder", ["-silent", "-d", domain], TIMEOUT_MS);
    return toSourceResults(hosts, domain);
  },
};

export const assetfinderPlugin: SubdomainDiscoveryPlugin = {
  name: "assetfinder",
  confidence: 35,
  timeoutMs: TIMEOUT_MS,
  async discover(domain) {
    const hosts = await runCliTool("assetfinder", ["--subs-only", domain], TIMEOUT_MS);
    return toSourceResults(hosts, domain);
  },
};
