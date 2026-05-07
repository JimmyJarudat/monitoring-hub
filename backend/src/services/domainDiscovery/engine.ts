import { subdomainDiscoveryPlugins } from "./registry";
import type {
  DiscoveredSubdomain,
  DiscoveryPluginContext,
  SourceSubdomainResult,
  SubdomainDiscoveryPlugin,
} from "./types";
import {
  earliestTimestamp,
  latestTimestamp,
  parseSeenTimestamp,
  runWithConcurrency,
  withTimeout,
} from "./utils";

const SOURCE_CONCURRENCY = 4;
const getNumberEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
};
const CACHE_TTL_MS = getNumberEnv("DOMAIN_DISCOVERY_CACHE_TTL_MS", 30 * 60 * 1000, 0, 24 * 60 * 60 * 1000);

interface CachedDiscovery {
  expiresAt: number;
  results: DiscoveredSubdomain[];
}

const discoveryCache = new Map<string, CachedDiscovery>();

function mergeDiscoveredSubdomain(
  current: Map<string, DiscoveredSubdomain>,
  next: DiscoveredSubdomain,
) {
  const existing = current.get(next.host);
  if (!existing) {
    current.set(next.host, next);
    return;
  }

  current.set(next.host, {
    host: next.host,
    source: Array.from(new Set([...existing.source, ...next.source])),
    ips: Array.from(new Set([...existing.ips, ...next.ips])),
    confidenceScore: Math.max(existing.confidenceScore, next.confidenceScore),
    firstSeen: earliestTimestamp(existing.firstSeen, next.firstSeen),
    lastSeen: latestTimestamp(existing.lastSeen, next.lastSeen),
  });
}

function mergePluginResults(
  current: Map<string, DiscoveredSubdomain>,
  plugin: SubdomainDiscoveryPlugin,
  results: SourceSubdomainResult[],
) {
  for (const result of results) {
    const existing = current.get(result.host);
    const ips = result.ip ? [result.ip] : [];
    const firstSeen = parseSeenTimestamp(result.firstSeen);
    const lastSeen = parseSeenTimestamp(result.lastSeen);

    if (!existing) {
      current.set(result.host, {
        host: result.host,
        source: [plugin.name],
        ips,
        confidenceScore: plugin.confidence,
        firstSeen: firstSeen ?? lastSeen,
        lastSeen: lastSeen ?? firstSeen,
      });
      continue;
    }

    current.set(result.host, {
      host: result.host,
      source: Array.from(new Set([...existing.source, plugin.name])),
      ips: Array.from(new Set([...existing.ips, ...ips])),
      confidenceScore: Math.min(100, existing.confidenceScore + plugin.confidence),
      firstSeen: earliestTimestamp(existing.firstSeen, firstSeen ?? lastSeen),
      lastSeen: latestTimestamp(existing.lastSeen, lastSeen ?? firstSeen),
    });
  }
}

async function runPlugin(plugin: SubdomainDiscoveryPlugin, domain: string, context: DiscoveryPluginContext) {
  try {
    return {
      plugin,
      results: await withTimeout(plugin.discover(domain, context), plugin.timeoutMs + 1000),
    };
  } catch {
    return { plugin, results: [] };
  }
}

export async function discoverSubdomains(domain: string): Promise<DiscoveredSubdomain[]> {
  const context: DiscoveryPluginContext = { now: new Date() };
  const merged = new Map<string, DiscoveredSubdomain>();
  const cached = discoveryCache.get(domain);

  if (cached && cached.expiresAt > Date.now()) {
    for (const result of cached.results) {
      mergeDiscoveredSubdomain(merged, result);
    }
  }

  const settled = await runWithConcurrency(subdomainDiscoveryPlugins, SOURCE_CONCURRENCY, (plugin) => {
    return runPlugin(plugin, domain, context);
  });

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    mergePluginResults(merged, result.value.plugin, result.value.results);
  }

  const results = [...merged.values()].sort((a, b) => {
    return b.confidenceScore - a.confidenceScore || a.host.localeCompare(b.host);
  });

  if (CACHE_TTL_MS > 0 && results.length > 0) {
    discoveryCache.set(domain, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      results,
    });
  }

  return results;
}
