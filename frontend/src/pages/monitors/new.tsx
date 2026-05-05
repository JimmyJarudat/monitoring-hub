import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "DOCKER" | "DATABASE";

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
  {
    label: "TLS Certificate",
    value: "TLS_CERT",
    description: "Check certificate expiry and warn before expiration",
  },
  {
    label: "DNS",
    value: "DNS",
    description: "Resolve DNS records and optionally match an expected value",
  },
  { label: "Docker", value: "DOCKER", description: "Check Portainer endpoint or container" },
  { label: "Database", value: "DATABASE", description: "Check database connection health" },
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
    summary: "ส่ง HTTP request แล้วตรวจสอบ status code, body, header และความเร็ว",
    fields: [
      { name: "URL", desc: "ที่อยู่ที่ต้องการเช็ค เช่น https://example.com/health", required: true },
      { name: "Method", desc: "GET สำหรับดึงข้อมูล · HEAD ถ้าไม่ต้องการ body · POST สำหรับ API ที่รับ request" },
      { name: "Expected status", desc: "HTTP status ที่คาดว่าจะได้ เช่น 200 = OK · 201 = Created · 204 = No Content" },
      { name: "Auth type", desc: "Basic = username/password · Bearer = API token หรือ JWT" },
      { name: "Expected body text", desc: 'ข้อความที่ต้องมีใน response เช่น "ok" หรือ "healthy" — ถ้าไม่มีจะ DEGRADED' },
      { name: "JSON path", desc: 'เช็คค่าใน JSON response เช่น $.status หรือ $.data.items[0].state' },
      { name: "JSON expected value", desc: 'ค่าที่คาดว่าจะได้จาก JSON path เช่น "ok" หรือ "true"' },
      { name: "Expected header", desc: "ชื่อ header เช่น content-type และค่าที่คาดว่าจะได้ เช่น application/json" },
      { name: "Latency threshold ms", desc: "ถ้า response ช้ากว่านี้จะ DEGRADED เช่น 2000 = ช้ากว่า 2 วินาที" },
      { name: "Follow redirects", desc: "เปิด = ตาม redirect อัตโนมัติ · ปิด = หยุดที่ 3xx แล้วเช็ค status นั้น" },
    ],
    tip: "เหมาะกับ API health endpoint เช่น /health /ping /status และ web page ที่ต้องการเช็ค content",
  },
  PING: {
    summary: "ส่ง ICMP ping ไปยัง host แล้วดูว่าตอบกลับหรือไม่",
    fields: [
      { name: "Host", desc: "IP address หรือ hostname เช่น 192.168.1.1 หรือ router.local", required: true },
      { name: "Timeout ms", desc: "รอนานแค่ไหน ถ้าเกินจะ DOWN เช่น 5000 = 5 วินาที" },
    ],
    tip: "ใช้เช็คว่าอุปกรณ์ยังเปิดอยู่ไหม ไม่ได้เช็คว่า service ทำงานได้ — ควรใช้คู่กับ TCP หรือ HTTP",
  },
  TCP: {
    summary: "เปิด TCP connection ไปยัง host:port แล้วดูว่าเชื่อมต่อได้หรือไม่",
    fields: [
      { name: "Service preset", desc: "เลือก service สำเร็จรูป port จะ auto-fill เช่น SSH = 22 · RDP = 3389 · SMTP = 25" },
      { name: "Host", desc: "IP address หรือ hostname ของ server", required: true },
      { name: "Port", desc: "TCP port ที่ต้องการเช็ค", required: true },
      { name: "Timeout ms", desc: "รอ connection นานแค่ไหน" },
    ],
    tip: "เหมาะกับเช็คว่า SSH, RDP, database port เปิดอยู่ไหม — ไม่ได้เช็คว่า login ได้",
  },
  TLS_CERT: {
    summary: "เชื่อมต่อ HTTPS แล้วตรวจสอบ SSL/TLS certificate ว่าใกล้หมดอายุหรือไม่",
    fields: [
      { name: "URL", desc: "ที่อยู่ https เช่น https://example.com — ต้องขึ้นต้นด้วย https://", required: true },
      { name: "Warning days", desc: "เตือนล่วงหน้ากี่วันก่อน cert หมดอายุ เช่น 30 = เตือนก่อน 1 เดือน" },
    ],
    tip: "ถ้า cert หมดอายุแล้วจะ DOWN · ถ้าใกล้หมดตาม warning days จะ DEGRADED · ถ้ายังเหลือนานจะ UP",
  },
  DNS: {
    summary: "ส่ง DNS query แล้วตรวจสอบว่า domain resolve ได้และได้ค่าที่ถูกต้อง",
    fields: [
      { name: "Host", desc: "domain ที่ต้องการ resolve เช่น n8n.example.com — ต้องเป็นชื่อเต็ม ไม่ใช่ root domain ที่ไม่มี record", required: true },
      { name: "Record type", desc: "A = IPv4 · AAAA = IPv6 · CNAME = alias · MX = email server · NS = nameserver · TXT = text" },
      { name: "Expected value", desc: "ค่าที่คาดว่าจะ resolve ได้ เช่น IP address — ถ้าไม่ตรงจะ DEGRADED" },
      { name: "DNS server", desc: "ระบุ DNS server เฉพาะ เช่น 1.1.1.1 — ถ้าว่างจะใช้ system default" },
    ],
    tip: "ถ้า domain ไม่มี record จะ DOWN ทันที — ต้องใช้ subdomain เช่น api.example.com ไม่ใช่ example.com",
  },
  DOCKER: {
    summary: "เชื่อมต่อ Portainer แล้วตรวจสอบสถานะ endpoint หรือ container เฉพาะตัว",
    fields: [
      { name: "Portainer URL", desc: "ที่อยู่ Portainer เช่น https://portainer.example.com หรือ http://192.168.1.1:9000", required: true },
      { name: "API key", desc: "สร้างได้ที่ Portainer → User settings → Access tokens", required: true },
      { name: "Endpoint ID", desc: "ID ของ environment ใน Portainer ดูได้จาก URL เช่น /#!/1/docker → ID = 1", required: true },
      { name: "Container ID", desc: "ถ้าว่างจะเช็ค endpoint health ทั้งหมด · ถ้าระบุจะเช็ค container นั้นเฉพาะ" },
    ],
    tip: "Container ID หาได้จาก Portainer → Containers แล้วดูที่ column ID หรือ URL",
  },
  DATABASE: {
    summary: "เปิด connection ไปยัง database แล้วรัน query ง่ายๆ เพื่อเช็คว่า database ตอบสนอง",
    fields: [
      { name: "Database type", desc: "เลือกประเภท database ที่ต้องการเช็ค", required: true },
      { name: "Host / Port", desc: "ที่อยู่ database server เช่น 192.168.1.1 port 5432", required: true },
      { name: "User / Password", desc: "แนะนำสร้าง read-only user เฉพาะสำหรับ monitor — ไม่ควรใช้ admin" },
      { name: "Database name", desc: "ชื่อ database ที่ต้องการ connect" },
      { name: "MongoDB URI", desc: "ถ้าระบุ URI จะใช้แทน host/port/user/password ทั้งหมด เช่น mongodb://user:pass@host:27017/db" },
    ],
    tip: "แนะนำใช้ read-only user ที่มีสิทธิ์น้อยที่สุด เช่น SELECT เท่านั้น ไม่ควรใช้ admin credential",
  },
};

