import * as tls from "node:tls";

export interface ProbeResult {
  online: boolean;
  status?: number;
}

export interface SslResult {
  hasSSL: boolean;
  expiresAt?: string;
  issuer?: string;
}

export async function probeHttp(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    return { online: true, status: res.status };
  } catch {
    return { online: false };
  } finally {
    clearTimeout(timer);
  }
}

export function checkSsl(hostname: string, timeoutMs = 5000): Promise<SslResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ hasSSL: false }), timeoutMs);

    try {
      const socket = tls.connect(
        443,
        hostname,
        { rejectUnauthorized: false, servername: hostname },
        () => {
          clearTimeout(timer);
          try {
            const cert = socket.getPeerCertificate();
            socket.destroy();
            if (!cert?.valid_to) {
              resolve({ hasSSL: false });
              return;
            }
            const issuerObj = cert.issuer as Record<string, string> | undefined;
            resolve({
              hasSSL: true,
              expiresAt: new Date(cert.valid_to).toISOString(),
              issuer: issuerObj?.O ?? issuerObj?.CN,
            });
          } catch {
            resolve({ hasSSL: false });
          }
        },
      );

      socket.on("error", () => {
        clearTimeout(timer);
        resolve({ hasSSL: false });
      });
    } catch {
      clearTimeout(timer);
      resolve({ hasSSL: false });
    }
  });
}
