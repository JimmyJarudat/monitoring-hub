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
  jsonPath?: string;
  jsonExpected?: string;
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

// Supports: $.key  $.key.sub  $.key[0]  $.key[0].sub
const resolveJsonPath = (obj: unknown, path: string): unknown => {
  const normalized = path.replace(/^\$\.?/, "");
  if (!normalized) return obj;

  let current: unknown = obj;
  for (const token of normalized.split(".")) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = token.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arr = (current as Record<string, unknown>)[arrayMatch[1]];
      if (!Array.isArray(arr)) return undefined;
      current = arr[parseInt(arrayMatch[2])];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
};

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
      issues.push(`Received HTTP ${res.status}, expected ${expectedStatus}.`);
    }

    let rawBody: string | undefined;
    if (config.expectedBodyText || config.jsonPath) {
      rawBody = await res.text();
    }

    if (config.expectedBodyText && rawBody !== undefined) {
      if (!rawBody.includes(config.expectedBodyText)) {
        issues.push(`Expected text "${config.expectedBodyText}" not found in response body.`);
      }
    }

    if (config.jsonPath && rawBody !== undefined) {
      try {
        const parsed: unknown = JSON.parse(rawBody);
        const value = resolveJsonPath(parsed, config.jsonPath);
        if (value === undefined) {
          issues.push(`JSON path "${config.jsonPath}" not found.`);
        } else if (config.jsonExpected !== undefined && config.jsonExpected !== "") {
          if (String(value) !== String(config.jsonExpected)) {
            issues.push(`"${config.jsonPath} returned "${value}", expected "${config.jsonExpected}"."`);
          }
        }
      } catch {
        issues.push(`Response is not valid JSON.`);
      }
    }

    if (config.expectedHeaderKey) {
      const headerVal = res.headers.get(config.expectedHeaderKey);
      if (!headerVal) {
        issues.push(`Header not found. "${config.expectedHeaderKey}"`);
      } else if (
        config.expectedHeaderValue &&
        !headerVal.toLowerCase().includes(config.expectedHeaderValue.toLowerCase())
      ) {
        issues.push(
          `header "${config.expectedHeaderKey}" returned "${headerVal}" does not match expected "${config.expectedHeaderValue}"`,
        );
      }
    }

    if (config.latencyThresholdMs && responseTimeMs > config.latencyThresholdMs) {
      issues.push(`Too slow: ${config.latencyThresholdMs}ms (returned ${responseTimeMs}ms)`);
    }

    return {
      status: issues.length > 0 ? "DEGRADED" : "UP",
      responseTimeMs,
      message: issues.length > 0 ? issues.join(" | ") : undefined,
      metadata: {
        httpStatus: res.status,
        url: config.url,
        ...(rawBody !== undefined ? { bodySnippet: rawBody.slice(0, 300) } : {}),
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
