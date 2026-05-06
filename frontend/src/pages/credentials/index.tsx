import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/contexts/session.context";

type CredentialType = "SNMP_COMMUNITY" | "USERNAME_PASSWORD" | "API_TOKEN" | "SSH_KEY";
type MonitorType =
  | "PING"
  | "TCP"
  | "HTTP"
  | "TLS_CERT"
  | "DNS"
  | "SNMP"
  | "SYSTEM"
  | "DOCKER"
  | "DATABASE";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type CredentialRow = {
  id: string;
  name: string;
  type: CredentialType;
  username: string | null;
  secret: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  usageCount: number;
  monitors: Array<{
    id: string;
    name: string;
    type: MonitorType;
    enabled: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
};

type CredentialForm = {
  name: string;
  type: CredentialType;
  username: string;
  secret: string;
  notes: string;
  metadataText: string;
};

const credentialTypeLabels: Record<CredentialType, string> = {
  SNMP_COMMUNITY: "SNMP Community",
  USERNAME_PASSWORD: "Username / Password",
  API_TOKEN: "API Token",
  SSH_KEY: "SSH Key",
};

const monitorTypeLabels: Record<MonitorType, string> = {
  PING: "PING",
  TCP: "TCP",
  HTTP: "HTTP",
  TLS_CERT: "TLS Cert",
  DNS: "DNS",
  SNMP: "SNMP",
  SYSTEM: "System",
  DOCKER: "Docker",
  DATABASE: "Database",
};

const typeBadgeStyles: Record<CredentialType, string> = {
  SNMP_COMMUNITY: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  USERNAME_PASSWORD: "bg-violet-50 text-violet-700 ring-violet-600/20",
  API_TOKEN: "bg-amber-50 text-amber-700 ring-amber-600/20",
  SSH_KEY: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const credentialTypeGuides: Record<
  CredentialType,
  {
    summary: string;
    requiredFields: string[];
    optionalFields: string[];
    usedFor: string[];
  }
> = {
  SNMP_COMMUNITY: {
    summary: "ใช้เก็บ SNMP community string สำหรับ SNMP และ SYSTEM monitor",
    requiredFields: ["Name", "Secret (community string)"],
    optionalFields: ["Notes", "Metadata JSON เช่น version, port, vendor"],
    usedFor: ["SNMP monitor", "SYSTEM monitor"],
  },
  USERNAME_PASSWORD: {
    summary: "ใช้เก็บชุด username/password สำหรับ database, HTTP basic auth และงานที่ต้อง login",
    requiredFields: ["Name", "Username", "Secret (password)"],
    optionalFields: ["Notes", "Metadata JSON เช่น authSource, databaseType"],
    usedFor: ["Database monitor", "HTTP basic auth"],
  },
  API_TOKEN: {
    summary: "ใช้เก็บ token หรือ API key เช่น Bearer token หรือ Portainer API key",
    requiredFields: ["Name", "Secret (token / api key)"],
    optionalFields: ["Username", "Notes", "Metadata JSON เช่น header name, scope"],
    usedFor: ["HTTP bearer auth", "Docker / Portainer monitor"],
  },
  SSH_KEY: {
    summary: "ใช้เก็บ SSH private key เผื่อรอบถัดไปสำหรับ monitor หรือ agent flow ที่ต้องใช้ key",
    requiredFields: ["Name", "Secret (private key)"],
    optionalFields: ["Username", "Notes", "Metadata JSON เช่น port, passphrase hint"],
    usedFor: ["Future SSH-based monitor", "Future agent/bootstrap flow"],
  },
};

const secretFieldLabels: Record<
  CredentialType,
  {
    label: string;
    placeholder?: string;
    tableLabel: string;
    requiredText: string;
  }
> = {
  SNMP_COMMUNITY: {
    label: "Community",
    placeholder: "public",
    tableLabel: "Community",
    requiredText: "กรุณากรอกชื่อและ community ให้ครบ",
  },
  USERNAME_PASSWORD: {
    label: "Password",
    tableLabel: "Password",
    requiredText: "กรุณากรอกชื่อและ password ให้ครบ",
  },
  API_TOKEN: {
    label: "API Token",
    placeholder: "Paste token or API key",
    tableLabel: "API Token",
    requiredText: "กรุณากรอกชื่อและ API token ให้ครบ",
  },
  SSH_KEY: {
    label: "Private Key",
    placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----",
    tableLabel: "Private Key",
    requiredText: "กรุณากรอกชื่อและ private key ให้ครบ",
  },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

const maskSecretValue = (value: string) => {
  if (!value) return "-";
  if (value.includes("•")) return value;
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 2)}${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-2)}`;
};

const emptyForm = (): CredentialForm => ({
  name: "",
  type: "SNMP_COMMUNITY",
  username: "",
  secret: "",
  notes: "",
  metadataText: "{}",
});

const parseMetadataObject = (value: string) => {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
};

const CredentialsPage = () => {
  const { api } = useApi();
  const { user } = useSession();
  const isAdmin = (typeof user?.role === "string" ? user.role : user?.role?.name ?? "").toLowerCase() === "admin";
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingCredential, setEditingCredential] = useState<CredentialRow | null>(null);
  const [deletingCredential, setDeletingCredential] = useState<CredentialRow | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<CredentialForm>(() => emptyForm());
  const [guideType, setGuideType] = useState<CredentialType>("SNMP_COMMUNITY");

  const loadCredentials = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await api.get<ApiResponse<CredentialRow[]>>("/credentials");

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setCredentials(response.data.data);
    } catch {
      toast.error("โหลด credentials ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const summary = useMemo(() => {
    return {
      total: credentials.length,
      snmp: credentials.filter((item) => item.type === "SNMP_COMMUNITY").length,
      auth: credentials.filter((item) => item.type === "USERNAME_PASSWORD").length,
      token: credentials.filter((item) => item.type === "API_TOKEN" || item.type === "SSH_KEY")
        .length,
      linked: credentials.filter((item) => item.usageCount > 0).length,
    };
  }, [credentials]);

  const selectedGuide = credentialTypeGuides[guideType];
  const modalGuide = credentialTypeGuides[form.type];
  const secretField = secretFieldLabels[form.type];
  const parsedMetadata = useMemo(() => parseMetadataObject(form.metadataText), [form.metadataText]);
  const showUsernameField = form.type === "USERNAME_PASSWORD" || form.type === "SSH_KEY";
  const showSnmpSettings = form.type === "SNMP_COMMUNITY";

  const updateMetadataField = (key: string, value: unknown) => {
    const base = parsedMetadata ?? {};
    const next = { ...base };

    if (value === "" || value === undefined || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }

    setForm((current) => ({
      ...current,
      metadataText: JSON.stringify(next, null, 2),
    }));
  };

  const closeModal = () => {
    setIsCreateOpen(false);
    setEditingCredential(null);
    setForm(emptyForm());
  };

  const openCreate = () => {
    setEditingCredential(null);
    setForm(emptyForm());
    setIsCreateOpen(true);
  };

  const openEdit = (credential: CredentialRow) => {
    setIsCreateOpen(false);
    setEditingCredential(credential);
    setForm({
      name: credential.name,
      type: credential.type,
      username: credential.username ?? "",
      secret: credential.secret,
      notes: credential.notes ?? "",
      metadataText: JSON.stringify(credential.metadata ?? {}, null, 2),
    });
  };

  const handleSubmit = async () => {
    let metadata: Record<string, unknown> | undefined;

    try {
      const parsed = JSON.parse(form.metadataText || "{}") as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      } else {
        toast.error("Metadata ต้องเป็น JSON object");
        return;
      }
    } catch {
      toast.error("Metadata JSON ไม่ถูกต้อง");
      return;
    }

    if (!form.name.trim() || !form.secret.trim()) {
      toast.error(secretFieldLabels[form.type].requiredText);
      return;
    }

    if (form.type === "USERNAME_PASSWORD" && !form.username.trim()) {
      toast.error("Credential แบบ Username / Password ต้องกรอก username");
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type,
      username: form.username.trim() || undefined,
      secret: form.secret,
      notes: form.notes.trim() || undefined,
      metadata,
    };

    setBusyId(editingCredential?.id ?? "create");

    try {
      const response = editingCredential
        ? await api.patch<ApiResponse<CredentialRow>>(
            `/credentials/${editingCredential.id}`,
            payload,
          )
        : await api.post<ApiResponse<CredentialRow>>("/credentials", payload);

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success(editingCredential ? "อัปเดต credential แล้ว" : "สร้าง credential แล้ว");
      closeModal();
      await loadCredentials();
    } catch {
      toast.error(editingCredential ? "อัปเดต credential ไม่สำเร็จ" : "สร้าง credential ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingCredential) return;

    setBusyId(deletingCredential.id);

    try {
      const response = await api.delete<ApiResponse<{ message: string }>>(
        `/credentials/${deletingCredential.id}`,
      );

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      toast.success("ลบ credential แล้ว");
      setDeletingCredential(null);
      await loadCredentials();
    } catch {
      toast.error("ลบ credential ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleReveal = async (credential: CredentialRow) => {
    if (!isAdmin) return;

    if (revealedSecrets[credential.id]) {
      setRevealedSecrets((current) => {
        const next = { ...current };
        delete next[credential.id];
        return next;
      });
      return;
    }

    setRevealingId(credential.id);

    try {
      const response = await api.get<ApiResponse<{ secret: string }>>(
        `/credentials/${credential.id}/reveal`,
      );

      if (!response.data.success) {
        toast.error(response.data.message);
        return;
      }

      setRevealedSecrets((current) => ({
        ...current,
        [credential.id]: response.data.data.secret,
      }));
    } catch {
      toast.error("เปิดดู secret ไม่สำเร็จ");
    } finally {
      setRevealingId(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Credentials</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            เก็บ credential inventory แบบรวมศูนย์สำหรับ SNMP, SSH, API และ username/password
            เพื่อให้ monitor หลายตัว reuse ชุดเดียวกันได้ และดู usage ได้จากจุดเดียว
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            type="button"
            onClick={() => void loadCredentials()}
          >
            Refresh
          </button>
          <button
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="button"
            onClick={openCreate}
          >
            New Credential
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total", value: summary.total, tone: "text-slate-950" },
          { label: "SNMP", value: summary.snmp, tone: "text-cyan-700" },
          { label: "User / Pass", value: summary.auth, tone: "text-violet-700" },
          { label: "Linked", value: summary.linked, tone: "text-emerald-700" },
        ].map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Credential vault</h2>
            <p className="mt-1 text-xs text-slate-500">
              {isLoading ? "Loading..." : `${credentials.length} credentials loaded`}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            ใช้เป็น shared credential ได้แล้ว และจะแสดงว่าถูกผูกกับ monitor ไหนบ้าง
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Used by</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!isLoading && credentials.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={8}>
                    ยังไม่มี credential
                  </td>
                </tr>
              ) : null}

              {credentials.map((credential) => {
                const isRevealed = Boolean(revealedSecrets[credential.id]);
                const displayedSecret = isRevealed
                  ? revealedSecrets[credential.id]
                  : maskSecretValue(credential.secret);
                const isRevealBusy = revealingId === credential.id;

                return (
                  <tr className="transition hover:bg-slate-50" key={credential.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{credential.name}</div>
                      {credential.metadata && Object.keys(credential.metadata).length > 0 ? (
                        <div className="mt-1 text-xs text-slate-400">
                          metadata {Object.keys(credential.metadata).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${typeBadgeStyles[credential.type]}`}
                      >
                        {credentialTypeLabels[credential.type]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {credential.username || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          {displayedSecret}
                        </code>
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          onClick={() => void handleToggleReveal(credential)}
                          disabled={!isAdmin || isRevealBusy}
                        >
                          {isRevealBusy ? "..." : isRevealed ? "Hide" : "Show"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {credential.usageCount > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-slate-700">
                            Used by {credential.usageCount} monitor{credential.usageCount > 1 ? "s" : ""}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {credential.monitors.slice(0, 4).map((monitor) => (
                              <Link
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                                key={monitor.id}
                                to={`/monitors/${monitor.id}`}
                                title={`${monitor.name} · ${monitorTypeLabels[monitor.type]}${monitor.enabled ? "" : " · disabled"}`}
                              >
                                <span className={monitor.enabled ? "text-emerald-600" : "text-slate-400"}>
                                  ●
                                </span>
                                <span>{monitor.name}</span>
                                <span className="text-slate-400">{monitorTypeLabels[monitor.type]}</span>
                              </Link>
                            ))}
                            {credential.usageCount > 4 ? (
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                                +{credential.usageCount - 4} more
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">ยังไม่ถูกผูกกับ monitor</span>
                      )}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-slate-500">
                      <div className="truncate" title={credential.notes ?? undefined}>
                        {credential.notes || "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(credential.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          type="button"
                          onClick={() => openEdit(credential)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                          type="button"
                          onClick={() => setDeletingCredential(credential)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Credential type guide</h2>
            <p className="mt-1 text-sm text-slate-500">
              แต่ละประเภทใช้ไม่เหมือนกัน และตอนสร้าง monitor จะเลือกได้เฉพาะประเภทที่เกี่ยวข้อง
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              Object.keys(credentialTypeLabels) as CredentialType[]
            ).map((type) => {
              const active = guideType === type;
              return (
                <button
                  key={type}
                  type="button"
                  className={[
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                      : "border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-100",
                  ].join(" ")}
                  onClick={() => setGuideType(type)}
                >
                  {credentialTypeLabels[type]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">{selectedGuide.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {selectedGuide.requiredFields.map((field) => (
                  <li key={field}>- {field}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {selectedGuide.optionalFields.map((field) => (
                  <li key={field}>- {field}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Used In</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {selectedGuide.usedFor.map((field) => (
                  <li key={field}>- {field}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {(isCreateOpen || editingCredential) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editingCredential ? "Edit credential" : "Create credential"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                เก็บข้อมูลการเชื่อมต่อสำหรับใช้อ้างอิงซ้ำใน monitor หลายตัว
              </p>
            </div>

            <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-4 text-sm sm:col-span-2">
                <p className="font-medium text-cyan-900">{modalGuide.summary}</p>
                <p className="mt-2 text-cyan-800">
                  Required: {modalGuide.requiredFields.join(", ")}
                </p>
                <p className="mt-1 text-cyan-700">
                  Used in: {modalGuide.usedFor.join(", ")}
                </p>
              </div>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Type</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as CredentialType,
                    }))
                  }
                >
                  {Object.entries(credentialTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {showUsernameField ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Username
                    {form.type === "USERNAME_PASSWORD" ? (
                      <span className="ml-1 text-rose-500">*</span>
                    ) : (
                      <span className="ml-1 font-normal text-slate-400">(optional)</span>
                    )}
                  </span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    type="text"
                    value={form.username}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, username: event.target.value }))
                    }
                  />
                </label>
              ) : null}

              {showSnmpSettings ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">SNMP Version</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      value={
                        typeof parsedMetadata?.version === "string" &&
                        (parsedMetadata.version === "1" || parsedMetadata.version === "2c")
                          ? parsedMetadata.version
                          : "2c"
                      }
                      onChange={(event) => updateMetadataField("version", event.target.value)}
                    >
                      <option value="2c">2c</option>
                      <option value="1">1</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">SNMP Port</span>
                    <input
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      type="number"
                      min={1}
                      value={typeof parsedMetadata?.port === "number" ? String(parsedMetadata.port) : "161"}
                      onChange={(event) =>
                        updateMetadataField(
                          "port",
                          event.target.value.trim() ? Number(event.target.value) : undefined,
                        )
                      }
                    />
                  </label>
                </>
              ) : null}

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  {secretField.label} <span className="ml-1 text-rose-500">*</span>
                </span>
                <textarea
                  className="mt-2 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  placeholder={secretField.placeholder}
                  value={form.secret}
                  onChange={(event) => setForm((current) => ({ ...current, secret: event.target.value }))}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Notes</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Metadata JSON</span>
                <textarea
                  className="mt-2 min-h-44 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  value={form.metadataText}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, metadataText: event.target.value }))
                  }
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={closeModal}
                disabled={busyId !== null}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busyId !== null}
              >
                {editingCredential ? "Save changes" : "Create credential"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingCredential ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Delete credential</h2>
              <p className="mt-1 text-sm text-slate-500">
                ถ้ารายการนี้ถูกใช้อยู่ monitor ที่ผูกอยู่จะถูกถอด credential ออกอัตโนมัติ
              </p>
            </div>

            <div className="p-5 text-sm text-slate-600">
              <p>
                ต้องการลบ <span className="font-semibold text-slate-950">{deletingCredential.name}</span>{" "}
                ใช่ไหม?
              </p>
              {deletingCredential.usageCount > 0 ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
                  <div className="font-semibold">
                    กำลังถูกใช้โดย {deletingCredential.usageCount} monitor
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {deletingCredential.monitors.map((monitor) => (
                      <Link
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-1 text-xs transition hover:border-amber-300 hover:bg-amber-100"
                        key={monitor.id}
                        to={`/monitors/${monitor.id}`}
                      >
                        <span>{monitor.name}</span>
                        <span className="text-amber-700">{monitorTypeLabels[monitor.type]}</span>
                      </Link>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-amber-800">
                    หลังลบแล้ว monitor เหล่านี้ยังอยู่ แต่จะไม่อ้าง credential นี้อีก
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => setDeletingCredential(null)}
                disabled={busyId === deletingCredential.id}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleDelete()}
                disabled={busyId === deletingCredential.id}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CredentialsPage;
