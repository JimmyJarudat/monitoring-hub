export interface PingConfig {
  host: string;
  timeoutMs?: number;
}

export interface CheckResult {
  status: "UP" | "DOWN";
  responseTimeMs?: number;
  message?: string;
}

export async function pingCheck(config: PingConfig): Promise<CheckResult> {
  const start = Date.now();
  const timeoutMs =
    typeof config.timeoutMs === "number" && Number.isFinite(config.timeoutMs)
      ? Math.max(1, Math.trunc(config.timeoutMs))
      : 3000;
  const args =
    process.platform === "win32"
      ? ["ping", "-n", "1", "-w", String(timeoutMs), config.host]
      : ["ping", "-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), config.host];

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exit = await proc.exited;
    const responseTimeMs = Date.now() - start;

    if (exit === 0) return { status: "UP", responseTimeMs };
    return { status: "DOWN", responseTimeMs, message: `ping ไม่สำเร็จ (exit ${exit})` };
  } catch (error) {
    return { status: "DOWN", message: error instanceof Error ? error.message : String(error) };
  }
}
