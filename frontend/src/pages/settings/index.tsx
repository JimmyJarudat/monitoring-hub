import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";
import { useSystemConfig } from "@/contexts/systemConfig.context";
import type { SystemConfig } from "@/contexts/systemConfig.context";
import { API_BASE_URL } from "@/lib/constants";

type RetentionConfig = {
  results_days: number;
  metrics_days: number;
  audit_days: number;
  auto_cleanup_enabled: boolean;
};

type RetentionLastRun = {
  deletedResults: number;
  deletedMetrics: number;
  deletedAuditLogs: number;
  ranAt: string;
};

type RetentionStats = {
  results: { count: number; oldest: string | null };
  metrics: { count: number; oldest: string | null };
  audit: { count: number; oldest: string | null };
};

type RetentionTarget = "results" | "metrics" | "audit";
type ClearMode = "expired" | "all";

type RetentionResponse = {
  config: RetentionConfig;
  lastRun: RetentionLastRun | null;
  stats: RetentionStats;
};

type ClearResponse = {
  summary: RetentionLastRun;
  stats: RetentionStats;
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
const CLEAR_TARGET_OPTIONS: Array<{ key: RetentionTarget; label: string; description: string }> = [
  {
    key: "results",
    label: "Monitor results",
    description: "ผลตรวจ UP / DOWN / DEGRADED",
  },
  {
    key: "metrics",
    label: "Device metrics",
    description: "CPU, RAM, Disk, Network samples",
  },
  {
    key: "audit",
    label: "Audit logs",
    description: "ประวัติการกระทำของผู้ใช้",
  },
];

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("th-TH") : "ยังไม่มีข้อมูล";

const getDeletedTotal = (summary: RetentionLastRun) =>
  summary.deletedResults + summary.deletedMetrics + summary.deletedAuditLogs;

const SYS_DEFAULTS: SystemConfig = {
  general: { systemName: "Monitoring Hub", tagline: "Lightweight Monitor", logoText: "MH", logoUrl: null },
  alerting: { incidentReminderIntervalHours: 24 },
  monitorDefaults: { intervalSeconds: 60, timeoutMs: 10000 },
  security: {
    passwordMinLength: 8,
    requireLowercase: false,
    requireUppercase: false,
    requireNumber: false,
    requireSpecial: false,
    sessionDays: 30,
    maxLoginAttempts: 10,
  },
  email: { enabled: true, host: "", port: 587, secure: false, username: "", password: "", from: "" },
  scheduledReport: { enabled: false, time: "08:00", channelIds: [] },
};

const REMINDER_OPTIONS = [1, 2, 4, 6, 12, 24, 48, 72];
const INTERVAL_OPTIONS = [30, 60, 120, 300, 600];
const TIMEOUT_OPTIONS = [3000, 5000, 10000, 15000, 30000];
const PW_MIN_OPTIONS = [6, 8, 10, 12, 16, 20];
const SESSION_OPTIONS = [1, 7, 14, 30, 60, 90, 180, 365];
const LOGIN_ATTEMPT_OPTIONS = [3, 5, 10, 20, 0];
const SettingsPage = () => {
  const { api } = useApi();
  const { reload: reloadSysConfig } = useSystemConfig();

  // ── System config state ───────────────────────────────────────
  const [sysConfig, setSysConfig] = useState<SystemConfig>(SYS_DEFAULTS);
  const [sysSaving, setSysSaving] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post<ApiResponse<{ logoUrl: string }>>(
        "/admin/system-config/logo",
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (!res.data.success) { toast.error(res.data.message); return; }
      setSysConfig((c) => ({ ...c, general: { ...c.general, logoUrl: res.data.success ? res.data.data.logoUrl : c.general.logoUrl } }));
      toast.success("อัปโหลดโลโก้แล้ว");
      await reloadSysConfig();
    } catch { toast.error("อัปโหลดไม่สำเร็จ"); }
    finally { setLogoUploading(false); if (logoInputRef.current) logoInputRef.current.value = ""; }
  };

  const handleLogoRemove = async () => {
    if (!window.confirm("ต้องการลบโลโก้ใช่ไหม?")) return;
    setLogoRemoving(true);
    try {
      const res = await api.delete<ApiResponse<{ message: string }>>("/admin/system-config/logo");
      if (!res.data.success) { toast.error(res.data.message); return; }
      setSysConfig((c) => ({ ...c, general: { ...c.general, logoUrl: null } }));
      toast.success("ลบโลโก้แล้ว");
      await reloadSysConfig();
    } catch { toast.error("ลบไม่สำเร็จ"); }
    finally { setLogoRemoving(false); }
  };

  const fetchSysConfig = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<SystemConfig>>("/admin/system-config");
      if (res.data.success) setSysConfig(res.data.data);
    } catch {}
  }, [api]);

  const saveSysSection = async (patch: Partial<SystemConfig>, label: string) => {
    setSysSaving(true);
    try {
      const res = await api.patch<ApiResponse<{ message: string }>>("/admin/system-config", patch);
      if (!res.data.success) { toast.error(res.data.message); return; }
      toast.success(`บันทึก ${label} แล้ว`);
      await reloadSysConfig();
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
    finally { setSysSaving(false); }
  };

  const isEmailConfigured = useMemo(
    () =>
      Boolean(
        sysConfig.email.host.trim() &&
        sysConfig.email.port &&
        sysConfig.email.username.trim() &&
        sysConfig.email.password.trim() &&
        sysConfig.email.from.trim(),
      ),
    [sysConfig.email],
  );

  const handleSaveEmail = async () => {
    await saveSysSection({ email: { ...sysConfig.email, enabled: true } }, "Email");
    setEmailEditing(false);
  };

  // ── Retention state ───────────────────────────────────────────
  const [config, setConfig] = useState<RetentionConfig>({
    results_days: 30,
    metrics_days: 30,
    audit_days: 90,
    auto_cleanup_enabled: true,
  });
  const [lastRun, setLastRun] = useState<RetentionLastRun | null>(null);
  const [stats, setStats] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearTargets, setClearTargets] = useState<RetentionTarget[]>(["results"]);
  const [clearMode, setClearMode] = useState<ClearMode>("expired");
  const [clearOlderThanDays, setClearOlderThanDays] = useState<number>(30);

  const fetchRetention = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<RetentionResponse>>("/admin/retention");
      if (res.data.success) {
        setConfig(res.data.data.config);
        setLastRun(res.data.data.lastRun);
        setStats(res.data.data.stats);
        setClearOlderThanDays(res.data.data.config.results_days);
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      console.error("Failed to load retention settings", error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchSysConfig();
    void fetchRetention();
  }, [fetchSysConfig, fetchRetention]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch<ApiResponse<{ message: string }>>("/admin/retention", config);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success(res.data.data.message);
    } catch (error) {
      console.error("Failed to save retention settings", error);
    } finally {
      setSaving(false);
    }
  };

  const refreshRetentionState = async () => {
    const res = await api.get<ApiResponse<RetentionResponse>>("/admin/retention");
    if (res.data.success) {
      setConfig(res.data.data.config);
      setLastRun(res.data.data.lastRun);
      setStats(res.data.data.stats);
    } else {
      toast.error(res.data.message);
    }
  };

  const handleRunNow = async () => {
    if (!confirm("ต้องการรัน cleanup ตาม retention ปัจจุบันทันทีใช่ไหม?")) return;
    setRunning(true);
    try {
      const res = await api.post<ApiResponse<RetentionLastRun>>("/admin/retention/run");
      if (res.data.success) {
        const summary = res.data.data;
        setLastRun(summary);
        await refreshRetentionState();
        const message = `Cleanup เสร็จแล้ว: ลบ ${summary.deletedResults} results, ${summary.deletedMetrics} metrics, ${summary.deletedAuditLogs} audit logs`;
        if (getDeletedTotal(summary) === 0) {
          toast.info(`${message} (ไม่มีข้อมูลที่เก่ากว่า retention ให้ลบ)`);
        } else {
          toast.success(message);
        }
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      console.error("Failed to run retention cleanup", error);
    } finally {
      setRunning(false);
    }
  };

  const handleToggleClearTarget = (target: RetentionTarget) => {
    setClearTargets((current) =>
      current.includes(target) ? current.filter((item) => item !== target) : [...current, target],
    );
  };

  const clearSummaryText = useMemo(() => {
    if (clearMode === "all") return "ลบข้อมูลทุกช่วงเวลาของประเภทที่เลือก";
    return `ลบเฉพาะข้อมูลที่เก่ากว่า ${clearOlderThanDays} วัน ของประเภทที่เลือก`;
  }, [clearMode, clearOlderThanDays]);

  const handleClearHistory = async () => {
    if (clearTargets.length === 0) {
      toast.warning("เลือกอย่างน้อย 1 ประเภทข้อมูลก่อนล้าง");
      return;
    }

    const confirmed = confirm(
      `${clearSummaryText}\n\nการล้างข้อมูลเป็นการลบถาวรและย้อนกลับไม่ได้ ต้องการดำเนินการต่อหรือไม่?`,
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      const res = await api.post<ApiResponse<ClearResponse>>("/admin/retention/clear", {
        targets: clearTargets,
        mode: clearMode,
        olderThanDays: clearMode === "expired" ? clearOlderThanDays : undefined,
      });

      if (res.data.success) {
        const { summary, stats: nextStats } = res.data.data;
        setLastRun(summary);
        setStats(nextStats);
        const message = `ล้างข้อมูลแล้ว: ลบ ${summary.deletedResults} results, ${summary.deletedMetrics} metrics, ${summary.deletedAuditLogs} audit logs`;
        if (getDeletedTotal(summary) === 0) {
          toast.info(`${message} (ไม่พบข้อมูลที่ตรงเงื่อนไข)`);
        } else {
          toast.success(message);
        }
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      console.error("Failed to clear retention history", error);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ตั้งค่าระบบ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ตั้งค่า Branding, Alerting, Monitor defaults, Security และ Data retention
        </p>
      </div>

      {/* ── General / Branding ──────────────────────────────── */}
      <SysSection title="General" description="ชื่อระบบ, tagline, logo text และ logo รูปภาพที่แสดงใน sidebar">
        {/* Logo upload row */}
        <div className="flex items-center gap-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {sysConfig.general.logoUrl ? (
              <img
                src={`${API_BASE_URL}${sysConfig.general.logoUrl}?v=${Date.now()}`}
                alt="logo"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-slate-400">
                {sysConfig.general.logoText || "MH"}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-700">Logo รูปภาพ</p>
            <p className="mt-0.5 text-xs text-slate-500">PNG, JPG, WEBP, GIF — ไม่เกิน 2 MB · แทนที่ logo text ใน sidebar</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                {logoUploading ? "กำลังอัปโหลด..." : sysConfig.general.logoUrl ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
              </button>
              {sysConfig.general.logoUrl ? (
                <button
                  type="button"
                  disabled={logoRemoving}
                  onClick={() => void handleLogoRemove()}
                  className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  {logoRemoving ? "กำลังลบ..." : "ลบรูป"}
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SysField label="ชื่อระบบ">
            <input
              type="text"
              maxLength={60}
              value={sysConfig.general.systemName}
              onChange={(e) => setSysConfig((c) => ({ ...c, general: { ...c.general, systemName: e.target.value } }))}
              className={INPUT_CLS}
            />
          </SysField>
          <SysField label="Tagline">
            <input
              type="text"
              maxLength={80}
              value={sysConfig.general.tagline}
              onChange={(e) => setSysConfig((c) => ({ ...c, general: { ...c.general, tagline: e.target.value } }))}
              className={INPUT_CLS}
            />
          </SysField>
          <SysField label="Logo text (1–4 ตัวอักษร)">
            <input
              type="text"
              maxLength={4}
              value={sysConfig.general.logoText}
              onChange={(e) => setSysConfig((c) => ({ ...c, general: { ...c.general, logoText: e.target.value } }))}
              className={INPUT_CLS}
            />
          </SysField>
        </div>
        <SysSaveBtn loading={sysSaving} onClick={() => void saveSysSection({ general: sysConfig.general }, "General")} />
      </SysSection>

      {/* ── Alerting Defaults ───────────────────────────────── */}
      <SysSection title="Alerting Defaults" description="ความถี่การส่ง reminder เมื่อ incident ยังคงเปิดอยู่">
        <div className="grid gap-4 sm:grid-cols-2">
          <SysField label="Incident reminder interval">
            <select
              value={sysConfig.alerting.incidentReminderIntervalHours}
              onChange={(e) => setSysConfig((c) => ({ ...c, alerting: { incidentReminderIntervalHours: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {REMINDER_OPTIONS.map((h) => (
                <option key={h} value={h}>{h === 1 ? "1 ชั่วโมง" : `${h} ชั่วโมง`}</option>
              ))}
            </select>
          </SysField>
        </div>
        <SysSaveBtn loading={sysSaving} onClick={() => void saveSysSection({ alerting: sysConfig.alerting }, "Alerting")} />
      </SysSection>

      {/* ── Monitor Defaults ────────────────────────────────── */}
      <SysSection title="Monitor Defaults" description="ค่าเริ่มต้นสำหรับ monitor ใหม่">
        <div className="grid gap-4 sm:grid-cols-2">
          <SysField label="Check interval">
            <select
              value={sysConfig.monitorDefaults.intervalSeconds}
              onChange={(e) => setSysConfig((c) => ({ ...c, monitorDefaults: { ...c.monitorDefaults, intervalSeconds: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {INTERVAL_OPTIONS.map((s) => (
                <option key={s} value={s}>{s < 60 ? `${s} วินาที` : `${s / 60} นาที`}</option>
              ))}
            </select>
          </SysField>
          <SysField label="Timeout">
            <select
              value={sysConfig.monitorDefaults.timeoutMs}
              onChange={(e) => setSysConfig((c) => ({ ...c, monitorDefaults: { ...c.monitorDefaults, timeoutMs: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {TIMEOUT_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>{ms / 1000} วินาที</option>
              ))}
            </select>
          </SysField>
        </div>
        <SysSaveBtn loading={sysSaving} onClick={() => void saveSysSection({ monitorDefaults: sysConfig.monitorDefaults }, "Monitor Defaults")} />
      </SysSection>

      {/* ── Security ────────────────────────────────────────── */}
      <SysSection title="Security" description="นโยบาย password, session และ login attempt ที่ backend ใช้ตรวจจริง">
        <div className="grid gap-4 sm:grid-cols-3">
          <SysField label="Password ขั้นต่ำ (ตัวอักษร)">
            <select
              value={sysConfig.security.passwordMinLength}
              onChange={(e) => setSysConfig((c) => ({ ...c, security: { ...c.security, passwordMinLength: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {PW_MIN_OPTIONS.map((n) => <option key={n} value={n}>{n} ตัวอักษร</option>)}
            </select>
          </SysField>
          <SysField label="Session duration">
            <select
              value={sysConfig.security.sessionDays}
              onChange={(e) => setSysConfig((c) => ({ ...c, security: { ...c.security, sessionDays: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {SESSION_OPTIONS.map((d) => <option key={d} value={d}>{d === 1 ? "1 วัน" : `${d} วัน`}</option>)}
            </select>
          </SysField>
          <SysField label="Max login attempts">
            <select
              value={sysConfig.security.maxLoginAttempts}
              onChange={(e) => setSysConfig((c) => ({ ...c, security: { ...c.security, maxLoginAttempts: Number(e.target.value) } }))}
              className={INPUT_CLS}
            >
              {LOGIN_ATTEMPT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 0 ? "ไม่จำกัด" : `${n} ครั้ง`}</option>
              ))}
            </select>
          </SysField>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Password complexity</p>
          <p className="mt-1 text-xs text-slate-500">
            เปิดเงื่อนไขที่ต้องการบังคับใช้ตอนสร้างผู้ใช้, reset password, change password และ forgot password
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SecurityToggle
              label="บังคับตัวพิมพ์เล็ก"
              description="ต้องมี a-z อย่างน้อย 1 ตัว"
              checked={sysConfig.security.requireLowercase}
              onChange={(value) => setSysConfig((c) => ({ ...c, security: { ...c.security, requireLowercase: value } }))}
            />
            <SecurityToggle
              label="บังคับตัวพิมพ์ใหญ่"
              description="ต้องมี A-Z อย่างน้อย 1 ตัว"
              checked={sysConfig.security.requireUppercase}
              onChange={(value) => setSysConfig((c) => ({ ...c, security: { ...c.security, requireUppercase: value } }))}
            />
            <SecurityToggle
              label="บังคับตัวเลข"
              description="ต้องมี 0-9 อย่างน้อย 1 ตัว"
              checked={sysConfig.security.requireNumber}
              onChange={(value) => setSysConfig((c) => ({ ...c, security: { ...c.security, requireNumber: value } }))}
            />
            <SecurityToggle
              label="บังคับอักขระพิเศษ"
              description="ต้องมีสัญลักษณ์ เช่น ! @ # $"
              checked={sysConfig.security.requireSpecial}
              onChange={(value) => setSysConfig((c) => ({ ...c, security: { ...c.security, requireSpecial: value } }))}
            />
          </div>
        </div>
        <SysSaveBtn loading={sysSaving} onClick={() => void saveSysSection({ security: sysConfig.security }, "Security")} />
      </SysSection>

      {/* ── Email / Password Reset ─────────────────────────── */}
      <SysSection title="Email" description="SMTP สำหรับส่งรหัส reset password และอีเมลระบบ">
        {isEmailConfigured && !emailEditing ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-800">Email configured</p>
                <p className="mt-1 text-xs text-emerald-700">
                  ระบบจะใช้ SMTP นี้สำหรับส่งรหัสยืนยัน reset password
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEmailEditing(true)}
                className="w-fit rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                แก้ไข
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <EmailSettingItem label="SMTP host" value={sysConfig.email.host} />
              <EmailSettingItem label="SMTP port" value={String(sysConfig.email.port)} />
              <EmailSettingItem label="Username" value={sysConfig.email.username} />
              <EmailSettingItem label="Password" value="••••••••" />
              <EmailSettingItem label="From email" value={sysConfig.email.from} />
              <EmailSettingItem label="Security" value={sysConfig.email.secure ? "SSL" : "STARTTLS / Plain"} />
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {isEmailConfigured
                ? "แก้ไขค่า SMTP สำหรับส่งรหัส reset password"
                : "ยังไม่ได้ตั้งค่า SMTP กรอกข้อมูลด้านล่างเพื่อให้ระบบส่งรหัส reset password ทางอีเมลได้"}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SysField label="SMTP host">
                <input
                  type="text"
                  value={sysConfig.email.host}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, host: e.target.value } }))}
                  placeholder="smtp.example.com"
                  className={INPUT_CLS}
                />
              </SysField>
              <SysField label="SMTP port">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={sysConfig.email.port}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, port: Number(e.target.value) } }))}
                  className={INPUT_CLS}
                />
              </SysField>
              <SysField label="Username">
                <input
                  type="text"
                  value={sysConfig.email.username}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, username: e.target.value } }))}
                  placeholder="smtp user"
                  className={INPUT_CLS}
                />
              </SysField>
              <SysField label="Password">
                <input
                  type="password"
                  value={sysConfig.email.password}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, password: e.target.value } }))}
                  placeholder={sysConfig.email.password ? "••••••••" : "smtp password"}
                  autoComplete="new-password"
                  className={INPUT_CLS}
                />
              </SysField>
              <SysField label="From email">
                <input
                  type="email"
                  value={sysConfig.email.from}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, from: e.target.value } }))}
                  placeholder="monitoring@example.com"
                  className={INPUT_CLS}
                />
              </SysField>
              <SysField label="Connection security">
                <select
                  value={sysConfig.email.secure ? "ssl" : "starttls"}
                  onChange={(e) => setSysConfig((c) => ({ ...c, email: { ...c.email, secure: e.target.value === "ssl" } }))}
                  className={INPUT_CLS}
                >
                  <option value="starttls">STARTTLS / Plain (587)</option>
                  <option value="ssl">SSL (465)</option>
                </select>
              </SysField>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              {isEmailConfigured ? (
                <button
                  type="button"
                  onClick={() => {
                    setEmailEditing(false);
                    void fetchSysConfig();
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  ยกเลิก
                </button>
              ) : null}
              <button
                type="button"
                disabled={sysSaving}
                onClick={() => void handleSaveEmail()}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                {sysSaving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </>
        )}
      </SysSection>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          label="Monitor results"
          count={stats?.results.count ?? 0}
          oldest={stats?.results.oldest ?? null}
        />
        <StatsCard
          label="Device metrics"
          count={stats?.metrics.count ?? 0}
          oldest={stats?.metrics.oldest ?? null}
        />
        <StatsCard
          label="Audit logs"
          count={stats?.audit.count ?? 0}
          oldest={stats?.audit.oldest ?? null}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-800">Data retention</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ตั้งอายุข้อมูลรายประเภท และเลือกว่าจะให้ scheduler cleanup อัตโนมัติทุก 24 ชั่วโมงหรือไม่
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Auto cleanup scheduler</p>
              <p className="mt-1 text-xs text-slate-500">
                เปิดไว้เพื่อให้ backend รัน cleanup ตาม retention ทุก 24 ชั่วโมงโดยอัตโนมัติ
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.auto_cleanup_enabled}
              onChange={(e) =>
                setConfig((current) => ({
                  ...current,
                  auto_cleanup_enabled: e.target.checked,
                }))
              }
              className="mt-1 h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
          </label>

          <RetentionField
            label="Monitor Results"
            description="ผลการตรวจสอบสถานะและข้อความตอบกลับ"
            value={config.results_days}
            onChange={(value) => setConfig((current) => ({ ...current, results_days: value }))}
          />
          <RetentionField
            label="Device Metrics"
            description="ข้อมูล CPU, RAM, Disk, Network samples สำหรับกราฟย้อนหลัง"
            value={config.metrics_days}
            onChange={(value) => setConfig((current) => ({ ...current, metrics_days: value }))}
          />
          <RetentionField
            label="Audit Logs"
            description="ประวัติการแก้ไขและการกระทำของผู้ใช้"
            value={config.audit_days}
            onChange={(value) => setConfig((current) => ({ ...current, audit_days: value }))}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {running ? "กำลังรัน..." : "Run cleanup now"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-800">Manual clear history</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ล้างข้อมูลบางประเภทแบบตั้งใจได้ทันที โดยเลือกว่าจะลบทั้งหมดหรือเฉพาะข้อมูลเก่า
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="space-y-3">
              {CLEAR_TARGET_OPTIONS.map((option) => (
                <label
                  key={option.key}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={clearTargets.includes(option.key)}
                    onChange={() => handleToggleClearTarget(option.key)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{option.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">Clear mode</span>
                <select
                  value={clearMode}
                  onChange={(e) => setClearMode(e.target.value as ClearMode)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="expired">Expired only</option>
                  <option value="all">All history</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-800">Older than</span>
                <select
                  value={clearOlderThanDays}
                  onChange={(e) => setClearOlderThanDays(Number(e.target.value))}
                  disabled={clearMode !== "expired"}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {DAY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} วัน
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">กำลังจะทำอะไร</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">{clearSummaryText}</p>
            </div>
          </div>

          <div className="flex items-center justify-end border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing || clearTargets.length === 0}
              className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {clearing ? "กำลังล้าง..." : "Clear selected history"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="font-semibold text-slate-800">Cleanup ล่าสุด</h2>
          </div>
          <div className="space-y-4 px-6 py-5">
            {lastRun ? (
              <>
                <div>
                  <p className="text-xs text-slate-500">รันเมื่อ</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {formatDateTime(lastRun.ranAt)}
                  </p>
                </div>
                <div className="grid gap-3">
                  <StatPill label="Results ที่ลบ" value={lastRun.deletedResults} />
                  <StatPill label="Metrics ที่ลบ" value={lastRun.deletedMetrics} />
                  <StatPill label="Audit logs ที่ลบ" value={lastRun.deletedAuditLogs} />
                </div>
                {getDeletedTotal(lastRun) === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    รันสำเร็จ แต่ไม่มีข้อมูลที่ตรงเงื่อนไขให้ลบ
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-400">ยังไม่เคยรัน cleanup</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type RetentionFieldProps = {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
};

const RetentionField = ({ label, description, value, onChange }: RetentionFieldProps) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-32 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
    >
      {DAY_OPTIONS.map((days) => (
        <option key={days} value={days}>
          {days} วัน
        </option>
      ))}
    </select>
  </div>
);

type StatPillProps = {
  label: string;
  value: number;
};

const StatPill = ({ label, value }: StatPillProps) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2">
    <p className="text-lg font-bold text-slate-800">{value.toLocaleString()}</p>
    <p className="mt-0.5 text-xs text-slate-500">{label}</p>
  </div>
);

type StatsCardProps = {
  label: string;
  count: number;
  oldest: string | null;
};

const StatsCard = ({ label, count, oldest }: StatsCardProps) => (
  <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
    <p className="text-sm font-medium text-slate-800">{label}</p>
    <p className="mt-2 text-2xl font-bold text-slate-900">{count.toLocaleString()}</p>
    <p className="mt-2 text-xs text-slate-500">เก่าสุด: {formatDateTime(oldest)}</p>
  </div>
);

export const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100";

const SysSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-4">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </div>
    <div className="space-y-4 px-6 py-5">{children}</div>
  </div>
);

const SysField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
    {children}
  </label>
);

const SecurityToggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
    <span>
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
    </span>
    <input
      type="checkbox"
      className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

const EmailSettingItem = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={value}>
      {value || "-"}
    </p>
  </div>
);

const SysSaveBtn = ({ loading, onClick }: { loading: boolean; onClick: () => void }) => (
  <div className="flex justify-end border-t border-slate-100 pt-4">
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-600 disabled:opacity-50"
    >
      {loading ? "กำลังบันทึก..." : "บันทึก"}
    </button>
  </div>
);

export default SettingsPage;
