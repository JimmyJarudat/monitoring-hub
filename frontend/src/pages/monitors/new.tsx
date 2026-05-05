import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorType = "PING" | "TCP" | "HTTP" | "DOCKER" | "DATABASE";

type FormState = {
  name: string;
  type: MonitorType;
  interval: number;
  enabled: boolean;
  host: string;
  port: string;
  url: string;
  method: string;
  expectedStatus: string;
  timeoutMs: string;
  databaseType: string;
  user: string;
  password: string;
  database: string;
  portainerUrl: string;
  apiKey: string;
  endpointId: string;
  containerId: string;
};

type MonitorPayload = {
  name: string;
  type: MonitorType;
  interval: number;
  enabled: boolean;
  config: Record<string, unknown>;
};

const monitorTypes: Array<{ label: string; value: MonitorType; description: string }> = [
  { label: "Ping", value: "PING", description: "Basic host reachability check" },
  { label: "TCP", value: "TCP", description: "Check if a host port is reachable" },
  { label: "HTTP", value: "HTTP", description: "Validate URL response and status code" },
  { label: "Docker", value: "DOCKER", description: "Check Portainer endpoint or container" },
  { label: "Database", value: "DATABASE", description: "Check database connection health" },
];

const initialForm: FormState = {
  name: "",
  type: "HTTP",
  interval: 60,
  enabled: true,
  host: "",
  port: "",
  url: "",
  method: "GET",
  expectedStatus: "200",
  timeoutMs: "5000",
  databaseType: "postgresql",
  user: "",
  password: "",
  database: "",
  portainerUrl: "",
  apiKey: "",
  endpointId: "1",
  containerId: "",
};

const toOptionalNumber = (value: string) => {
  return value.trim() ? Number(value) : undefined;
};

const compactConfig = (config: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== "" && value !== undefined),
  );
};

const buildConfig = (form: FormState) => {
  const timeoutMs = toOptionalNumber(form.timeoutMs);

  if (form.type === "PING") {
    return compactConfig({
      host: form.host,
      timeoutMs,
    });
  }

  if (form.type === "TCP") {
    return compactConfig({
      host: form.host,
      port: Number(form.port),
      timeoutMs,
    });
  }

  if (form.type === "HTTP") {
    return compactConfig({
      url: form.url,
      method: form.method,
      expectedStatus: Number(form.expectedStatus),
      timeoutMs,
    });
  }

  if (form.type === "DOCKER") {
    return compactConfig({
      portainerUrl: form.portainerUrl,
      apiKey: form.apiKey,
      endpointId: Number(form.endpointId),
      containerId: form.containerId,
    });
  }

  if (form.databaseType === "sqlite") {
    return compactConfig({
      type: form.databaseType,
      filename: form.database,
      timeoutMs,
    });
  }

  return compactConfig({
    type: form.databaseType,
    host: form.host,
    port: Number(form.port),
    user: form.user,
    password: form.password,
    database: form.database,
    timeoutMs,
  });
};

const getRequiredHint = (type: MonitorType) => {
  if (type === "PING") return "Required: host";
  if (type === "TCP") return "Required: host, port";
  if (type === "HTTP") return "Required: url";
  if (type === "DOCKER") return "Required: portainerUrl, apiKey, endpointId";
  return "Required: database type, host, port. SQLite uses database file path.";
};

