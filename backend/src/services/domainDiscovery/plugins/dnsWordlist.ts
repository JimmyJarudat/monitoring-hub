import { resolveHost } from "../../../utils/dns";
import type { SubdomainDiscoveryPlugin, SourceSubdomainResult } from "../types";
import { runWithConcurrency, toSourceResults } from "../utils";

const getNumberEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
};

const DNS_BRUTEFORCE_CONCURRENCY = getNumberEnv("DOMAIN_DISCOVERY_DNS_CONCURRENCY", 20, 1, 50);
const PLUGIN_TIMEOUT_MS = getNumberEnv("DOMAIN_DISCOVERY_DNS_PLUGIN_TIMEOUT_MS", 30000, 5000, 180000);
const RESOLVE_TIMEOUT_MS = getNumberEnv("DOMAIN_DISCOVERY_DNS_TIMEOUT_MS", 1500, 500, 10000);
const FILTER_WILDCARD_DNS = process.env.DOMAIN_DISCOVERY_FILTER_WILDCARD === "true";

const DEFAULT_DNS_BRUTEFORCE_WORDLIST = [
  "www",
  "www1",
  "www2",
  "app",
  "apps",
  "api",
  "api1",
  "api2",
  "api-dev",
  "api-test",
  "api-staging",
  "api-uat",
  "api-prod",
  "dev",
  "development",
  "test",
  "testing",
  "staging",
  "stage",
  "uat",
  "sit",
  "qa",
  "prod",
  "production",
  "preprod",
  "sandbox",
  "alpha",
  "beta",
  "demo",
  "old",
  "new",
  "backup",
  "bak",
  "bcp",
  "dr",
  "admin",
  "administrator",
  "manage",
  "manager",
  "management",
  "portal",
  "login",
  "signin",
  "account",
  "accounts",
  "auth",
  "sso",
  "id",
  "idp",
  "oauth",
  "secure",
  "intranet",
  "extranet",
  "office",
  "mail",
  "mail1",
  "mail2",
  "webmail",
  "mx",
  "mx1",
  "mx2",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "autodiscover",
  "vpn",
  "vpn1",
  "vpn2",
  "ssl-vpn",
  "remote",
  "rdp",
  "vdi",
  "citrix",
  "ftp",
  "sftp",
  "ssh",
  "gateway",
  "gw",
  "firewall",
  "fw",
  "proxy",
  "lb",
  "loadbalancer",
  "grafana",
  "monitor",
  "monitoring",
  "status",
  "uptime",
  "dashboard",
  "kibana",
  "elastic",
  "elasticsearch",
  "prometheus",
  "alertmanager",
  "zabbix",
  "nagios",
  "loki",
  "erp",
  "crm",
  "scm",
  "wms",
  "pos",
  "sale",
  "sales",
  "finance",
  "accounting",
  "asset",
  "assets-api",
  "booking",
  "bookings",
  "bo",
  "backoffice",
  "branch",
  "branches",
  "campaign",
  "careers",
  "center",
  "centre",
  "content",
  "contract",
  "contracts",
  "corp",
  "corporate",
  "cpanel",
  "dealer",
  "dealers",
  "devops",
  "dms",
  "ebilling",
  "payroll",
  "eoffice",
  "email",
  "employee",
  "employees",
  "event",
  "events",
  "hr",
  "hris",
  "hrm",
  "hcm",
  "job",
  "jobs",
  "member",
  "members",
  "mis",
  "my",
  "myaccount",
  "myprofile",
  "online",
  "order",
  "orders",
  "pms",
  "profile",
  "project",
  "projects",
  "report",
  "reports",
  "request",
  "requests",
  "selfservice",
  "staff",
  "survey",
  "tracking",
  "workflow",
  "cms",
  "cdn",
  "img",
  "image",
  "images",
  "static",
  "assets",
  "upload",
  "uploads",
  "files",
  "file",
  "download",
  "downloads",
  "media",
  "docs",
  "doc",
  "document",
  "documents",
  "git",
  "gitlab",
  "github",
  "bitbucket",
  "jenkins",
  "ci",
  "cd",
  "build",
  "runner",
  "n8n",
  "npm",
  "registry",
  "nexus",
  "harbor",
  "sonarqube",
  "sonar",
  "portainer",
  "portainer1",
  "portainer2",
  "portainer3",
  "docker",
  "rancher",
  "k8s",
  "kubernetes",
  "helpdesk",
  "it-helpdesk",
  "ithelpdesk",
  "support",
  "ticket",
  "tickets",
  "service",
  "servicedesk",
  "blog",
  "portfolio",
  "portfolio1",
  "portfolio2",
  "portfolio-v1",
  "portfolio-v2",
  "ourlove",
  "shop",
  "store",
  "payment",
  "pay",
  "web",
  "m",
  "mobile",
  "wap",
  "news",
  "training",
  "learn",
  "lms",
  "db",
  "database",
  "mysql",
  "postgres",
  "postgresql",
  "mssql",
  "sql",
  "redis",
  "mongo",
  "mongodb",
  "oracle",
  "ldap",
  "ad",
  "radius",
  "dns",
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "cloud",
  "private",
  "public",
  "partner",
  "partners",
  "customer",
  "customers",
  "client",
  "clients",
  "vendor",
  "vendors",
  "api-gateway",
  "apigw",
  "webhook",
  "webhooks",
  "ws",
  "socket",
  "chat",
  "meet",
  "video",
] as const;

