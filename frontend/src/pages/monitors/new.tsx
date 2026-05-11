import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "SNMP" | "SYSTEM" | "DOCKER" | "DATABASE";

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
  warningDays: string;
  httpFollowRedirect: boolean;
  httpAuthType: "none" | "basic" | "bearer";
  httpAuthUsername: string;
  httpAuthPassword: string;
  httpAuthToken: string;
  httpExpectedBodyText: string;
  httpExpectedHeaderKey: string;
  httpExpectedHeaderValue: string;
  httpLatencyThresholdMs: string;
  httpJsonPath: string;
  httpJsonExpected: string;
  tcpPreset: string;
  snmpCommunity: string;
  snmpVersion: "1" | "2c";
  snmpPort: string;
  snmpOids: string;
  dnsRecordType: string;
  dnsExpectedValue: string;
  dnsServer: string;
  databaseType: string;
  user: string;
  password: string;
  database: string;
  mongoUri: string;
  authSource: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  portainerUrl: string;
  apiKey: string;
  cfAccessCredentialId: string;
  endpointId: string;
  stackId: string;
  containerId: string;
};

type MonitorPayload = {
  name: string;
  type: MonitorType;
  interval: number;
  enabled: boolean;
  config: Record<string, unknown>;
  credentialId?: string;
};

type CredentialType = "SNMP_COMMUNITY" | "USERNAME_PASSWORD" | "API_TOKEN" | "SSH_KEY" | "CLOUDFLARE_ACCESS";

