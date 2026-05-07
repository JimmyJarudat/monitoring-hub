import { resolveNs, resolveA, resolveCname, detectDnsProvider } from "../utils/dns";
import { probeHttp, checkSsl } from "../utils/http";
import { discoverSubdomains } from "./domainDiscovery/engine";
import type { DiscoveredSubdomain, DiscoverySource } from "./domainDiscovery/types";
import { fetchJson, runWithConcurrency, validateDomainName } from "./domainDiscovery/utils";

const getNumberEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
};

const MAX_SUBDOMAINS_PROBE = getNumberEnv("DOMAIN_DISCOVERY_MAX_PROBE", 25, 1, 300);
const EXTERNAL_TIMEOUT_MS = 8000;
const SUBDOMAIN_PROBE_CONCURRENCY = getNumberEnv("DOMAIN_DISCOVERY_PROBE_CONCURRENCY", 10, 1, 50);

interface RdapVCardEntry {
  0: string;
  1: Record<string, string>;
  2: string;
  3: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, RdapVCardEntry[]];
}

interface RdapResponse {
  entities?: RdapEntity[];
}

export function validateDomain(domain: string): boolean {
  return validateDomainName(domain);
}

export interface SubdomainInfo {
  host: string;
  source: DiscoverySource[];
  confidenceScore: number;
  firstSeen: string | null;
  lastSeen: string | null;
  online: boolean;
  hasSSL: boolean;
  ip: string | null;
  aRecords: string[];
  cnameRecords: string[];
  sslExpiresAt?: string;
  sslIssuer?: string;
}

export interface DomainInfo {
  success: true;
  domain: string;
  registrar: string | null;
  nameservers: string[];
  dnsProvider: string;
  subdomains: SubdomainInfo[];
}

export interface DnsInfo {
  success: true;
  domain: string;
  nameservers: string[];
  dnsProvider: string;
  aRecords: string[];
}

export interface SubdomainsInfo {
  success: true;
  domain: string;
  subdomains: SubdomainInfo[];
}

export async function lookupRegistrar(domain: string): Promise<string | null> {
  const data = await fetchJson<RdapResponse>(`https://rdap.org/domain/${domain}`, EXTERNAL_TIMEOUT_MS);
  const registrar = data?.entities?.find((entity) => entity.roles?.includes("registrar"));
  if (!registrar?.vcardArray) return null;

  const entries = registrar.vcardArray[1] ?? [];
  const fnEntry = entries.find((entry) => entry[0] === "fn");
  return fnEntry?.[3] ?? null;
}

export async function probeSubdomain(discovered: DiscoveredSubdomain): Promise<SubdomainInfo> {
  const host = discovered.host;
  const [aRecords, cnameRecords, httpsResult, sslResult] = await Promise.all([
    discovered.ips.length > 0 ? Promise.resolve(discovered.ips) : resolveA(host),
    resolveCname(host),
    probeHttp(`https://${host}`),
    checkSsl(host),
  ]);

  let online = httpsResult.online;
  if (!online) {
    const httpResult = await probeHttp(`http://${host}`);
    online = httpResult.online;
  }
  if (!online && aRecords.length > 0) {
    online = true;
  }

  return {
    host,
    source: discovered.source,
    confidenceScore: aRecords.length > 0 ? Math.min(100, discovered.confidenceScore + 20) : discovered.confidenceScore,
    firstSeen: discovered.firstSeen,
    lastSeen: discovered.lastSeen,
    online,
    hasSSL: sslResult.hasSSL,
    ip: aRecords[0] ?? null,
    aRecords,
    cnameRecords,
    ...(sslResult.expiresAt ? { sslExpiresAt: sslResult.expiresAt } : {}),
    ...(sslResult.issuer ? { sslIssuer: sslResult.issuer } : {}),
  };
}

async function probeDiscoveredSubdomains(discoveredSubdomains: DiscoveredSubdomain[]) {
  const hostsToProbe = discoveredSubdomains.slice(0, MAX_SUBDOMAINS_PROBE);
  return (await runWithConcurrency(hostsToProbe, SUBDOMAIN_PROBE_CONCURRENCY, probeSubdomain))
    .filter((result): result is PromiseFulfilledResult<SubdomainInfo> => {
      return result.status === "fulfilled";
    })
    .map((result) => result.value);
}

export async function getDomainInfo(domain: string): Promise<DomainInfo> {
  const [registrar, nameservers, discoveredSubdomains] = await Promise.all([
    lookupRegistrar(domain),
    resolveNs(domain),
    discoverSubdomains(domain),
  ]);

  return {
    success: true,
    domain,
    registrar,
    nameservers,
    dnsProvider: detectDnsProvider(nameservers),
    subdomains: await probeDiscoveredSubdomains(discoveredSubdomains),
  };
}

export async function getDnsInfo(domain: string): Promise<DnsInfo> {
  const [nameservers, aRecords] = await Promise.all([resolveNs(domain), resolveA(domain)]);

  return {
    success: true,
    domain,
    nameservers,
    dnsProvider: detectDnsProvider(nameservers),
    aRecords,
  };
}

export async function getSubdomainsInfo(domain: string): Promise<SubdomainsInfo> {
  const discoveredSubdomains = await discoverSubdomains(domain);

  return {
    success: true,
    domain,
    subdomains: await probeDiscoveredSubdomains(discoveredSubdomains),
  };
}
