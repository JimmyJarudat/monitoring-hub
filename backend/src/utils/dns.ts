import dns from "node:dns/promises";

export async function resolveNs(domain: string): Promise<string[]> {
  try {
    return await dns.resolveNs(domain);
  } catch {
    return [];
  }
}

export async function resolveA(hostname: string): Promise<string[]> {
  try {
    return await dns.resolve4(hostname);
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
