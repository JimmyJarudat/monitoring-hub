export interface PingConfig {
  host: string;
}

export interface CheckResult {
  status: "UP" | "DOWN";
  responseTimeMs?: number;
  message?: string;
}

export async function pingCheck(config: PingConfig): Promise<CheckResult> {
  const start = Date.now();
  try {
    const proc = Bun.spawn(["ping", "-c", "1", "-W", "3", config.host], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exit = await proc.exited;
    const responseTimeMs = Date.now() - start;

    if (exit === 0) return { status: "UP", responseTimeMs };
    return { status: "DOWN", responseTimeMs, message: `ping ไม่สำเร็จ (exit ${exit})` };
  } catch (e: any) {
    return { status: "DOWN", message: e.message };
  }
}