type CredentialRow = {
  id: string;
  name: string;
  type: CredentialType;
  username: string | null;
  secret: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const monitorTypes: Array<{ label: string; value: MonitorType; descriptionKey: string }> = [
  { label: "Ping", value: "PING", descriptionKey: "newMonitor.typeDescriptions.PING" },
  { label: "TCP", value: "TCP", descriptionKey: "newMonitor.typeDescriptions.TCP" },
  { label: "HTTP", value: "HTTP", descriptionKey: "newMonitor.typeDescriptions.HTTP" },
  {
    label: "TLS Certificate",
    value: "TLS_CERT",
    descriptionKey: "newMonitor.typeDescriptions.TLS_CERT",
  },
  {
    label: "DNS",
    value: "DNS",
    descriptionKey: "newMonitor.typeDescriptions.DNS",
  },
  {
    label: "SNMP",
    value: "SNMP",
    descriptionKey: "newMonitor.typeDescriptions.SNMP",
  },
  {
    label: "System",
    value: "SYSTEM",
    descriptionKey: "newMonitor.typeDescriptions.SYSTEM",
  },
  { label: "Docker", value: "DOCKER", descriptionKey: "newMonitor.typeDescriptions.DOCKER" },
  { label: "Database", value: "DATABASE", descriptionKey: "newMonitor.typeDescriptions.DATABASE" },
];

const TCP_PRESETS: Array<{ label: string; value: string; port: string }> = [
  { label: "Custom", value: "custom", port: "" },
  { label: "SSH", value: "ssh", port: "22" },
  { label: "RDP", value: "rdp", port: "3389" },
  { label: "FTP", value: "ftp", port: "21" },
  { label: "SMTP", value: "smtp", port: "25" },
  { label: "SMTP TLS", value: "smtp-tls", port: "587" },
  { label: "LDAP", value: "ldap", port: "389" },
  { label: "LDAPS", value: "ldaps", port: "636" },
  { label: "HTTP", value: "http", port: "80" },
  { label: "HTTPS", value: "https", port: "443" },
  { label: "MySQL", value: "mysql", port: "3306" },
  { label: "PostgreSQL", value: "postgresql", port: "5432" },
  { label: "Redis", value: "redis", port: "6379" },
  { label: "MongoDB", value: "mongodb", port: "27017" },
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
  warningDays: "30",
  tcpPreset: "custom",
  snmpCommunity: "public",
  snmpVersion: "2c",
  snmpPort: "161",
  snmpOids: "",
  httpFollowRedirect: true,
  httpAuthType: "none",
  httpAuthUsername: "",
  httpAuthPassword: "",
  httpAuthToken: "",
  httpExpectedBodyText: "",
  httpExpectedHeaderKey: "",
  httpExpectedHeaderValue: "",
  httpLatencyThresholdMs: "",
  httpJsonPath: "",
  httpJsonExpected: "",
  dnsRecordType: "A",
  dnsExpectedValue: "",
  dnsServer: "",
  databaseType: "postgresql",
  user: "",
  password: "",
  database: "",
  mongoUri: "",
  authSource: "admin",
  encrypt: false,
  trustServerCertificate: true,
  portainerUrl: "",
  apiKey: "",
  cfAccessCredentialId: "",
  endpointId: "1",
  stackId: "",
  containerId: "",
};

const toOptionalNumber = (value: string) => {
  return value.trim() ? Number(value) : undefined;
};

const maskCredentialValue = (value?: string | null) => {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-6)}`;
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
      followRedirect: form.httpFollowRedirect ? undefined : false,
      authType: form.httpAuthType !== "none" ? form.httpAuthType : undefined,
      authUsername: form.httpAuthType === "basic" ? form.httpAuthUsername : undefined,
      authPassword: form.httpAuthType === "basic" ? form.httpAuthPassword : undefined,
      authToken: form.httpAuthType === "bearer" ? form.httpAuthToken : undefined,
      expectedBodyText: form.httpExpectedBodyText,
      expectedHeaderKey: form.httpExpectedHeaderKey,
      expectedHeaderValue: form.httpExpectedHeaderValue,
      latencyThresholdMs: toOptionalNumber(form.httpLatencyThresholdMs),
      jsonPath: form.httpJsonPath,
      jsonExpected: form.httpJsonExpected,
    });
  }

  if (form.type === "TLS_CERT") {
    return compactConfig({
      url: form.url,
      warningDays: toOptionalNumber(form.warningDays),
      timeoutMs,
    });
  }

  if (form.type === "DNS") {
    return compactConfig({
      host: form.host,
      recordType: form.dnsRecordType,
      expectedValue: form.dnsExpectedValue,
      server: form.dnsServer,
      timeoutMs,
    });
  }

  if (form.type === "SNMP") {
    return compactConfig({
      host: form.host,
      port: toOptionalNumber(form.snmpPort),
      community: form.snmpCommunity,
      version: form.snmpVersion,
      oids: form.snmpOids.trim() ? form.snmpOids.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      timeoutMs,
    });
  }

  if (form.type === "SYSTEM") {
    return compactConfig({
      host: form.host,
      port: toOptionalNumber(form.snmpPort),
      community: form.snmpCommunity,
      version: form.snmpVersion,
      timeoutMs,
    });
  }

  if (form.type === "DOCKER") {
    return compactConfig({
      portainerUrl: form.portainerUrl,
      apiKey: form.apiKey,
      cfAccessCredentialId: form.cfAccessCredentialId,
      endpointId: Number(form.endpointId),
      ...(form.stackId ? { stackId: Number(form.stackId) } : {}),
      ...(form.containerId ? { containerId: form.containerId } : {}),
    });
  }

  if (form.databaseType === "sqlite") {
    return compactConfig({
      type: form.databaseType,
      filename: form.database,
      timeoutMs,
    });
  }

  if (form.databaseType === "mongodb") {
    return compactConfig({
      type: form.databaseType,
      uri: form.mongoUri,
      host: form.host,
      port: Number(form.port),
      user: form.user,
      password: form.password,
      database: form.database,
      authSource: form.authSource,
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
    encrypt: form.databaseType === "sqlserver" || form.databaseType === "mssql" ? form.encrypt : undefined,
    trustServerCertificate:
      form.databaseType === "sqlserver" || form.databaseType === "mssql"
        ? form.trustServerCertificate
        : undefined,
  });
};

type GuideField = { name: string; desc: string; required?: boolean };
type TypeGuide = { summary: string; fields: GuideField[]; tip?: string };

const TYPE_GUIDES: Record<MonitorType, TypeGuide> = {
  HTTP: {
    summary: "Send an HTTP request and verify status code, body, headers, and latency.",
    fields: [
      { name: "URL", desc: "Address to check, such as https://example.com/health", required: true },
      { name: "Method", desc: "GET fetches data · HEAD skips body · POST works for APIs that accept requests" },
      { name: "Expected status", desc: "Expected HTTP status, such as 200 = OK · 201 = Created · 204 = No Content" },
      { name: "Auth type", desc: "Basic = username/password · Bearer = API token or JWT" },
      { name: "Expected body text", desc: 'Text that must exist in the response, such as "ok" or "healthy"; otherwise DEGRADED' },
      { name: "JSON path", desc: "Check a value in JSON response, such as $.status or $.data.items[0].state" },
      { name: "JSON expected value", desc: 'Expected value from JSON path, such as "ok" or "true"' },
      { name: "Expected header", desc: "Header name such as content-type and expected value such as application/json" },
      { name: "Latency threshold ms", desc: "DEGRADED when response is slower than this, e.g. 2000 = slower than 2 seconds" },
      { name: "Follow redirects", desc: "Enabled = follow redirects automatically · disabled = stop at 3xx and check that status" },
    ],
    tip: "Best for API health endpoints such as /health, /ping, /status, and pages where content must be checked.",
  },
  PING: {
    summary: "Send an ICMP ping to a host and check whether it responds.",
    fields: [
      { name: "Host", desc: "IP address or hostname, such as 192.168.1.1 or router.local", required: true },
      { name: "Timeout ms", desc: "How long to wait before marking DOWN, e.g. 5000 = 5 seconds" },
    ],
    tip: "Use this to check whether a device is reachable. It does not prove a service works; pair it with TCP or HTTP.",
  },
  TCP: {
    summary: "Open a TCP connection to host:port and verify it connects.",
    fields: [
      { name: "Service preset", desc: "Choose a preset service to auto-fill the port, such as SSH = 22 · RDP = 3389 · SMTP = 25" },
      { name: "Host", desc: "Server IP address or hostname", required: true },
      { name: "Port", desc: "TCP port to check", required: true },
      { name: "Timeout ms", desc: "How long to wait for the connection" },
    ],
    tip: "Best for checking whether SSH, RDP, or database ports are open. It does not verify login.",
  },
  TLS_CERT: {
    summary: "Connect with HTTPS and check whether the SSL/TLS certificate is near expiry.",
    fields: [
      { name: "URL", desc: "HTTPS address such as https://example.com; it must start with https://", required: true },
      { name: "Warning days", desc: "How many days before expiry to warn, e.g. 30 = one month early" },
    ],
    tip: "Expired certificates are DOWN. Certificates inside warning days are DEGRADED. Healthy certificates are UP.",
  },
  DNS: {
    summary: "Send a DNS query and verify that the domain resolves to the expected value.",
    fields: [
      { name: "Host", desc: "Domain to resolve, such as n8n.example.com; use a full record name", required: true },
      { name: "Record type", desc: "A = IPv4 · AAAA = IPv6 · CNAME = alias · MX = email server · NS = nameserver · TXT = text" },
      { name: "Expected value", desc: "Expected resolved value, such as an IP address; mismatch becomes DEGRADED" },
      { name: "DNS server", desc: "Specific DNS server such as 1.1.1.1; blank uses system default" },
    ],
    tip: "A domain without the requested record becomes DOWN. Use a subdomain such as api.example.com when needed.",
  },
  SNMP: {
    summary: "Send SNMP GET queries to a network device and collect sysName, sysDescr, sysUpTime, and interface counters.",
    fields: [
      { name: "Host", desc: "Device IP address, such as 192.168.1.1", required: true },
      { name: "Community", desc: 'SNMP community string such as "public" (read-only) or a custom value' },
      { name: "Version", desc: "SNMP version; 2c is best supported, 1 is for older devices" },
      { name: "Port", desc: "SNMP agent UDP port; default is 161" },
      { name: "Custom OIDs", desc: "Comma-separated OIDs to GET; blank uses sysName, sysDescr, and sysUpTime" },
    ],
    tip: "SNMP monitors also collect per-interface traffic and error counters as time-series data.",
  },
  SYSTEM: {
    summary: "Collect CPU, RAM, disk, and network data from Linux servers through SNMP. snmpd must be installed first.",
    fields: [
      { name: "Host", desc: "Server IP address, such as 10.8.0.1", required: true },
      { name: "Community", desc: 'SNMP community string such as "public" or a custom value' },
      { name: "Version", desc: "SNMP version; 2c is best supported" },
      { name: "Port", desc: "SNMP UDP port; default is 161" },
    ],
    tip: "SYSTEM monitors store metric samples separately for CPU/RAM/disk/network charts.",
  },
  DOCKER: {
    summary: "Connect to Portainer and check Stack, Container, or Endpoint status.",
    fields: [
      { name: "Portainer URL", desc: "Portainer address such as https://portainer.example.com or http://192.168.1.1:9000", required: true },
      { name: "API key", desc: "Create it in Portainer → User settings → Access tokens", required: true },
      { name: "Endpoint ID", desc: "Environment ID in Portainer, visible in URLs such as /#!/1/docker → ID = 1", required: true },
      { name: "Stack ID (recommended)", desc: "Numeric Stack ID in Portainer, such as 12" },
      { name: "Container ID / Name", desc: "Use when not checking a Stack; enter container name or short ID such as nginx or abc123def" },
    ],
    tip: "Priority: Stack ID → Container ID/Name → Endpoint overview when both are blank.",
  },
  DATABASE: {
    summary: "Open a database connection and run a simple query to verify responsiveness.",
    fields: [
      { name: "Database type", desc: "Database engine to check", required: true },
      { name: "Host / Port", desc: "Database server address such as 192.168.1.1 port 5432", required: true },
      { name: "User / Password", desc: "Use a dedicated read-only monitor user; avoid admin credentials" },
      { name: "Database name", desc: "Database name to connect to" },
      { name: "MongoDB URI", desc: "When URI is set, it replaces host/port/user/password, e.g. mongodb://user:pass@host:27017/db" },
    ],
    tip: "Use the least-privileged read-only user possible, such as SELECT-only. Avoid admin credentials.",
  },
};

const getRequiredHintKey = (type: MonitorType) => {
  if (type === "PING") return "newMonitor.requiredHints.PING";
  if (type === "TCP") return "newMonitor.requiredHints.TCP";
  if (type === "HTTP") return "newMonitor.requiredHints.HTTP";
  if (type === "TLS_CERT") return "newMonitor.requiredHints.TLS_CERT";
  if (type === "DNS") return "newMonitor.requiredHints.DNS";
  if (type === "SNMP") return "newMonitor.requiredHints.SNMP";
  if (type === "SYSTEM") return "newMonitor.requiredHints.SYSTEM";
  if (type === "DOCKER") return "newMonitor.requiredHints.DOCKER";
  return "newMonitor.requiredHints.DATABASE";
};

const credentialTypeLabelKeys: Record<CredentialType, string> = {
  SNMP_COMMUNITY: "credentials.typeSnmpCommunity",
  USERNAME_PASSWORD: "credentials.typeUsernamePassword",
  API_TOKEN: "credentials.typeApiToken",
  SSH_KEY: "credentials.typeSshKey",
  CLOUDFLARE_ACCESS: "credentials.typeCloudflareAccess",
};

const getCompatibleCredentialTypes = (
  form: Pick<FormState, "type" | "httpAuthType" | "databaseType">,
): CredentialType[] => {
  if (form.type === "SNMP" || form.type === "SYSTEM") return ["SNMP_COMMUNITY"];
  if (form.type === "HTTP" && form.httpAuthType === "basic") return ["USERNAME_PASSWORD"];
  if (form.type === "HTTP" && form.httpAuthType === "bearer") return ["API_TOKEN"];
  if (form.type === "DOCKER") return ["API_TOKEN"];
  if (form.type === "DATABASE" && form.databaseType !== "sqlite") return ["USERNAME_PASSWORD"];
  return [];
};

const AddMonitorPage = () => {
  const navigate = useNavigate();
  const { api, post } = useApi();
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState("");

  const selectedType = useMemo(
    () => monitorTypes.find((item) => item.value === form.type) ?? monitorTypes[0],
    [form.type],
  );
  const usesSqlite = form.type === "DATABASE" && form.databaseType === "sqlite";
  const usesMongoDb = form.type === "DATABASE" && form.databaseType === "mongodb";
  const usesSqlServer =
    form.type === "DATABASE" &&
    (form.databaseType === "sqlserver" || form.databaseType === "mssql");
  const usesMongoUri = usesMongoDb && form.mongoUri.trim().length > 0;
  const compatibleCredentialTypes = useMemo(
    () => getCompatibleCredentialTypes(form),
    [form],
  );
  const availableCredentials = useMemo(
    () => credentials.filter((credential) => compatibleCredentialTypes.includes(credential.type)),
    [compatibleCredentialTypes, credentials],
  );
  const cloudflareAccessCredentials = useMemo(
    () => credentials.filter((credential) => credential.type === "CLOUDFLARE_ACCESS"),
    [credentials],
  );
  const selectedCloudflareAccessCredential = useMemo(
    () => cloudflareAccessCredentials.find((credential) => credential.id === form.cfAccessCredentialId) ?? null,
    [cloudflareAccessCredentials, form.cfAccessCredentialId],
  );
  const selectedCredential = useMemo(
    () => availableCredentials.find((credential) => credential.id === selectedCredentialId) ?? null,
    [availableCredentials, selectedCredentialId],
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const response = await api.get<ApiResponse<CredentialRow[]>>("/credentials");
        if (response.data.success) {
          setCredentials(response.data.data);
        }
      } catch {
        // leave silent; monitor form still works without credentials inventory
      }
    };

    void loadCredentials();
  }, [api]);

  useEffect(() => {
    setSelectedCredentialId("");
    setForm((current) => current.type === "DOCKER" ? current : { ...current, cfAccessCredentialId: "" });
  }, [form.type, form.httpAuthType, form.databaseType]);

  const applyCredential = (credentialId: string) => {
    setSelectedCredentialId(credentialId);
    const credential = availableCredentials.find((item) => item.id === credentialId);

    if (!credential) return;

    setForm((current) => {
      const next = { ...current };
      const metadata = credential.metadata ?? {};

      if (current.type === "SNMP" || current.type === "SYSTEM") {
        next.snmpCommunity = credential.secret;
        if (typeof metadata.version === "string" && (metadata.version === "1" || metadata.version === "2c")) {
          next.snmpVersion = metadata.version;
        }
        if (metadata.port !== undefined && metadata.port !== null) {
          next.snmpPort = String(metadata.port);
        }
      }

      if (current.type === "HTTP" && current.httpAuthType === "basic") {
        next.httpAuthUsername = credential.username ?? "";
        next.httpAuthPassword = credential.secret;
      }

      if (current.type === "HTTP" && current.httpAuthType === "bearer") {
        next.httpAuthToken = credential.secret;
      }

      if (current.type === "DOCKER") {
        next.apiKey = credential.secret;
      }

      if (current.type === "DATABASE" && current.databaseType !== "sqlite") {
        next.user = credential.username ?? "";
        next.password = credential.secret;
        if (current.databaseType === "mongodb" && typeof metadata.authSource === "string") {
          next.authSource = metadata.authSource;
        }
      }

      return next;
    });
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
      credentialId: selectedCredentialId || undefined,
    };

    try {
      await post("/monitors", payload);
      toast.success(t("newMonitor.createSuccess"));
      navigate("/monitors", { replace: true });
    } catch {
      toast.error(t("newMonitor.createError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("newMonitor.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("newMonitor.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t("newMonitor.description")}
          </p>
        </div>

        <Link
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          to="/monitors"
        >
          {t("newMonitor.backToMonitors")}
        </Link>
      </div>

      <form className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]" onSubmit={handleSubmit}>
        <section className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">{t("newMonitor.monitorDetails")}</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">{t("common.name")}</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Main Website"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("common.type")}</span>
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
                <span className="text-sm font-medium text-slate-700">{t("newMonitor.intervalSeconds")}</span>
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
                <span className="text-sm font-medium text-slate-700">{t("newMonitor.enableAfterCreate")}</span>
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">{t("newMonitor.typeConfig", { type: selectedType.label })}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t(selectedType.descriptionKey)}</p>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                onClick={() => setShowGuide((v) => !v)}
              >
                <span>{showGuide ? "▲" : "▼"}</span>
                {t("newMonitor.usageGuide")}
              </button>
            </div>

            {showGuide ? (
              <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50 p-4 text-sm">
                <p className="font-medium text-cyan-900">{TYPE_GUIDES[form.type].summary}</p>
                <ul className="mt-3 space-y-2">
                  {TYPE_GUIDES[form.type].fields.map((field) => (
                    <li key={field.name} className="flex gap-2">
                      <span className="mt-0.5 shrink-0">
                        {field.required ? (
                          <span className="rounded bg-cyan-200 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">{t("newMonitor.required")}</span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t("newMonitor.optional")}</span>
                        )}
                      </span>
                      <span className="text-slate-700"><span className="font-medium text-slate-900">{field.name}</span> — {field.desc}</span>
                    </li>
                  ))}
                </ul>
                {TYPE_GUIDES[form.type].tip ? (
                  <p className="mt-3 rounded-md bg-cyan-100 px-3 py-2 text-xs text-cyan-800">
                    💡 {TYPE_GUIDES[form.type].tip}
                  </p>
                ) : null}
              </div>
            ) : null}

            {compatibleCredentialTypes.length > 0 ? (
              <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-violet-950">{t("newMonitor.credentialLink")}</h3>
                    <p className="mt-1 text-sm text-violet-800">
                      {t("newMonitor.compatibleCredentialOnly", {
                        types: compatibleCredentialTypes.map((type) => t(credentialTypeLabelKeys[type])).join(", "),
                      })}
                    </p>
                  </div>
                  <Link
                    className="shrink-0 rounded-md border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                    to="/credentials"
                  >
                    {t("newMonitor.manageCredentials")}
                  </Link>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1fr,auto]">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.chooseCredential")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={selectedCredentialId}
                      onChange={(event) => applyCredential(event.target.value)}
                    >
                      <option value="">{t("newMonitor.dontUsePreset")}</option>
                      {availableCredentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name} · {t(credentialTypeLabelKeys[credential.type])}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedCredential ? (
                    <div className="rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-slate-600">
                      <div className="font-semibold text-slate-900">{selectedCredential.name}</div>
                      <div className="mt-1">{selectedCredential.notes || t("newMonitor.noNotes")}</div>
                    </div>
                  ) : null}
                </div>

                {availableCredentials.length === 0 ? (
                  <p className="mt-3 text-xs text-violet-700">
                    {t("newMonitor.noCompatibleCredentials")}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-violet-700">
                    {t("newMonitor.credentialAutofillHint")}
                  </p>
                )}
              </div>
            ) : null}

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
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.expectedStatus")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.expectedStatus}
                      onChange={(event) => updateField("expectedStatus", event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.authType")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpAuthType}
                      onChange={(event) => updateField("httpAuthType", event.target.value as "none" | "basic" | "bearer")}
                    >
                      <option value="none">None</option>
                      <option value="basic">Basic</option>
                      <option value="bearer">Bearer token</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <input
                      checked={form.httpFollowRedirect}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                      type="checkbox"
                      onChange={(event) => updateField("httpFollowRedirect", event.target.checked)}
                    />
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.followRedirects")}</span>
                  </label>
                  {form.httpAuthType === "basic" ? (
                    <>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">{t("newMonitor.username")}</span>
                        <input
                          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                          value={form.httpAuthUsername}
                          onChange={(event) => updateField("httpAuthUsername", event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">{t("newMonitor.password")}</span>
                        <input
                          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                          type="password"
                          value={form.httpAuthPassword}
                          onChange={(event) => updateField("httpAuthPassword", event.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                  {form.httpAuthType === "bearer" ? (
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Bearer token</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        value={form.httpAuthToken}
                        onChange={(event) => updateField("httpAuthToken", event.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.expectedBodyText")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedBodyText}
                      onChange={(event) => updateField("httpExpectedBodyText", event.target.value)}
                      placeholder={t("newMonitor.expectedBodyPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.expectedHeaderName")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedHeaderKey}
                      onChange={(event) => updateField("httpExpectedHeaderKey", event.target.value)}
                      placeholder="content-type"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.expectedHeaderValue")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedHeaderValue}
                      onChange={(event) => updateField("httpExpectedHeaderValue", event.target.value)}
                      placeholder="application/json"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.latencyThresholdMs")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.httpLatencyThresholdMs}
                      onChange={(event) => updateField("httpLatencyThresholdMs", event.target.value)}
                      placeholder={t("newMonitor.latencyPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.jsonPath")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpJsonPath}
                      onChange={(event) => updateField("httpJsonPath", event.target.value)}
                      placeholder="$.status"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.jsonExpectedValue")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpJsonExpected}
                      onChange={(event) => updateField("httpJsonExpected", event.target.value)}
                      placeholder="ok"
                    />
                  </label>
                </>
              ) : null}

              {form.type === "TLS_CERT" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">URL</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.url}
                      onChange={(event) => updateField("url", event.target.value)}
                      placeholder="https://example.com"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.warningDays")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      min={1}
                      value={form.warningDays}
                      onChange={(event) => updateField("warningDays", event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {form.type === "SNMP" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Host</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.host}
                      onChange={(event) => updateField("host", event.target.value)}
                      placeholder="192.168.1.1"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.community")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.snmpCommunity}
                      onChange={(event) => updateField("snmpCommunity", event.target.value)}
                      placeholder="public"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.version")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.snmpVersion}
                      onChange={(event) => updateField("snmpVersion", event.target.value as "1" | "2c")}
                    >
                      <option value="2c">{t("newMonitor.snmp2c")}</option>
                      <option value="1">{t("newMonitor.snmp1")}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.port")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.snmpPort}
                      onChange={(event) => updateField("snmpPort", event.target.value)}
                      placeholder="161"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.customOids")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.snmpOids}
                      onChange={(event) => updateField("snmpOids", event.target.value)}
                      placeholder={t("newMonitor.customOidsPlaceholder")}
                    />
                  </label>
                </>
              ) : null}

              {form.type === "SYSTEM" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Host</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.host}
                      onChange={(event) => updateField("host", event.target.value)}
                      placeholder="10.8.0.1"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.community")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.snmpCommunity}
                      onChange={(event) => updateField("snmpCommunity", event.target.value)}
                      placeholder="public"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.version")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.snmpVersion}
                      onChange={(event) => updateField("snmpVersion", event.target.value as "1" | "2c")}
                    >
                      <option value="2c">{t("newMonitor.snmp2c")}</option>
                      <option value="1">{t("newMonitor.snmp1")}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.port")} <span className="font-normal text-slate-400">({t("newMonitor.optional")})</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.snmpPort}
                      onChange={(event) => updateField("snmpPort", event.target.value)}
                      placeholder="161"
                    />
                  </label>
                </>
              ) : null}

              {form.type === "DNS" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Host</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.host}
                      onChange={(event) => updateField("host", event.target.value)}
                      placeholder="example.com"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.recordType")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.dnsRecordType}
                      onChange={(event) => updateField("dnsRecordType", event.target.value)}
                    >
                      <option value="A">A</option>
                      <option value="AAAA">AAAA</option>
                      <option value="CNAME">CNAME</option>
                      <option value="MX">MX</option>
                      <option value="NS">NS</option>
                      <option value="TXT">TXT</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.dnsServer")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.dnsServer}
                      onChange={(event) => updateField("dnsServer", event.target.value)}
                      placeholder="8.8.8.8"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.expectedValue")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.dnsExpectedValue}
                      onChange={(event) => updateField("dnsExpectedValue", event.target.value)}
                      placeholder="Expected IP, hostname, TXT content, or MX exchange"
                    />
                  </label>
                </>
              ) : null}

              {form.type === "PING" ||
              form.type === "TCP" ||
              (form.type === "DATABASE" && !usesSqlite && !usesMongoUri) ? (
                <>
                  {form.type === "TCP" ? (
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">{t("newMonitor.servicePreset")}</span>
                      <select
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        value={form.tcpPreset}
                        onChange={(event) => {
                          const preset = TCP_PRESETS.find((p) => p.value === event.target.value);
                          updateField("tcpPreset", event.target.value);
                          if (preset && preset.port) updateField("port", preset.port);
                        }}
                      >
                        {TCP_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.port ? t("newMonitor.tcpPresetWithPort", { label: p.label, port: p.port }) : p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Host</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.host}
                      onChange={(event) => updateField("host", event.target.value)}
                      placeholder="10.10.0.1"
                      required={form.type === "PING" || form.type === "TCP" || (form.type === "DATABASE" && !usesMongoUri)}
                    />
                  </label>

                  {form.type !== "PING" ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t("newMonitor.port")}</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        type="number"
                        value={form.port}
                        onChange={(event) => updateField("port", event.target.value)}
                        placeholder="443"
                        required={form.type === "TCP" || (form.type === "DATABASE" && !usesMongoUri)}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              {form.type === "DATABASE" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.databaseType")}</span>
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
                      {form.databaseType === "sqlite" ? t("newMonitor.sqliteFilePath") : t("newMonitor.databaseName")}
                    </span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.database}
                      onChange={(event) => updateField("database", event.target.value)}
                      placeholder={form.databaseType === "sqlite" ? "C:\\data\\app.db" : "monitoring"}
                    />
                  </label>
                  {usesMongoDb ? (
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">{t("newMonitor.mongoUri")}</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        value={form.mongoUri}
                        onChange={(event) => updateField("mongoUri", event.target.value)}
                        placeholder="mongodb://user:password@172.17.234.1:27017/app?authSource=admin"
                      />
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.user")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.user}
                      onChange={(event) => updateField("user", event.target.value)}
                      placeholder="readonly"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.password")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="password"
                      value={form.password}
                      onChange={(event) => updateField("password", event.target.value)}
                    />
                  </label>
                  {usesMongoDb ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t("newMonitor.authSource")}</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        value={form.authSource}
                        onChange={(event) => updateField("authSource", event.target.value)}
                        placeholder="admin"
                      />
                    </label>
                  ) : null}
                  {usesSqlServer ? (
                    <>
                      <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          checked={form.encrypt}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                          type="checkbox"
                          onChange={(event) => updateField("encrypt", event.target.checked)}
                        />
                        <span className="text-sm font-medium text-slate-700">{t("newMonitor.encryptConnection")}</span>
                      </label>
                      <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <input
                          checked={form.trustServerCertificate}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                          type="checkbox"
                          onChange={(event) =>
                            updateField("trustServerCertificate", event.target.checked)
                          }
                        />
                        <span className="text-sm font-medium text-slate-700">
                          {t("newMonitor.trustServerCertificate")}
                        </span>
                      </label>
                    </>
                  ) : null}
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
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.apiKey")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.apiKey}
                      onChange={(event) => updateField("apiKey", event.target.value)}
                      required={!selectedCredentialId}
                    />
                  </label>
                  <div className="md:col-span-2 rounded-md border border-orange-100 bg-orange-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <label className="block flex-1">
                        <span className="text-sm font-medium text-slate-700">{t("newMonitor.cloudflareAccessCredential")}</span>
                        <select
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                          value={form.cfAccessCredentialId}
                          onChange={(event) => updateField("cfAccessCredentialId", event.target.value)}
                        >
                          <option value="">{t("newMonitor.dontUseCloudflareAccess")}</option>
                          {cloudflareAccessCredentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>
                              {credential.name} · {credential.username ? maskCredentialValue(credential.username) : t("newMonitor.noClientId")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Link
                        className="shrink-0 rounded-md border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                        to="/credentials"
                      >
                        {t("newMonitor.manageCredentials")}
                      </Link>
                    </div>
                    <p className="mt-2 text-xs text-orange-800">
                      {selectedCloudflareAccessCredential ? (
                        <>
                          <span className="font-semibold">{maskCredentialValue(selectedCloudflareAccessCredential.username)}</span>
                          <span> · {selectedCloudflareAccessCredential.notes || t("newMonitor.cloudflareAccessSelectedHint")}</span>
                        </>
                      ) : (
                        t("newMonitor.cloudflareAccessOptionalHint")
                      )}
                    </p>
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.endpointId")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.endpointId}
                      onChange={(event) => updateField("endpointId", event.target.value)}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Stack ID <span className="text-xs font-normal text-cyan-600">({t("newMonitor.recommended")})</span>
                    </span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.stackId}
                      onChange={(event) => updateField("stackId", event.target.value)}
                      placeholder={t("newMonitor.stackIdPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t("newMonitor.containerIdName")}</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.containerId}
                      onChange={(event) => updateField("containerId", event.target.value)}
                      placeholder={t("newMonitor.containerPlaceholder")}
                    />
                  </label>
                </>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("newMonitor.timeoutMs")}</span>
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
            <h2 className="text-sm font-semibold text-slate-950">{t("newMonitor.apiPayload")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t(getRequiredHintKey(form.type))}</p>

            <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(
                {
                  name: form.name || t("newMonitor.untitledMonitor"),
                  type: form.type,
                  interval: Number(form.interval),
                  enabled: form.enabled,
                  credentialId: selectedCredentialId || undefined,
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
            {isSubmitting ? t("newMonitor.creating") : t("newMonitor.createMonitor")}
          </button>
        </aside>
      </form>
    </div>
  );
};

export default AddMonitorPage;
