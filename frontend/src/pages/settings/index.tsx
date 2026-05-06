import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

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

const SettingsPage = () => {
  const { get, patch, post } = useApi();
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
      const res = await get<ApiResponse<RetentionResponse>>("/admin/retention");
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
  }, [get]);

  useEffect(() => {
    void fetchRetention();
  }, [fetchRetention]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await patch<ApiResponse<{ message: string }>>("/admin/retention", config);
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
    const res = await get<ApiResponse<RetentionResponse>>("/admin/retention");
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
      const res = await post<ApiResponse<RetentionLastRun>>("/admin/retention/run");
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
      const res = await post<ApiResponse<ClearResponse>>("/admin/retention/clear", {
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
          ควบคุมระยะเวลาเก็บข้อมูล การ cleanup อัตโนมัติ และการล้าง history แบบตั้งใจ
        </p>
      </div>

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

export default SettingsPage;
