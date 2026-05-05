export interface TcpConfig {
  host: string;
  port: number;
  timeoutMs?: number;
}

export interface CheckResult {
  status: "UP" | "DOWN";
  responseTimeMs?: number;
  message?: string;
}

export async function tcpCheck(config: TcpConfig): Promise<CheckResult> {
  const timeout = config.timeoutMs ?? 5000;
  const start = Date.now();

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        Bun.connect({
          hostname: config.host,
          port: config.port,
          socket: {
            open(socket) { socket.end(); resolve(); },
            error(_, err) { reject(err); },
            connectError(_, err) { reject(err); },
          },
        }).catch(reject);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout)
      ),
    ]);

    return { status: "UP", responseTimeMs: Date.now() - start };
  } catch (e: any) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e.message };
  }
}
