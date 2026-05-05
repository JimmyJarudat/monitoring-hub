export interface DockerConfig {
  portainerUrl: string;  // http://portainer:9000
  apiKey: string;        // Portainer API key
  endpointId: number;    // Portainer endpoint ID
  containerId?: string;  // ถ้าไม่ระบุ = เช็ค endpoint ภาพรวม
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export async function dockerCheck(config: DockerConfig): Promise<CheckResult> {
  const start = Date.now();
  const headers = { "X-API-Key": config.apiKey };

  try {
    if (config.containerId) {
      // ตรวจ container เดี่ยว
      const res = await fetch(
        `${config.portainerUrl}/api/endpoints/${config.endpointId}/docker/containers/${config.containerId}/json`,
        { headers }
      );
      if (!res.ok) return { status: "DOWN", responseTimeMs: Date.now() - start, message: `Portainer API error: ${res.status}` };

      const data: any = await res.json();
      const running = data?.State?.Running === true;

      return {
        status: running ? "UP" : "DOWN",
        responseTimeMs: Date.now() - start,
        message: running ? undefined : `Container state: ${data?.State?.Status}`,
        metadata: {
          name: data?.Name,
          status: data?.State?.Status,
          image: data?.Config?.Image,
          restartCount: data?.RestartCount,
        },
      };
    }

    // ตรวจ endpoint ภาพรวม — นับ container ทั้งหมด
    const res = await fetch(
      `${config.portainerUrl}/api/endpoints/${config.endpointId}/docker/containers/json?all=true`,
      { headers }
    );
    if (!res.ok) return { status: "DOWN", responseTimeMs: Date.now() - start, message: `Portainer API error: ${res.status}` };

    const containers: any[] = await res.json();
    const running = containers.filter((c) => c.State === "running").length;
    const stopped = containers.filter((c) => c.State !== "running").length;

    return {
      status: "UP",
      responseTimeMs: Date.now() - start,
      metadata: { total: containers.length, running, stopped },
    };
  } catch (e: any) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e.message };
  }
}
