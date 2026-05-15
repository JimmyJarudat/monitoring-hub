export interface DockerConfig {
  portainerUrl: string;   // https://portainer.example.com
  apiKey: string;         // Portainer API key (X-API-Key)
  endpointId: number;     // Portainer endpoint ID
  stackId?: number;       // Portainer stack ID (numeric) — ถ้าระบุจะ monitor stack แทน container
  stackName?: string;     // Portainer / Docker stack name — supports managed and external stacks
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
  EndpointId?: number;
  ProjectPath?: string;
}

interface DockerService {
  ID: string;
  Spec: {
    Name: string;
    Mode?: {
      Replicated?: { Replicas?: number };
      Global?: Record<string, unknown>;
    };
    TaskTemplate?: {
      ContainerSpec?: { Image?: string };
    };
  };
  Version?: { Index?: number };
}

interface DockerTask {
  ID: string;
  ServiceID: string;
  DesiredState: string;
  Status: {
    State: string;
    Message?: string;
  };
  CreatedAt?: string;
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

const dockerFilters = (filters: Record<string, string[]>) => encodeURIComponent(JSON.stringify(filters));

const stackTypeLabel = (type?: number) => {
  if (type === 1) return "swarm";
  if (type === 2) return "compose";
  return "unknown";
};

const stackStatusLabel = (status: number) => status === 1 ? "active" : "inactive";

const stackResult = (stack: PortainerStack, responseTimeMs: number): CheckResult => {
  const active = stack.Status === 1;

  return {
    status: active ? "UP" : "DOWN",
    responseTimeMs,
    message: active ? undefined : `Stack "${stack.Name}" is inactive`,
    metadata: {
      source: "portainer-stack",
      stackId: stack.Id,
      name: stack.Name,
      endpointId: stack.EndpointId,
      status: stackStatusLabel(stack.Status),
      type: stackTypeLabel(stack.Type),
      projectPath: stack.ProjectPath,
    },
  };
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

    return stackResult((await res.json()) as PortainerStack, Date.now() - start);
  } catch (e: unknown) {
    return { status: "DOWN", responseTimeMs: Date.now() - start, message: e instanceof Error ? e.message : String(e) };
  }
}

async function checkManagedStackByName(cfg: DockerConfig, stackName: string): Promise<CheckResult | null> {
  const res = await fetch(`${apiBase(cfg)}/stacks`, { headers: hdrs(cfg) });

  if (!res.ok) {
    return {
      status: "DOWN",
      message: await portainerError(res),
    };
  }

  const stacks = (await res.json()) as PortainerStack[];
  const needle = stackName.trim().toLowerCase();
  const stack = stacks.find(
    (item) => item.Name.toLowerCase() === needle && Number(item.EndpointId) === Number(cfg.endpointId),
  );

  return stack ? stackResult(stack, 0) : null;
}

async function fetchExternalSwarmStack(cfg: DockerConfig, stackName: string) {
  const filters = dockerFilters({ label: [`com.docker.stack.namespace=${stackName}`] });
  const [servicesRes, tasksRes] = await Promise.all([
    fetch(`${dockerBase(cfg)}/services?filters=${filters}`, { headers: hdrs(cfg) }),
    fetch(`${dockerBase(cfg)}/tasks?filters=${filters}`, { headers: hdrs(cfg) }),
  ]);

  if (!servicesRes.ok && [404, 503].includes(servicesRes.status)) {
    return { services: [], tasks: [] };
  }

  if (!servicesRes.ok) {
    return { error: await portainerError(servicesRes) };
  }

  if (!tasksRes.ok && [404, 503].includes(tasksRes.status)) {
    return { services: [], tasks: [] };
  }

  if (!tasksRes.ok) {
    return { error: await portainerError(tasksRes) };
  }

  const services = (await servicesRes.json()) as DockerService[];
  const tasks = (await tasksRes.json()) as DockerTask[];
  return { services, tasks };
}

