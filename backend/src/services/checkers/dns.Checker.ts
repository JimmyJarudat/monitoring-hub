import { Resolver } from "node:dns/promises";

type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "NS" | "TXT";

export interface DnsConfig {
  host: string;
  recordType?: DnsRecordType;
  expectedValue?: string;
  server?: string;
  timeoutMs?: number;
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

const normalizeRecordType = (value?: string): DnsRecordType => {
  const upper = value?.toUpperCase();

  if (upper === "AAAA" || upper === "CNAME" || upper === "MX" || upper === "NS" || upper === "TXT") {
    return upper;
  }

  return "A";
};

const flattenAnswers = (recordType: DnsRecordType, answers: unknown[]) => {
  switch (recordType) {
    case "MX":
      return answers
        .map((answer) => {
          if (
            typeof answer === "object" &&
            answer !== null &&
            "exchange" in answer &&
            typeof answer.exchange === "string"
          ) {
            return `${answer.exchange}:${"priority" in answer ? answer.priority : ""}`.replace(/:$/, "");
          }

          return String(answer);
        })
        .filter(Boolean);
    case "TXT":
      return answers
        .map((answer) => {
          if (Array.isArray(answer)) {
            return answer.join("");
          }

          return String(answer);
        })
        .filter(Boolean);
    default:
      return answers.map((answer) => {
        if (typeof answer === "string") return answer;
        if (typeof answer === "object" && answer !== null) {
          if ("address" in answer && typeof answer.address === "string") return answer.address;
          if ("value" in answer && typeof answer.value === "string") return answer.value;
        }

        return String(answer);
      });
  }
};

export async function dnsCheck(config: DnsConfig): Promise<CheckResult> {
  const timeout = config.timeoutMs ?? 5000;
  const host = config.host.trim();
  const recordType = normalizeRecordType(config.recordType);
  const expectedValue = config.expectedValue?.trim().toLowerCase();
  const resolver = new Resolver();
  const startedAt = Date.now();

  if (config.server?.trim()) {
    resolver.setServers([config.server.trim()]);
  }

  try {
    const rawAnswers = await Promise.race([
      resolver.resolve(host, recordType),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), timeout);
      }),
    ]);
    const responseTimeMs = Date.now() - startedAt;
    // Bun may return a single object instead of an array (Node.js spec returns array)
    const answers = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];
    const flattenedAnswers = flattenAnswers(recordType, answers);

    if (flattenedAnswers.length === 0) {
      return {
        status: "DOWN",
        responseTimeMs,
        message: `ไม่พบ ${recordType} record สำหรับ ${host}`,
        metadata: {
          host,
          recordType,
          answers: flattenedAnswers,
        },
      };
    }

    if (expectedValue) {
      const matched = flattenedAnswers.some((answer) => answer.toLowerCase().includes(expectedValue));

      if (!matched) {
        return {
          status: "DEGRADED",
          responseTimeMs,
          message: `resolve ได้ แต่ไม่พบค่าที่คาดไว้: ${config.expectedValue}`,
          metadata: {
            host,
            recordType,
            expectedValue: config.expectedValue,
            answers: flattenedAnswers,
          },
        };
      }
    }

    return {
      status: "UP",
      responseTimeMs,
      metadata: {
        host,
        recordType,
        expectedValue: config.expectedValue,
        answers: flattenedAnswers,
        server: config.server,
      },
    };
  } catch (error) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "DNS resolve failed",
      metadata: {
        host,
        recordType,
        expectedValue: config.expectedValue,
        server: config.server,
      },
    };
  }
}