const AddMonitorPage = () => {
  const navigate = useNavigate();
  const { post } = useApi();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = useMemo(
    () => monitorTypes.find((item) => item.value === form.type) ?? monitorTypes[0],
    [form.type],
  );
  const usesSqlite = form.type === "DATABASE" && form.databaseType === "sqlite";

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const payload: MonitorPayload = {
      name: form.name.trim(),
      type: form.type,
      interval: Number(form.interval),
      enabled: form.enabled,
      config: buildConfig(form),
    };

    try {
      await post("/monitors", payload);
      toast.success("เพิ่ม monitor สำเร็จ");
      navigate("/dashboard/monitors", { replace: true });
    } catch {
      toast.error("เพิ่ม monitor ไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Add Monitor</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Create a new check target. The configuration is stored as JSON and sent directly to the API.
          </p>
        </div>

        <Link
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          to="/dashboard/monitors"
        >
          Back to Monitors
        </Link>
      </div>

      <form className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]" onSubmit={handleSubmit}>
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">Monitor details</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Main Website"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Type</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.type}
                  onChange={(event) => updateField("type", event.target.value as MonitorType)}
                >
                  {monitorTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Interval seconds</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  min={10}
                  type="number"
                  value={form.interval}
                  onChange={(event) => updateField("interval", Number(event.target.value))}
                  required
                />
              </label>

              <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                <input
                  checked={form.enabled}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                  type="checkbox"
                  onChange={(event) => updateField("enabled", event.target.checked)}
                />
                <span className="text-sm font-medium text-slate-700">Enable monitor after create</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-slate-950">{selectedType.label} config</h2>
              <p className="text-sm text-slate-500">{selectedType.description}</p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {form.type === "HTTP" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">URL</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.url}
                      onChange={(event) => updateField("url", event.target.value)}
                      placeholder="https://example.com/health"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Method</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.method}
                      onChange={(event) => updateField("method", event.target.value)}
                    >
                      <option>GET</option>
                      <option>POST</option>
                      <option>HEAD</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Expected status</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.expectedStatus}
                      onChange={(event) => updateField("expectedStatus", event.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}

              {form.type === "PING" || form.type === "TCP" || (form.type === "DATABASE" && !usesSqlite) ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Host</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.host}
                      onChange={(event) => updateField("host", event.target.value)}
                      placeholder="10.10.0.1"
                      required
                    />
                  </label>

                  {form.type !== "PING" ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Port</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        type="number"
                        value={form.port}
                        onChange={(event) => updateField("port", event.target.value)}
                        placeholder="443"
                        required
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              {form.type === "DATABASE" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Database type</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.databaseType}
                      onChange={(event) => updateField("databaseType", event.target.value)}
                    >
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="mariadb">MariaDB</option>
                      <option value="redis">Redis</option>
                      <option value="mongodb">MongoDB</option>
                      <option value="sqlserver">SQL Server</option>
                      <option value="sqlite">SQLite</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      {form.databaseType === "sqlite" ? "SQLite file path" : "Database name"}
                    </span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.database}
                      onChange={(event) => updateField("database", event.target.value)}
                      placeholder={form.databaseType === "sqlite" ? "C:\\data\\app.db" : "monitoring"}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">User</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.user}
                      onChange={(event) => updateField("user", event.target.value)}
                      placeholder="readonly"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="password"
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {form.type === "DOCKER" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Portainer URL</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.portainerUrl}
                      onChange={(event) => updateField("portainerUrl", event.target.value)}
                      placeholder="http://portainer:9000"
                      required
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">API key</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.apiKey}
                      onChange={(event) => updateField("apiKey", event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Endpoint ID</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.endpointId}
                      onChange={(event) => updateField("endpointId", event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Container ID</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.containerId}
                      onChange={(event) => updateField("containerId", event.target.value)}
                      placeholder="optional"
                    />
                  </label>
                </>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Timeout ms</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  type="number"
                  value={form.timeoutMs}
                  onChange={(event) => updateField("timeoutMs", event.target.value)}
                />
              </label>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">API payload</h2>
            <p className="mt-1 text-sm text-slate-500">{getRequiredHint(form.type)}</p>

            <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(
                {
                  name: form.name || "Untitled monitor",
                  type: form.type,
                  interval: Number(form.interval),
                  enabled: form.enabled,
                  config: buildConfig(form),
                },
                null,
                2,
              )}
            </pre>
          </div>

          <button
            className="w-full rounded-md bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Creating monitor..." : "Create Monitor"}
          </button>
        </aside>
      </form>
    </div>
  );
};

export default AddMonitorPage;