async function checkExternalSwarmStack(cfg: DockerConfig, stackName: string): Promise<CheckResult | null> {
  const data = await fetchExternalSwarmStack(cfg, stackName);

  if ("error" in data) {
    return {
      status: "DOWN",
      message: data.error,
    };
  }

  const { services, tasks } = data;
  if (services.length === 0) return null;

  const serviceSummaries = services.map((service) => {
    const desiredTasks = tasks.filter(
      (task) => task.ServiceID === service.ID && task.DesiredState === "running",
    );
    const runningTasks = desiredTasks.filter((task) => task.Status.State === "running");
    const replicatedDesired = service.Spec.Mode?.Replicated?.Replicas;
    const desired = typeof replicatedDesired === "number" ? replicatedDesired : desiredTasks.length;

    return {
      id: service.ID,
      name: service.Spec.Name,
      mode: service.Spec.Mode?.Replicated ? "replicated" : "global",
      desired,
      running: runningTasks.length,
      image: service.Spec.TaskTemplate?.ContainerSpec?.Image,
      version: service.Version?.Index,
    };
  });

  const totalDesired = serviceSummaries.reduce((sum, service) => sum + service.desired, 0);
  const totalRunning = serviceSummaries.reduce((sum, service) => sum + service.running, 0);
  const unhealthy = serviceSummaries.filter((service) => service.running < service.desired);
  const status: CheckResult["status"] =
    totalDesired === 0 || totalRunning === 0 ? "DOWN" : unhealthy.length === 0 ? "UP" : "DEGRADED";

  return {
    status,
    message:
      status === "UP"
        ? undefined
        : `${unhealthy.length} of ${serviceSummaries.length} services are below desired replicas`,
    metadata: {
      source: "docker-swarm-label",
      name: stackName,
      endpointId: cfg.endpointId,
      services: serviceSummaries,
      totalDesired,
      totalRunning,
      historicalFailedTasks: tasks.filter(
        (task) => task.DesiredState !== "running" && task.Status.State === "failed",
      ).length,
    },
  };
}

async function checkExternalComposeStack(cfg: DockerConfig, stackName: string): Promise<CheckResult | null> {
  const filters = dockerFilters({ label: [`com.docker.compose.project=${stackName}`] });
  const res = await fetch(`${dockerBase(cfg)}/containers/json?all=true&filters=${filters}`, {
    headers: hdrs(cfg),
  });

  if (!res.ok) {
    return {
      status: "DOWN",
      message: await portainerError(res),
    };
  }

  const containers = (await res.json()) as DockerContainerSummary[];
  if (containers.length === 0) return null;

  const running = containers.filter((container) => container.State === "running").length;
  const status: CheckResult["status"] =
    running === containers.length ? "UP" : running > 0 ? "DEGRADED" : "DOWN";

  return {
    status,
    message: status === "UP" ? undefined : `${running} of ${containers.length} containers are running`,
    metadata: {
      source: "docker-compose-label",
      name: stackName,
      endpointId: cfg.endpointId,
      total: containers.length,
      running,
      stopped: containers.length - running,
      containers: containers.map((container) => ({
        id: container.Id,
        names: container.Names,
        state: container.State,
        status: container.Status,
        image: container.Image,
      })),
    },
  };
}

async function checkStackByName(cfg: DockerConfig, stackName: string): Promise<CheckResult> {
  const start = Date.now();
  const name = stackName.trim();

  try {
    const managed = await checkManagedStackByName(cfg, name);
    if (managed) return { ...managed, responseTimeMs: Date.now() - start };

    const swarm = await checkExternalSwarmStack(cfg, name);
    if (swarm) return { ...swarm, responseTimeMs: Date.now() - start };

    const compose = await checkExternalComposeStack(cfg, name);
    if (compose) return { ...compose, responseTimeMs: Date.now() - start };

    return {
      status: "DOWN",
      responseTimeMs: Date.now() - start,
      message: `Stack "${name}" not found on endpoint ${cfg.endpointId}`,
      metadata: { source: "stack-name-lookup", name, endpointId: cfg.endpointId },
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
  if (config.stackName?.trim()) return checkStackByName(config, config.stackName);
  if (config.containerId) return checkContainer(config, config.containerId);
  return checkEndpoint(config);
}
