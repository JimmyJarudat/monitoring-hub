import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type ChannelType = "LINE" | "SLACK" | "DISCORD" | "EMAIL" | "TELEGRAM";

type ChannelRow = {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  createdAt: string;
  config: {
    webhookUrl?: string;
    chatId?: string;
    botTokenMasked?: string;
    to?: string;
    channelAccessTokenMasked?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    from?: string;
    passwordMasked?: string;
  };
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type ChannelForm = {
  name: string;
  type: ChannelType;
  webhookUrl: string;
  botToken: string;
  chatId: string;
  lineChannelAccessToken: string;
  lineTo: string;
  emailHost: string;
  emailPort: string;
  emailSecure: boolean;
  emailUsername: string;
  emailPassword: string;
  emailFrom: string;
  emailTo: string;
  enabled: boolean;
};

const channelTypeLabels: Record<ChannelType, string> = {
  LINE: "LINE Messaging API",
  SLACK: "Slack Webhook",
  DISCORD: "Discord Webhook",
  EMAIL: "Email SMTP",
  TELEGRAM: "Telegram Bot",
};

const emptyForm = (): ChannelForm => ({
  name: "",
  type: "TELEGRAM",
  webhookUrl: "",
  botToken: "",
  chatId: "",
  lineChannelAccessToken: "",
  lineTo: "",
  emailHost: "",
  emailPort: "587",
  emailSecure: false,
  emailUsername: "",
  emailPassword: "",
  emailFrom: "",
  emailTo: "",
  enabled: true,
});

const ChannelsPage = () => {
  const { api } = useApi();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingDraft, setTestingDraft] = useState(false);
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [form, setForm] = useState<ChannelForm>(() => emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ChannelRow[]>>("/channels");
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setChannels(res.data.data);
    } catch {
      toast.error("โหลด notification channels ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  };

  const openEdit = (channel: ChannelRow) => {
    setEditing(channel);
    setForm({
      name: channel.name,
      type: channel.type,
      webhookUrl: channel.config.webhookUrl ?? "",
      botToken: "",
      chatId: channel.config.chatId ?? "",
      lineChannelAccessToken: "",
      lineTo: channel.config.to ?? "",
      emailHost: channel.config.host ?? "",
      emailPort: channel.config.port ? String(channel.config.port) : "587",
      emailSecure: Boolean(channel.config.secure),
      emailUsername: channel.config.username ?? "",
      emailPassword: "",
      emailFrom: channel.config.from ?? "",
      emailTo: channel.config.to ?? "",
      enabled: channel.enabled,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error("กรุณากรอกชื่อ channel");
      return false;
    }
    if (form.type === "TELEGRAM") {
      if (!form.botToken.trim() && !editing) {
        toast.error("กรุณากรอก Telegram bot token");
        return false;
      }
      if (!form.chatId.trim()) {
        toast.error("กรุณากรอก Telegram chat id");
        return false;
      }
      return true;
    }
    if (form.type === "LINE") {
      if (!form.lineChannelAccessToken.trim() && !editing) {
        toast.error("กรุณากรอก LINE channel access token");
        return false;
      }
      if (!form.lineTo.trim()) {
        toast.error("กรุณากรอก LINE userId/groupId");
        return false;
      }
      return true;
    }
    if (form.type === "EMAIL") {
      if (
        !form.emailHost.trim() ||
        !form.emailPort.trim() ||
        !form.emailUsername.trim() ||
        (!form.emailPassword.trim() && !editing) ||
        !form.emailFrom.trim() ||
        !form.emailTo.trim()
      ) {
        toast.error("กรุณากรอกข้อมูล SMTP ให้ครบ");
        return false;
      }
      return true;
    }
    if (!form.webhookUrl.trim()) {
      toast.error("กรุณากรอก webhook URL");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
        webhookUrl: form.webhookUrl.trim() || undefined,
        botToken: form.botToken.trim() || undefined,
        chatId: form.chatId.trim() || undefined,
        lineChannelAccessToken: form.lineChannelAccessToken.trim() || undefined,
        lineTo: form.lineTo.trim() || undefined,
        emailHost: form.emailHost.trim() || undefined,
        emailPort: form.emailPort.trim() ? Number(form.emailPort) : undefined,
        emailSecure: form.emailSecure,
        emailUsername: form.emailUsername.trim() || undefined,
        emailPassword: form.emailPassword.trim() || undefined,
        emailFrom: form.emailFrom.trim() || undefined,
        emailTo: form.emailTo.trim() || undefined,
      };
      const res = editing
        ? await api.patch<ApiResponse<ChannelRow>>(`/channels/${editing.id}`, payload)
        : await api.post<ApiResponse<ChannelRow>>("/channels", payload);

      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success(editing ? "อัปเดต channel แล้ว" : "สร้าง channel แล้ว");
      closeModal();
      await loadChannels();
    } catch {
      toast.error("บันทึก channel ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleTestDraft = async () => {
    if (!validateForm()) return;
    setTestingDraft(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
        webhookUrl: form.webhookUrl.trim() || undefined,
        botToken: form.botToken.trim() || undefined,
        chatId: form.chatId.trim() || undefined,
        lineChannelAccessToken: form.lineChannelAccessToken.trim() || undefined,
        lineTo: form.lineTo.trim() || undefined,
        emailHost: form.emailHost.trim() || undefined,
        emailPort: form.emailPort.trim() ? Number(form.emailPort) : undefined,
        emailSecure: form.emailSecure,
        emailUsername: form.emailUsername.trim() || undefined,
        emailPassword: form.emailPassword.trim() || undefined,
        emailFrom: form.emailFrom.trim() || undefined,
        emailTo: form.emailTo.trim() || undefined,
      };
      const res = await api.post<ApiResponse<{ message: string }>>("/channels/test-draft", payload);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("ส่ง test จากฟอร์มแล้ว");
    } catch {
      toast.error("ส่ง test จากฟอร์มไม่สำเร็จ");
    } finally {
      setTestingDraft(false);
    }
  };

  const handleDelete = async (channel: ChannelRow) => {
    if (!window.confirm(`ต้องการลบ channel "${channel.name}" ใช่ไหม`)) return;
    try {
      const res = await api.delete<ApiResponse<{ message: string }>>(`/channels/${channel.id}`);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("ลบ channel แล้ว");
      await loadChannels();
    } catch {
      toast.error("ลบ channel ไม่สำเร็จ");
    }
  };

  const handleTest = async (channel: ChannelRow) => {
    setTestingId(channel.id);
    try {
      const res = await api.post<ApiResponse<{ message: string }>>(`/channels/${channel.id}/test`);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("ส่ง test message แล้ว");
    } catch {
      toast.error("ส่ง test message ไม่สำเร็จ");
    } finally {
      setTestingId(null);
    }
  };

  const summary = useMemo(
    () => ({
      total: channels.length,
      enabled: channels.filter((channel) => channel.enabled).length,
      telegram: channels.filter((channel) => channel.type === "TELEGRAM").length,
    }),
    [channels],
  );

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Alerting</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Notification Channels</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ตั้งค่าช่องทางแจ้งเตือนสำหรับ incident open/resolved โดยรองรับ Telegram และ webhook
            channel อื่น ๆ
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadChannels()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            New Channel
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total channels" value={summary.total} tone="text-slate-950" />
        <SummaryCard label="Enabled" value={summary.enabled} tone="text-emerald-700" />
        <SummaryCard label="Telegram" value={summary.telegram} tone="text-cyan-700" />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Configured channels</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Loading..." : `${channels.length} channels`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && channels.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    ยังไม่มี notification channel
                  </td>
                </tr>
              ) : null}
              {channels.map((channel) => (
                <tr key={channel.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{channel.name}</td>
                  <td className="px-4 py-3 text-slate-700">{channelTypeLabels[channel.type]}</td>
                  <td className="max-w-md px-4 py-3 text-slate-600">
                    {channel.type === "TELEGRAM" ? (
                      <div className="max-w-md">
                        <p className="truncate text-xs" title={`chatId: ${channel.config.chatId ?? ""}`}>
                          chatId: {channel.config.chatId}
                        </p>
                        <p
                          className="truncate font-mono text-xs text-slate-500"
                          title={`token: ${channel.config.botTokenMasked ?? ""}`}
                        >
                          token: {channel.config.botTokenMasked}
                        </p>
                      </div>
                    ) : channel.type === "LINE" ? (
                      <div className="max-w-md">
                        <p className="truncate text-xs" title={`to: ${channel.config.to ?? ""}`}>
                          to: {channel.config.to}
                        </p>
                        <p
                          className="truncate font-mono text-xs text-slate-500"
                          title={`token: ${channel.config.channelAccessTokenMasked ?? ""}`}
                        >
                          token: {channel.config.channelAccessTokenMasked}
                        </p>
                      </div>
                    ) : channel.type === "EMAIL" ? (
                      <div className="max-w-md">
                        <p
                          className="truncate text-xs"
                          title={`${channel.config.host}:${channel.config.port} (${channel.config.secure ? "SSL" : "STARTTLS/Plain"})`}
                        >
                          {channel.config.host}:{channel.config.port} ({channel.config.secure ? "SSL" : "STARTTLS/Plain"})
                        </p>
                        <p
                          className="truncate text-xs text-slate-500"
                          title={`${channel.config.from} -> ${channel.config.to}`}
                        >
                          {channel.config.from} {"->"} {channel.config.to}
                        </p>
                      </div>
                    ) : (
                      <p className="max-w-md truncate text-xs" title={channel.config.webhookUrl || ""}>
                        {channel.config.webhookUrl || "-"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        channel.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {channel.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTest(channel)}
                        disabled={testingId === channel.id}
                        className="rounded-md border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-60"
                      >
                        {testingId === channel.id ? "Testing..." : "Test"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(channel)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(channel)}
                        className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editing ? "Edit channel" : "Create channel"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">เมื่อมี incident จะส่งแจ้งเตือนผ่าน channel นี้</p>
            </div>
            <div className="grid gap-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Type</span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value as ChannelType }))
                  }
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {(Object.keys(channelTypeLabels) as ChannelType[]).map((type) => (
                    <option key={type} value={type}>
                      {channelTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </label>
              {form.type === "TELEGRAM" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Telegram Bot Token</span>
                    <input
                      type="text"
                      placeholder={editing ? "เว้นว่างถ้าไม่เปลี่ยน token" : "123456:ABC..."}
                      value={form.botToken}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, botToken: event.target.value }))
                      }
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Chat ID</span>
                    <input
                      type="text"
                      placeholder="-1001234567890"
                      value={form.chatId}
                      onChange={(event) => setForm((current) => ({ ...current, chatId: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </label>
                </>
              ) : form.type === "LINE" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Channel Access Token</span>
                    <input
                      type="text"
                      placeholder={editing ? "เว้นว่างถ้าไม่เปลี่ยน token" : "LINE channel access token"}
                      value={form.lineChannelAccessToken}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, lineChannelAccessToken: event.target.value }))
                      }
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Target userId/groupId</span>
                    <input
                      type="text"
                      placeholder="Uxxxxxxxx / Cxxxxxxxx / Gxxxxxxxx"
                      value={form.lineTo}
                      onChange={(event) => setForm((current) => ({ ...current, lineTo: event.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  </label>
                </>
              ) : form.type === "EMAIL" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">SMTP Host</span>
                      <input
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={form.emailHost}
                        onChange={(event) => setForm((current) => ({ ...current, emailHost: event.target.value }))}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">SMTP Port</span>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={form.emailPort}
                        onChange={(event) => setForm((current) => ({ ...current, emailPort: event.target.value }))}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Username</span>
                      <input
                        type="text"
                        value={form.emailUsername}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, emailUsername: event.target.value }))
                        }
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Password / App Password</span>
                      <input
                        type="password"
                        placeholder={editing ? "เว้นว่างถ้าไม่เปลี่ยน password" : ""}
                        value={form.emailPassword}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, emailPassword: event.target.value }))
                        }
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">From</span>
                      <input
                        type="email"
                        placeholder="monitoring@example.com"
                        value={form.emailFrom}
                        onChange={(event) => setForm((current) => ({ ...current, emailFrom: event.target.value }))}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">To</span>
                      <input
                        type="text"
                        placeholder="oncall@example.com,team@example.com"
                        value={form.emailTo}
                        onChange={(event) => setForm((current) => ({ ...current, emailTo: event.target.value }))}
                        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </label>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.emailSecure}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, emailSecure: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    Use SSL/TLS (`secure`)
                  </label>
                </>
              ) : (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Webhook URL</span>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.webhookUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, webhookUrl: event.target.value }))
                    }
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </label>
              )}
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                Enable channel
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                disabled={testingDraft || saving}
                onClick={() => void handleTestDraft()}
                className="rounded-md border border-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-60"
              >
                {testingDraft ? "Testing..." : "Test config"}
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : editing ? "Save changes" : "Create channel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const SummaryCard = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-3 text-2xl font-semibold ${tone}`}>{value.toLocaleString()}</p>
  </div>
);

export default ChannelsPage;
