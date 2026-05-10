import tls from "node:tls";

export interface TlsConfig {
  host?: string;
  port?: number;
  url?: string;
  timeoutMs?: number;
  warningDays?: number;
  servername?: string;
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const resolveTarget = (config: TlsConfig) => {
  if (typeof config.url === "string" && config.url.trim()) {
    const parsed = new URL(config.url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      servername: config.servername ?? parsed.hostname,
      target: config.url,
    };
  }

  if (typeof config.host === "string" && config.host.trim()) {
    return {
      host: config.host.trim(),
      port: config.port ?? 443,
      servername: config.servername ?? config.host.trim(),
      target: `${config.host.trim()}:${config.port ?? 443}`,
    };
  }

  throw new Error("TLS certificate monitor requires either config.url or config.host to be specified.");
};

export async function tlsCheck(config: TlsConfig): Promise<CheckResult> {
  const timeoutMs = config.timeoutMs ?? 5000;
  const warningDays = config.warningDays ?? 30;
  const start = Date.now();

  try {
    const target = resolveTarget(config);

    return await new Promise<CheckResult>((resolve) => {
      const socket = tls.connect({
        host: target.host,
        port: target.port,
        servername: target.servername,
        rejectUnauthorized: false,
      });

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(timeoutMs, () => {
        cleanup();
        resolve({
          status: "DOWN",
          responseTimeMs: Date.now() - start,
          message: "TLS connection timeout",
        });
      });

      socket.on("error", (error: Error) => {
        cleanup();
        resolve({
          status: "DOWN",
          responseTimeMs: Date.now() - start,
          message: error.message,
        });
      });

      socket.on("secureConnect", () => {
        const certificate = socket.getPeerCertificate();

        if (!certificate || !certificate.valid_to) {
          cleanup();
          resolve({
            status: "DOWN",
            responseTimeMs: Date.now() - start,
            message: "No certificate found from the target endpoint.",
          });
          return;
        }

        const validFrom = new Date(certificate.valid_from);
        const validTo = new Date(certificate.valid_to);
        const daysRemaining = Math.ceil((validTo.getTime() - Date.now()) / DAY_MS);
        const responseTimeMs = Date.now() - start;
        let status: CheckResult["status"] = "UP";
        let message: string | undefined;

        if (daysRemaining <= 0) {
          status = "DOWN";
          message = `Certificate has expired ${Math.abs(daysRemaining)} days ago`;
        } else if (daysRemaining <= warningDays) {
          status = "DEGRADED";
          message = `Certificate will expire in ${daysRemaining} days.`;
        }

        cleanup();
        resolve({
          status,
          responseTimeMs,
          message,
          metadata: {
            target: target.target,
            host: target.host,
            port: target.port,
            servername: target.servername,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            issuer:
              typeof certificate.issuer === "object"
                ? certificate.issuer.O ?? certificate.issuer.CN
                : undefined,
            subject:
              typeof certificate.subject === "object"
                ? certificate.subject.CN ?? certificate.subject.O
                : undefined,
          },
        });
      });
    });
  } catch (error) {
    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: error instanceof Error ? error.message : "TLS check failed",
    };
  }
}
