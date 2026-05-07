import dns from "node:dns/promises";

const DEFAULT_DNS_TIMEOUT_MS = 3000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DNS resolve timeout")), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveNs(domain: string): Promise<string[]> {
  try {
    return await withTimeout(dns.resolveNs(domain), DEFAULT_DNS_TIMEOUT_MS);
  } catch {
    return [];
  }
}

export async function resolveA(
  hostname: string,
  timeoutMs = DEFAULT_DNS_TIMEOUT_MS,
): Promise<string[]> {
  try {
    return await withTimeout(dns.resolve4(hostname), timeoutMs);
  } catch {
    return [];
  }
}

export async function resolveHost(
  hostname: string,
  timeoutMs = DEFAULT_DNS_TIMEOUT_MS,
): Promise<string[]> {
  try {
    return await withTimeout(dns.resolve(hostname), timeoutMs);
  } catch {
    return [];
  }
}

export async function resolveCname(
  hostname: string,
  timeoutMs = DEFAULT_DNS_TIMEOUT_MS,
): Promise<string[]> {
  try {
    return await withTimeout(dns.resolveCname(hostname), timeoutMs);
  } catch {
    return [];
  }
}

const DNS_PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/cloudflare/i, "Cloudflare"],
  [/awsdns/i, "AWS Route 53"],
  [/googledomains|google\.com/i, "Google Domains"],
  [/vercel-dns/i, "Vercel"],
  [/digitalocean/i, "DigitalOcean"],
  [/azure-dns/i, "Azure DNS"],
];

export function detectDnsProvider(nameservers: string[]): string {
  const joined = nameservers.join(" ");
  for (const [pattern, name] of DNS_PROVIDER_PATTERNS) {
    if (pattern.test(joined)) return name;
  }
  return "Unknown";
}
