import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type RetentionConfig = {
  results_days: number;
  metrics_days: number;
  audit_days: number;
};

type RetentionLastRun = {
  deletedResults: number;
  deletedMetrics: number;
  deletedAuditLogs: number;
  ranAt: string;
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];

const SettingsPage = () => {
  const { get, patch, post } = useApi();
  const [config, setConfig] = useState<RetentionConfig>({
    results_days: 30,
    metrics_days: 30,
    audit_days: 90,
  });
  const [lastRun, setLastRun] = useState<RetentionLastRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchRetention = useCallback(async () => {
    try {
      const res = await get<ApiResponse<{ config: RetentionConfig; lastRun: RetentionLastRun | null }>>(
        "/admin/retention",
      );
      if (res.data.success) {
        setConfig(res.data.data.config);
        setLastRun(res.data.data.lastRun);
      }
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    void fetchRetention();
  }, [fetchRetention]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patch("/admin/retention", config);
      toast.success("บันทึกการตั้งค่าสำเร็จ");
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (!confirm("ต้องการรัน Cleanup ทันทีใช่ไหม? ข้อมูลที่เกินกำหนดจะถูกลบถาวร")) return;
    setRunning(true);
    try {
      const res = await post<ApiResponse<RetentionLastRun>>("/admin/retention/run");
      if (res.data.success) {
        const s = res.data.data;
        setLastRun(s);
        toast.success(
          `Cleanup เสร็จสิ้น: ลบ ${s.deletedResults} results, ${s.deletedMetrics} metrics, ${s.deletedAuditLogs} audit logs`,
        );
      }
    } catch {
      // handled by interceptor
    } finally {
      setRunning(false);
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
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ตั้งค่าระบบ</h1>
        <p className="mt-1 text-sm text-slate-500">จัดการการตั้งค่าการเก็บข้อมูลและการ cleanup อัตโนมัติ</p>
      </div>

      {/* Retention config card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-800">Data Retention</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ข้อมูลที่เก่ากว่าที่กำหนดจะถูกลบออกโดยอัตโนมัติทุก 24 ชั่วโมง
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          <RetentionField
            label="Monitor Results"
            description="ผลการตรวจสอบ (UP/DOWN/DEGRADED)"
            value={config.results_days}
            onChange={(v) => setConfig((c) => ({ ...c, results_days: v }))}
          />
          <RetentionField
            label="Device Metrics"
            description="ข้อมูล CPU, RAM, Disk, Network samples"
            value={config.metrics_days}
            onChange={(v) => setConfig((c) => ({ ...c, metrics_days: v }))}
          />
          <RetentionField
            label="Audit Logs"
            description="ประวัติการกระทำของผู้ใช้งาน"
            value={config.audit_days}
            onChange={(v) => setConfig((c) => ({ ...c, audit_days: v }))}
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {running ? "กำลังรัน..." : "Run Cleanup Now"}
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

      {/* Last run info */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold text-slate-800">Cleanup ล่าสุด</h2>
        </div>
        <div className="px-6 py-5">
          {lastRun ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                รันเมื่อ{" "}
                <span className="font-medium text-slate-700">
                  {new Date(lastRun.ranAt).toLocaleString("th-TH")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatPill label="Results ที่ลบ" value={lastRun.deletedResults} />
                <StatPill label="Metrics ที่ลบ" value={lastRun.deletedMetrics} />
                <StatPill label="Audit Logs ที่ลบ" value={lastRun.deletedAuditLogs} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">ยังไม่เคยรัน Cleanup</p>
          )}
        </div>
      </div>
    </div>
  );
};

type RetentionFieldProps = {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
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
      {DAY_OPTIONS.map((d) => (
        <option key={d} value={d}>
          {d} วัน
        </option>
      ))}
    </select>
  </div>
);

type StatPillProps = { label: string; value: number };

const StatPill = ({ label, value }: StatPillProps) => (
  <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
    <p className="text-lg font-bold text-slate-800">{value.toLocaleString()}</p>
    <p className="mt-0.5 text-xs text-slate-500">{label}</p>
  </div>
);

export default SettingsPage;