const NUMERIC_SUFFIX_BASE_WORDS = [
  "api",
  "app",
  "dev",
  "gitlab",
  "mail",
  "npm",
  "portal",
  "portainer",
  "vpn",
  "web",
  "www",
] as const;

const splitWords = (value: string) => {
  return value
    .split(/[\s,;]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/.test(word));
};

async function readWordlistFromFile(path: string | undefined): Promise<string[]> {
  if (!path) return [];
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return [];
    return splitWords(await file.text());
  } catch {
    return [];
  }
}

async function getWordlist(): Promise<string[]> {
  const extraWords = splitWords(process.env.DOMAIN_DISCOVERY_EXTRA_WORDS ?? "");
  const fileWords = await readWordlistFromFile(process.env.DOMAIN_DISCOVERY_WORDLIST);
  const numericWords = NUMERIC_SUFFIX_BASE_WORDS.flatMap((word) => {
    return Array.from({ length: 5 }, (_, index) => `${word}${index + 1}`);
  });
  return Array.from(new Set([...DEFAULT_DNS_BRUTEFORCE_WORDLIST, ...numericWords, ...extraWords, ...fileWords]));
}

async function getWildcardIps(domain: string): Promise<Set<string>> {
  const randomHost = `codex-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${domain}`;
  const ips = await resolveHost(randomHost, RESOLVE_TIMEOUT_MS);
  return new Set(ips);
}

export const dnsWordlistPlugin: SubdomainDiscoveryPlugin = {
  name: "dns-bruteforce",
  confidence: 60,
  timeoutMs: PLUGIN_TIMEOUT_MS,
  async discover(domain, context) {
    const [wordlist, wildcardIps] = await Promise.all([
      getWordlist(),
      FILTER_WILDCARD_DNS ? getWildcardIps(domain) : Promise.resolve(new Set<string>()),
    ]);
    const settled = await runWithConcurrency(
      wordlist,
      DNS_BRUTEFORCE_CONCURRENCY,
      async (word): Promise<SourceSubdomainResult | null> => {
        const host = `${word}.${domain}`;
        const ips = await resolveHost(host, RESOLVE_TIMEOUT_MS);
        if (ips.length === 0) return null;
        if (wildcardIps.size > 0 && ips.every((ip) => wildcardIps.has(ip))) return null;
        return {
          host,
          ip: ips[0] ?? null,
          firstSeen: context.now.toISOString(),
          lastSeen: context.now.toISOString(),
        };
      },
    );

    return toSourceResults(
      settled
        .filter((result): result is PromiseFulfilledResult<SourceSubdomainResult | null> => {
          return result.status === "fulfilled";
        })
        .map((result) => result.value)
        .filter((result): result is SourceSubdomainResult => result !== null),
      domain,
    );
  },
};
