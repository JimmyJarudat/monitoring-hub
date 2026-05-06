import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type MonitorType = "PING" | "TCP" | "HTTP" | "TLS_CERT" | "DNS" | "SNMP" | "SYSTEM" | "DOCKER" | "DATABASE";
type AlertOperator = "GT" | "LT" | "EQ" | "NEQ";
type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
type ChannelType = "LINE" | "SLACK" | "DISCORD" | "EMAIL" | "TELEGRAM" | "WEBHOOK";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type ChannelOption = {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
};

type MonitorOption = {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
};

type AlertRuleRow = {
  id: string;
  monitorId: string;
  metric: string;
  operator: AlertOperator;
  threshold: number;
  severity: AlertSeverity;
  enabled: boolean;
  createdAt: string;
  monitor: MonitorOption;
  channels: Array<{ channel: ChannelOption }>;
  openIncident: {
    id: string;
    status: "OPEN" | "RESOLVED";
    message: string;
    startedAt: string;
  } | null;
};

type RuleForm = {
  monitorId: string;
  metric: string;
  operator: AlertOperator;
  threshold: string;
  severity: AlertSeverity;
  enabled: boolean;
  channelIds: string[];
};

type MetricOption = {
  value: string;
  label: string;
  defaultThreshold: number;
  defaultOperator: AlertOperator;
};

const baseMetrics: MetricOption[] = [
  { value: "status", label: "Status", defaultThreshold: 2, defaultOperator: "LT" },
  { value: "response_time", label: "Response time", defaultThreshold: 1000, defaultOperator: "GT" },
];

const deviceMetrics: MetricOption[] = [
  { value: "cpu.used_pct", label: "CPU threshold", defaultThreshold: 85, defaultOperator: "GT" },
  { value: "memory.used_pct", label: "RAM threshold", defaultThreshold: 85, defaultOperator: "GT" },
  { value: "disk.used_pct", label: "Disk threshold", defaultThreshold: 90, defaultOperator: "GT" },
];

const operatorLabels: Record<AlertOperator, string> = {
  GT: ">",
  LT: "<",
  EQ: "=",
  NEQ: "!=",
};

const severityClasses: Record<AlertSeverity, string> = {
  INFO: "bg-sky-50 text-sky-700",
  WARNING: "bg-amber-50 text-amber-700",
  CRITICAL: "bg-rose-50 text-rose-700",
};

const channelTypeLabels: Record<ChannelType, string> = {
  LINE: "LINE",
  SLACK: "Slack",
  DISCORD: "Discord",
  EMAIL: "Email",
  TELEGRAM: "Telegram",
  WEBHOOK: "Webhook",
};

const metricLabel = (metric: string) =>
  [...baseMetrics, ...deviceMetrics].find((option) => option.value === metric)?.label ?? metric;

const isDeviceMonitor = (monitor?: MonitorOption | null) =>
  monitor?.type === "SYSTEM" || monitor?.type === "SNMP";

const getMetricOptions = (monitor?: MonitorOption | null) =>
  isDeviceMonitor(monitor) ? [...baseMetrics, ...deviceMetrics] : baseMetrics;

const emptyForm = (monitors: MonitorOption[]): RuleForm => {
  const monitor = monitors[0] ?? null;
  const metric = getMetricOptions(monitor)[0] ?? baseMetrics[0];

  return {
    monitorId: monitor?.id ?? "",
    metric: metric.value,
    operator: metric.defaultOperator,
    threshold: String(metric.defaultThreshold),
    severity: "WARNING",
    enabled: true,
    channelIds: [],
  };
};

const formatThreshold = (metric: string, threshold: number) => {
  if (metric === "status") {
    const labels: Record<number, string> = { 1: "DOWN", 2: "DEGRADED", 3: "UP" };
    return labels[threshold] ?? String(threshold);
  }
  if (metric === "response_time") return `${threshold} ms`;
  if (metric.endsWith("_pct")) return `${threshold}%`;
  return String(threshold);
};

