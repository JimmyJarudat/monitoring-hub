export interface HttpConfig {
  url: string;
  method?: string;
  expectedStatus?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  followRedirect?: boolean;
  authType?: "basic" | "bearer";
  authUsername?: string;
  authPassword?: string;
  authToken?: string;
  expectedBodyText?: string;
  expectedHeaderKey?: string;
  expectedHeaderValue?: string;
  latencyThresholdMs?: number;
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

  const headers: Record<string, string> = { ...(config.headers ?? {}) };

  if (config.authType === "basic" && config.authUsername) {
    const creds = btoa(`${config.authUsername}:${config.authPassword ?? ""}`);
    headers["Authorization"] = `Basic ${creds}`;
  } else if (config.authType === "bearer" && config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  }

  try {
    const res = await Promise.race([
      fetch(config.url, {
        method: config.method ?? "GET",
        headers,
        redirect: config.followRedirect === false ? "manual" : "follow",
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout),
      ),
    ]);

    const responseTimeMs = Date.now() - start;
    const issues: string[] = [];

    if (res.status !== expectedStatus) {
      issues.push(`ได้รับ HTTP ${res.status} คาดว่า ${expectedStatus}`);
    }

    let bodySnippet: string | undefined;
    if (config.expectedBodyText) {
      const bodyText = await res.text();
      bodySnippet = bodyText.slice(0, 300);
      if (!bodyText.includes(config.expectedBodyText)) {
        issues.push(`ไม่พบข้อความ "${config.expectedBodyText}" ใน body`);
      }
    }

    if (config.expectedHeaderKey) {
      const headerVal = res.headers.get(config.expectedHeaderKey);
      if (!headerVal) {
        issues.push(`ไม่พบ header "${config.expectedHeaderKey}"`);
      } else if (
        config.expectedHeaderValue &&
        !headerVal.toLowerCase().includes(config.expectedHeaderValue.toLowerCase())
      ) {
        issues.push(
          `header "${config.expectedHeaderKey}" ได้ "${headerVal}" ไม่ตรงกับ "${config.expectedHeaderValue}"`,
        );
      }
    }

    if (config.latencyThresholdMs && responseTimeMs > config.latencyThresholdMs) {
      issues.push(`ช้าเกิน ${config.latencyThresholdMs}ms (ได้ ${responseTimeMs}ms)`);
    }

    return {
      status: issues.length > 0 ? "DEGRADED" : "UP",
      responseTimeMs,
      message: issues.length > 0 ? issues.join(" | ") : undefined,
      metadata: {
        httpStatus: res.status,
        url: config.url,
        ...(bodySnippet !== undefined ? { bodySnippet } : {}),
      },
    };
  } catch (e: any) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: e.message,
    };
  }
}
