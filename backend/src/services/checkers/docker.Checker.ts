export interface DockerConfig {
  portainerUrl: string;   // https://portainer.example.com
  apiKey: string;         // Portainer API key (X-API-Key)
  endpointId: number;     // Portainer endpoint ID
  stackId?: number;       // Portainer stack ID (numeric) — ถ้าระบุจะ monitor stack แทน container
  containerId?: string;   // Docker container ID / ชื่อ container — ถ้าไม่ระบุทั้ง stack/container = เช็ค endpoint ภาพรวม
  cfAccessClientId?: string;     // Cloudflare Access Client ID (optional)
  cfAccessClientSecret?: string; // Cloudflare Access Client Secret (optional)
}

export interface CheckResult {
  status: "UP" | "DOWN" | "DEGRADED";
  responseTimeMs?: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

interface PortainerStack {
  Id: number;
  Name: string;
  Status: number; // 1 = active, 2 = inactive
  Type: number;
}

interface DockerContainerSummary {
  Id: string;
  Names: string[];
  State: string;
  Status: string;
  Image: string;
}

interface DockerContainerInspect {
  Id: string;
  Name: string;
  State: { Running: boolean; Status: string };
  Config: { Image: string };
  RestartCount: number;
}

const apiBase = (cfg: DockerConfig) => `${cfg.portainerUrl.replace(/\/$/, "")}/api`;
const dockerBase = (cfg: DockerConfig) => `${apiBase(cfg)}/endpoints/${cfg.endpointId}/docker`;
const hdrs = (cfg: DockerConfig) => {
  const headers: Record<string, string> = { "X-API-Key": cfg.apiKey };

  if (cfg.cfAccessClientId && cfg.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cfg.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = cfg.cfAccessClientSecret;
  }

  return headers;
};

const portainerError = async (res: Response) => {
  const body = await res.text().catch(() => "");
  const detail = body.trim().slice(0, 240);
  return `Portainer API error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`;
};

// ── Stack check ───────────────────────────────────────────────────

async function checkStack(cfg: DockerConfig, stackId: number): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${apiBase(cfg)}/stacks/${stackId}`, { headers: hdrs(cfg) });

    if (!res.ok) {
      return {
        status: "DOWN",
        responseTimeMs: Date.now() - start,
        message: await portainerError(res),
      };
    }

    const stack = (await res.json()) as PortainerStack;
    const active = stack.Status === 1;

    return {
      status: active ? "UP" : "DOWN",
      responseTimeMs: Date.now() - start,
      message: active ? undefined : `Stack "${stack.Name}" is inactive`,
      metadata: {
        stackId: stack.Id,
        name: stack.Name,
        status: stack.Status === 1 ? "active" : "inactive",
        type: stack.Type === 1 ? "swarm" : "compose",
      },
    };
  } catch (e: unknown) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e instanceof Error ? e.message : String(e) };
  }
}

// ── Container check ───────────────────────────────────────────────

async function resolveContainer(cfg: DockerConfig, containerId: string): Promise<DockerContainerInspect | null> {
  // ลอง inspect โดยตรงก่อน (full ID / short ID / ชื่อ)
  const res = await fetch(`${dockerBase(cfg)}/containers/${encodeURIComponent(containerId)}/json`, {
    headers: hdrs(cfg),
  });
  if (res.ok) return (await res.json()) as DockerContainerInspect;
  if (res.status !== 404) return null;

  // 404 → list ทั้งหมดแล้ว match ชื่อหรือ short-ID prefix
  const listRes = await fetch(`${dockerBase(cfg)}/containers/json?all=true`, { headers: hdrs(cfg) });
  if (!listRes.ok) return null;

  const containers = (await listRes.json()) as DockerContainerSummary[];
  const needle = containerId.toLowerCase().replace(/^\//, "");
  const found = containers.find(
    (c) =>
      c.Id.startsWith(needle) ||
      c.Names.some((n) => n.replace(/^\//, "").toLowerCase() === needle),
  );
  if (!found) return null;

  const res2 = await fetch(`${dockerBase(cfg)}/containers/${found.Id}/json`, { headers: hdrs(cfg) });
  if (!res2.ok) return null;
  return (await res2.json()) as DockerContainerInspect;
}

async function checkContainer(cfg: DockerConfig, containerId: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const data = await resolveContainer(cfg, containerId);
    if (!data) {
      return {
        status: "DOWN",
        responseTimeMs: Date.now() - start,
        message: `Container "${containerId}" not found — please check the container ID or name.`,
      };
    }
    const running = data.State.Running === true;
    return {
      status: running ? "UP" : "DOWN",
      responseTimeMs: Date.now() - start,
      message: running ? undefined : `Container state: ${data.State.Status}`,
      metadata: {
        name: data.Name,
        status: data.State.Status,
        image: data.Config.Image,
        restartCount: data.RestartCount,
      },
    };
  } catch (e: unknown) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e instanceof Error ? e.message : String(e) };
  }
}

// ── Endpoint overview ─────────────────────────────────────────────

async function checkEndpoint(cfg: DockerConfig): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${dockerBase(cfg)}/containers/json?all=true`, { headers: hdrs(cfg) });
    if (!res.ok) {
      return { status: "DOWN", responseTimeMs: Date.now() - start, message: await portainerError(res) };
    }
    const containers = (await res.json()) as DockerContainerSummary[];
    const running = containers.filter((c) => c.State === "running").length;
    const stopped = containers.filter((c) => c.State !== "running").length;
    return {
      status: "UP",
      responseTimeMs: Date.now() - start,
      metadata: { total: containers.length, running, stopped },
    };
  } catch (e: unknown) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e instanceof Error ? e.message : String(e) };
  }
}

// ── Entry point ───────────────────────────────────────────────────

export async function dockerCheck(config: DockerConfig): Promise<CheckResult> {
  if (config.stackId) return checkStack(config, config.stackId);
  if (config.containerId) return checkContainer(config, config.containerId);
  return checkEndpoint(config);
}
