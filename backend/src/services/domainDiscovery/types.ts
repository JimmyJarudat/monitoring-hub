export type DiscoverySource =
  | "crt.sh"
  | "dns-bruteforce"
  | "subfinder"
  | "assetfinder"
  | "securitytrails"
  | "alienvault-otx"
  | "commoncrawl"
  | "wayback";

export interface SourceSubdomainResult {
  host: string;
  ip?: string | null;
  firstSeen?: string | null;
  lastSeen?: string | null;
}

export interface DiscoveredSubdomain {
  host: string;
  source: DiscoverySource[];
  ips: string[];
  confidenceScore: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface DiscoveryPluginContext {
  now: Date;
}

export interface SubdomainDiscoveryPlugin {
  name: DiscoverySource;
  confidence: number;
  timeoutMs: number;
  discover: (domain: string, context: DiscoveryPluginContext) => Promise<SourceSubdomainResult[]>;
}