const getRequiredHint = (type: MonitorType) => {
  if (type === "PING") return "Required: host";
  if (type === "TCP") return "Required: host, port";
  if (type === "HTTP") return "Required: url. Optional: auth, body/header check, latency threshold";
  if (type === "TLS_CERT") return "Required: url. Optional: warning days";
  if (type === "DNS") return "Required: host. Optional: record type, expected value, DNS server";
  if (type === "DOCKER") return "Required: portainerUrl, apiKey, endpointId";
  return "Required: database type, host, port. SQLite uses file path. MongoDB can use URI or authSource.";
};

const AddMonitorPage = () => {
  const navigate = useNavigate();
  const { post } = useApi();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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
      navigate("/monitors", { replace: true });
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
          to="/monitors"
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">{selectedType.label} config</h2>
                <p className="mt-0.5 text-sm text-slate-500">{selectedType.description}</p>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                onClick={() => setShowGuide((v) => !v)}
              >
                <span>{showGuide ? "▲" : "▼"}</span>
                คำแนะนำการใช้งาน
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
                          <span className="rounded bg-cyan-200 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">required</span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">optional</span>
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
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Auth type <span className="font-normal text-slate-400">(optional)</span></span>
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
                    <span className="text-sm font-medium text-slate-700">Follow redirects</span>
                  </label>
                  {form.httpAuthType === "basic" ? (
                    <>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Username</span>
                        <input
                          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                          value={form.httpAuthUsername}
                          onChange={(event) => updateField("httpAuthUsername", event.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Password</span>
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
                    <span className="text-sm font-medium text-slate-700">Expected body text <span className="font-normal text-slate-400">(optional)</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedBodyText}
                      onChange={(event) => updateField("httpExpectedBodyText", event.target.value)}
                      placeholder="ข้อความที่ต้องมีใน response body เช่น ok, healthy"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Expected header name <span className="font-normal text-slate-400">(optional)</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedHeaderKey}
                      onChange={(event) => updateField("httpExpectedHeaderKey", event.target.value)}
                      placeholder="content-type"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Expected header value <span className="font-normal text-slate-400">(optional)</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpExpectedHeaderValue}
                      onChange={(event) => updateField("httpExpectedHeaderValue", event.target.value)}
                      placeholder="application/json"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Latency threshold ms <span className="font-normal text-slate-400">(optional)</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      value={form.httpLatencyThresholdMs}
                      onChange={(event) => updateField("httpLatencyThresholdMs", event.target.value)}
                      placeholder="DEGRADED ถ้า response ช้ากว่านี้ เช่น 2000"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">JSON path <span className="font-normal text-slate-400">(optional)</span></span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.httpJsonPath}
                      onChange={(event) => updateField("httpJsonPath", event.target.value)}
                      placeholder="$.status"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">JSON expected value <span className="font-normal text-slate-400">(optional)</span></span>
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
                    <span className="text-sm font-medium text-slate-700">Warning days</span>
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
                    <span className="text-sm font-medium text-slate-700">Record type</span>
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
                    <span className="text-sm font-medium text-slate-700">DNS server</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={form.dnsServer}
                      onChange={(event) => updateField("dnsServer", event.target.value)}
                      placeholder="8.8.8.8"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Expected value</span>
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
                      <span className="text-sm font-medium text-slate-700">Service preset</span>
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
                            {p.port ? `${p.label} — port ${p.port}` : p.label}
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
                      <span className="text-sm font-medium text-slate-700">Port</span>
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
                  {usesMongoDb ? (
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">MongoDB URI</span>
                      <input
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                        value={form.mongoUri}
                        onChange={(event) => updateField("mongoUri", event.target.value)}
                        placeholder="mongodb://user:password@172.17.234.1:27017/app?authSource=admin"
                      />
                    </label>
                  ) : null}
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
                  {usesMongoDb ? (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Auth source</span>
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
                        <span className="text-sm font-medium text-slate-700">Encrypt connection</span>
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
                          Trust server certificate
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
