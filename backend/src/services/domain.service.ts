import { resolveNs, resolveA, detectDnsProvider } from "../utils/dns";
import { probeHttp, checkSsl } from "../utils/http";

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const MAX_SUBDOMAINS_PROBE = 30;
const EXTERNAL_TIMEOUT_MS = 8000;

export function validateDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain) && domain.length <= 253;
}

// ---- Types ----

export interface SubdomainInfo {
  host: string;
  online: boolean;
  hasSSL: boolean;
  ip: string | null;
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

// ---- RDAP Registrar Lookup ----

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

export async function lookupRegistrar(domain: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as RdapResponse;
    const registrar = data.entities?.find((e) => e.roles?.includes("registrar"));
    if (!registrar?.vcardArray) return null;

    const entries = registrar.vcardArray[1] ?? [];
    const fnEntry = entries.find((e) => e[0] === "fn");
    return fnEntry?.[3] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- crt.sh Subdomain Discovery ----

interface CrtShEntry {
  name_value: string;
}

export async function discoverSubdomains(domain: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = (await res.json()) as CrtShEntry[];
    const seen = new Set<string>();

    for (const entry of data) {
      for (const name of entry.name_value.split("\n")) {
        const clean = name.trim().toLowerCase();
        if (clean.startsWith("*.")) continue;
        if (clean === domain || clean.endsWith(`.${domain}`)) {
          seen.add(clean);
        }
      }
    }

    return [...seen];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---- Subdomain Probe ----

export async function probeSubdomain(host: string): Promise<SubdomainInfo> {
  const [ips, httpsResult, sslResult] = await Promise.all([
    resolveA(host),
    probeHttp(`https://${host}`),
    checkSsl(host),
  ]);

  let online = httpsResult.online;
  if (!online) {
    const httpResult = await probeHttp(`http://${host}`);
    online = httpResult.online;
  }

  return {
    host,
    online,
    hasSSL: sslResult.hasSSL,
    ip: ips[0] ?? null,
    ...(sslResult.expiresAt ? { sslExpiresAt: sslResult.expiresAt } : {}),
    ...(sslResult.issuer ? { sslIssuer: sslResult.issuer } : {}),
  };
}

// ---- Public Service Functions ----

export async function getDomainInfo(domain: string): Promise<DomainInfo> {
  const [registrar, nameservers, subdomainHosts] = await Promise.all([
    lookupRegistrar(domain),
    resolveNs(domain),
    discoverSubdomains(domain),
  ]);

  const dnsProvider = detectDnsProvider(nameservers);
  const hostsToProbe = subdomainHosts.slice(0, MAX_SUBDOMAINS_PROBE);
  const subdomains = await Promise.all(hostsToProbe.map(probeSubdomain));

  return {
    success: true,
    domain,
    registrar,
    nameservers,
    dnsProvider,
    subdomains,
  };
}

export async function getDnsInfo(domain: string): Promise<DnsInfo> {
  const [nameservers, aRecords] = await Promise.all([
    resolveNs(domain),
    resolveA(domain),
  ]);

  return {
    success: true,
    domain,
    nameservers,
    dnsProvider: detectDnsProvider(nameservers),
    aRecords,
  };
}

export async function getSubdomainsInfo(domain: string): Promise<SubdomainsInfo> {
  const subdomainHosts = await discoverSubdomains(domain);
  const hostsToProbe = subdomainHosts.slice(0, MAX_SUBDOMAINS_PROBE);
  const subdomains = await Promise.all(hostsToProbe.map(probeSubdomain));

  return {
    success: true,
    domain,
    subdomains,
  };
}
