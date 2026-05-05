export interface HttpConfig {
  url: string;
  method?: string;
  expectedStatus?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export async function httpCheck(config: HttpConfig): Promise<CheckResult> {
  const timeout = config.timeoutMs ?? 10000;
  const expectedStatus = config.expectedStatus ?? 200;
  const start = Date.now();

  try {
    const res = await Promise.race([
      fetch(config.url, {
        method: config.method ?? "GET",
        headers: config.headers,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout)
      ),
    ]);

    const responseTimeMs = Date.now() - start;
    const ok = res.status === expectedStatus;

    return {
      status: ok ? "UP" : "DEGRADED",
      responseTimeMs,
      message: ok ? undefined : `ได้รับ HTTP ${res.status} คาดว่า ${expectedStatus}`,
      metadata: { httpStatus: res.status, url: config.url },
    };
  } catch (e: any) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: e.message,
    };
  }
}
