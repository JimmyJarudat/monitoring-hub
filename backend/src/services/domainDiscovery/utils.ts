import type { SourceSubdomainResult } from "./types";

const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function validateDomainName(domain: string): boolean {
  return DOMAIN_REGEX.test(domain) && domain.length <= 253;
}

export function normalizeHost(candidate: string, domain: string): string | null {
  const withoutProtocol = candidate.trim().toLowerCase().replace(/^https?:\/\//, "");
  const host = withoutProtocol.split(/[/?#:]/)[0]?.replace(/^\*\./, "").replace(/\.$/, "");
  if (!host || host === domain || !host.endsWith(`.${domain}`)) return null;
  if (!validateDomainName(host)) return null;
  return host;
}

export function parseSeenTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{14}$/.test(value)) {
    const parsed = new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}.000Z`,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function earliestTimestamp(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next) return current;
  return new Date(next).getTime() < new Date(current).getTime() ? next : current;
}

export function latestTimestamp(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const [settled] = await Promise.allSettled([worker(items[currentIndex])]);
      results[currentIndex] = settled;
    }
  });

  await Promise.allSettled(runners);
  return results;
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Plugin timeout")), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  timeoutMs: number,
  headers: HeadersInit = { Accept: "application/json" },
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(
  url: string,
  timeoutMs: number,
  headers: HeadersInit = { Accept: "text/plain" },
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runCliTool(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<string[]> {
  let process: ReturnType<typeof Bun.spawn> | null = null;
  const timer = setTimeout(() => {
    try {
      process?.kill();
    } catch {
      // external tool failures are ignored by design
    }
  }, timeoutMs);

  try {
    process = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const stdout = process.stdout;
    if (!stdout || typeof stdout === "number") return [];
    const output = await new Response(stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) return [];
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function toSourceResults(
  values: Array<string | SourceSubdomainResult>,
  domain: string,
): SourceSubdomainResult[] {
  const seen = new Map<string, SourceSubdomainResult>();

  for (const value of values) {
    const host = normalizeHost(typeof value === "string" ? value : value.host, domain);
    if (!host) continue;

    const existing = seen.get(host);
    const firstSeen = typeof value === "string" ? null : parseSeenTimestamp(value.firstSeen);
    const lastSeen = typeof value === "string" ? null : parseSeenTimestamp(value.lastSeen);

    seen.set(host, {
      host,
      ip: existing?.ip ?? (typeof value === "string" ? null : value.ip),
      firstSeen: earliestTimestamp(existing?.firstSeen ?? null, firstSeen ?? lastSeen),
      lastSeen: latestTimestamp(existing?.lastSeen ?? null, lastSeen ?? firstSeen),
    });
  }

  return [...seen.values()];
}