const AlertsPage = () => {
  const { api } = useApi();
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AlertRuleRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(() => emptyForm([]));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, monitorsRes, channelsRes] = await Promise.all([
        api.get<ApiResponse<AlertRuleRow[]>>("/alert-rules"),
        api.get<ApiResponse<MonitorOption[]>>("/monitors"),
        api.get<ApiResponse<ChannelOption[]>>("/channels"),
      ]);

      if (!rulesRes.data.success) {
        toast.error(rulesRes.data.message);
        return;
      }
      if (!monitorsRes.data.success) {
        toast.error(monitorsRes.data.message);
        return;
      }
      if (!channelsRes.data.success) {
        toast.error(channelsRes.data.message);
        return;
      }

      setRules(rulesRes.data.data);
      setMonitors(monitorsRes.data.data);
      setChannels(channelsRes.data.data);
    } catch {
      toast.error("โหลด alert rules ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(
    () => ({
      total: rules.length,
      enabled: rules.filter((rule) => rule.enabled).length,
      open: rules.filter((rule) => rule.openIncident).length,
      device: rules.filter((rule) => rule.metric.endsWith("_pct")).length,
    }),
    [rules],
  );

  const selectedMonitor = useMemo(
    () => monitors.find((monitor) => monitor.id === form.monitorId) ?? null,
    [form.monitorId, monitors],
  );

  const metricOptions = useMemo(() => getMetricOptions(selectedMonitor), [selectedMonitor]);

  const openCreate = (metricValue?: string) => {
    const needsDeviceMonitor = Boolean(metricValue?.endsWith("_pct"));
    const preferredMonitor = needsDeviceMonitor
      ? monitors.find((item) => isDeviceMonitor(item))
      : monitors[0];

    if (needsDeviceMonitor && !preferredMonitor) {
      toast.error("CPU/RAM/Disk rule ต้องใช้ SYSTEM หรือ SNMP monitor");
      return;
    }

    const draft = emptyForm(preferredMonitor ? [preferredMonitor] : monitors);
    const monitor = monitors.find((item) => item.id === draft.monitorId) ?? null;
    const options = getMetricOptions(monitor);
    const metric = options.find((option) => option.value === metricValue) ?? options[0] ?? baseMetrics[0];

    setEditing(null);
    setForm({
      ...draft,
      metric: metric.value,
      operator: metric.defaultOperator,
      threshold: String(metric.defaultThreshold),
    });
    setIsModalOpen(true);
  };

  const openEdit = (rule: AlertRuleRow) => {
    setEditing(rule);
    setForm({
      monitorId: rule.monitorId,
      metric: rule.metric,
      operator: rule.operator,
      threshold: String(rule.threshold),
      severity: rule.severity,
      enabled: rule.enabled,
      channelIds: rule.channels.map((item) => item.channel.id),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm(monitors));
  };

  const handleMonitorChange = (monitorId: string) => {
    const monitor = monitors.find((item) => item.id === monitorId) ?? null;
    const metric = getMetricOptions(monitor)[0] ?? baseMetrics[0];

    setForm((current) => ({
      ...current,
      monitorId,
      metric: metric.value,
      operator: metric.defaultOperator,
      threshold: String(metric.defaultThreshold),
    }));
  };

  const handleMetricChange = (metricValue: string) => {
    const metric = metricOptions.find((option) => option.value === metricValue) ?? metricOptions[0] ?? baseMetrics[0];

    setForm((current) => ({
      ...current,
      metric: metric.value,
      operator: metric.defaultOperator,
      threshold: String(metric.defaultThreshold),
    }));
  };

  const toggleChannel = (channelId: string) => {
    setForm((current) => ({
      ...current,
      channelIds: current.channelIds.includes(channelId)
        ? current.channelIds.filter((id) => id !== channelId)
        : [...current.channelIds, channelId],
    }));
  };

  const validateForm = () => {
    if (!form.monitorId) {
      toast.error("กรุณาเลือก monitor");
      return false;
    }
    const threshold = Number(form.threshold);
    if (!Number.isFinite(threshold)) {
      toast.error("threshold ต้องเป็นตัวเลข");
      return false;
    }
    if (form.metric === "status" && ![1, 2, 3].includes(threshold)) {
      toast.error("status threshold ต้องเป็น 1=DOWN, 2=DEGRADED, 3=UP");
      return false;
    }
    if (form.metric.endsWith("_pct") && (threshold < 0 || threshold > 100)) {
      toast.error("percent threshold ต้องอยู่ระหว่าง 0-100");
      return false;
    }
    if (form.metric === "response_time" && threshold < 0) {
      toast.error("response time ต้องมากกว่าหรือเท่ากับ 0");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);

    try {
      const payload = {
        metric: form.metric,
        operator: form.operator,
        threshold: Number(form.threshold),
        severity: form.severity,
        enabled: form.enabled,
        channelIds: form.channelIds,
      };

      const res = editing
        ? await api.patch<ApiResponse<AlertRuleRow>>(
            `/monitors/${editing.monitorId}/alert-rules/${editing.id}`,
            payload,
          )
        : await api.post<ApiResponse<AlertRuleRow>>(`/monitors/${form.monitorId}/alert-rules`, payload);

      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }

      toast.success(editing ? "อัปเดต alert rule แล้ว" : "สร้าง alert rule แล้ว");
      closeModal();
      await loadData();
    } catch {
      toast.error("บันทึก alert rule ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyNow = async (rule: AlertRuleRow) => {
    setNotifyingId(rule.id);
    try {
      const res = await api.post<ApiResponse<{ message: string }>>(
        `/monitors/${rule.monitorId}/alert-rules/${rule.id}/notify`,
      );
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("ส่งแจ้งเตือนแล้ว");
    } catch (error) {
      const apiMessage =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response &&
        error.response.data &&
        typeof error.response.data === "object" &&
        "message" in error.response.data &&
        typeof (error.response.data as { message?: unknown }).message === "string"
          ? (error.response.data as { message: string }).message
          : null;
      toast.error(apiMessage ?? "ส่งแจ้งเตือนไม่สำเร็จ");
    } finally {
      setNotifyingId(null);
    }
  };

  const handleToggleRule = async (rule: AlertRuleRow) => {
    try {
      const res = await api.patch<ApiResponse<AlertRuleRow>>(
        `/monitors/${rule.monitorId}/alert-rules/${rule.id}`,
        { enabled: !rule.enabled },
      );
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success(!rule.enabled ? "เปิดใช้งาน rule แล้ว" : "ปิดใช้งาน rule แล้ว");
      await loadData();
    } catch {
      toast.error("เปลี่ยนสถานะ rule ไม่สำเร็จ");
    }
  };

  const handleDelete = async (rule: AlertRuleRow) => {
    if (!window.confirm(`ต้องการลบ rule ${metricLabel(rule.metric)} ของ "${rule.monitor.name}" ใช่ไหม`)) return;

    try {
      const res = await api.delete<ApiResponse<{ message: string }>>(
        `/monitors/${rule.monitorId}/alert-rules/${rule.id}`,
      );
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("ลบ alert rule แล้ว");
      await loadData();
    } catch {
      toast.error("ลบ alert rule ไม่สำเร็จ");
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Alerting</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Alert Rules</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            ตั้งเงื่อนไขและช่องทางแจ้งเตือนแยกตาม monitor ได้จากหน้ารวมนี้
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => openCreate()}
            disabled={monitors.length === 0}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            New rule
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Total rules" value={summary.total} tone="text-slate-950" />
        <SummaryCard label="Enabled" value={summary.enabled} tone="text-emerald-700" />
        <SummaryCard label="Open incidents" value={summary.open} tone="text-rose-700" />
        <SummaryCard label="Device rules" value={summary.device} tone="text-cyan-700" />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Quick device thresholds</h2>
            <p className="mt-1 text-xs text-slate-500">
              ใช้กับ SYSTEM/SNMP monitor สำหรับ CPU, RAM และ Disk
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {deviceMetrics.map((metric) => (
              <button
                key={metric.value}
                type="button"
                onClick={() => openCreate(metric.value)}
                disabled={monitors.length === 0}
                className="rounded-md border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Configured alert rules</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? "Loading..." : `${rules.length} rules`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Monitor</th>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Incident</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    ยังไม่มี alert rule
                  </td>
                </tr>
              ) : null}

              {rules.map((rule) => (
                <tr key={rule.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      className="font-semibold text-slate-900 hover:text-cyan-700"
                      to={`/monitors/${rule.monitor.id}`}
                    >
                      {rule.monitor.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {rule.monitor.type} · {rule.monitor.enabled ? "monitor enabled" : "monitor disabled"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{metricLabel(rule.metric)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {operatorLabels[rule.operator]} {formatThreshold(rule.metric, rule.threshold)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {rule.channels.length === 0 ? (
                      <span className="text-xs text-slate-400">All enabled channels</span>
                    ) : (
                      <div className="flex max-w-sm flex-wrap gap-1">
                        {rule.channels.map(({ channel }) => (
                          <span
                            key={channel.id}
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              channel.enabled ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {channel.name} · {channelTypeLabels[channel.type]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${severityClasses[rule.severity]}`}>
                        {rule.severity}
                      </span>
                      <span
                        className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${
                          rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-sm px-4 py-3">
                    {rule.openIncident ? (
                      <p className="line-clamp-2 text-xs text-rose-700" title={rule.openIncident.message}>
                        {rule.openIncident.message}
                      </p>
                    ) : (
                      <span className="text-xs text-slate-400">No open incident</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {rule.openIncident ? (
                        <button
                          type="button"
                          disabled={notifyingId === rule.id}
                          onClick={() => void handleNotifyNow(rule)}
                          className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                        >
                          {notifyingId === rule.id ? "Sending..." : "Notify"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleToggleRule(rule)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(rule)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(rule)}
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editing ? "Edit alert rule" : "Create alert rule"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                เลือก monitor, threshold และ channel ที่ต้องการให้แจ้งเตือน
              </p>
            </div>

            <div className="grid gap-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Monitor</span>
                <select
                  value={form.monitorId}
                  onChange={(event) => handleMonitorChange(event.target.value)}
                  disabled={Boolean(editing)}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-100"
                >
                  {monitors.length === 0 ? <option value="">ยังไม่มี monitor</option> : null}
                  {monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name} ({monitor.type})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Metric</span>
                  <select
                    value={form.metric}
                    onChange={(event) => handleMetricChange(event.target.value)}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    {metricOptions.map((metric) => (
                      <option key={metric.value} value={metric.value}>
                        {metric.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Severity</span>
                  <select
                    value={form.severity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, severity: event.target.value as AlertSeverity }))
                    }
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Operator</span>
                  <select
                    value={form.operator}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, operator: event.target.value as AlertOperator }))
                    }
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  >
                    <option value="GT">greater than</option>
                    <option value="LT">less than</option>
                    <option value="EQ">equals</option>
                    <option value="NEQ">not equals</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Threshold</span>
                  <input
                    type="number"
                    value={form.threshold}
                    min={form.metric.endsWith("_pct") ? 0 : undefined}
                    max={form.metric.endsWith("_pct") ? 100 : undefined}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, threshold: event.target.value }))
                    }
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                  {form.metric === "status" ? (
                    <p className="mt-1 text-xs text-slate-500">1=DOWN, 2=DEGRADED, 3=UP</p>
                  ) : null}
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">Notification channels</span>
                  <Link className="text-xs font-semibold text-cyan-700 hover:text-cyan-800" to="/channels">
                    Manage channels
                  </Link>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {channels.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                      ยังไม่มี channel ถ้าไม่เลือก rule จะส่งไปทุก enabled channel เมื่อมีการตั้งค่า channel แล้ว
                    </div>
                  ) : null}
                  {channels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={form.channelIds.includes(channel.id)}
                        onChange={() => toggleChannel(channel.id)}
                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {channel.name} · {channelTypeLabels[channel.type]}
                      </span>
                      <span className={`text-xs ${channel.enabled ? "text-emerald-600" : "text-slate-400"}`}>
                        {channel.enabled ? "on" : "off"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                Enable rule
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
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
                {saving ? "Saving..." : editing ? "Save changes" : "Create rule"}
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

export default AlertsPage;
