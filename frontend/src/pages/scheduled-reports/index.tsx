import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";
import { useSystemConfig } from "@/contexts/systemConfig.context";
import type { ScheduledReportConfig } from "@/contexts/systemConfig.context";

type NotificationChannel = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const DEFAULTS: ScheduledReportConfig = { enabled: false, time: "08:00", channelIds: [] };

const ScheduledReportsPage = () => {
  const { api } = useApi();
  const { config: sysConfig, reload: reloadSysConfig } = useSystemConfig();

  const [cfg, setCfg] = useState<ScheduledReportConfig>(DEFAULTS);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<NotificationChannel[]>>("/channels");
      if (res.data.success) setChannels(res.data.data);
    } catch {}
  }, [api]);

  useEffect(() => {
    setCfg(sysConfig.scheduledReport);
  }, [sysConfig.scheduledReport]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const toggleChannel = (channelId: string) => {
    setCfg((prev) => ({
      ...prev,
      channelIds: prev.channelIds.includes(channelId)
        ? prev.channelIds.filter((id) => id !== channelId)
        : [...prev.channelIds, channelId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.patch<ApiResponse<{ message: string }>>("/admin/system-config", {
        scheduledReport: cfg,
      });
      if (!res.data.success) { toast.error(res.data.message); return; }
      toast.success("บันทึก Scheduled Reports แล้ว");
      await reloadSysConfig();
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      const saveRes = await api.patch<ApiResponse<{ message: string }>>("/admin/system-config", {
        scheduledReport: cfg,
      });
      if (!saveRes.data.success) { toast.error(saveRes.data.message); return; }
      const res = await api.post<ApiResponse<{ message: string }>>("/admin/scheduled-report/send-now");
      if (!res.data.success) { toast.error(res.data.message); return; }
      toast.success(res.data.data.message);
      await reloadSysConfig();
    } catch { toast.error("ส่งรายงานไม่สำเร็จ"); }
    finally { setSending(false); }
  };

  const enabledChannelCount = channels.filter((c) => c.enabled).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scheduled Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          ส่งรายงานสรุปสถานะ monitor อัตโนมัติตามเวลาที่กำหนด ผ่าน notification channels
        </p>
      </div>

      {/* ── Enable toggle ──────────────────────────── */}
      <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-cyan-900">Daily availability report</p>
          <p className="mt-1 text-xs text-cyan-700">
            รายงานสรุปสถานะทุก monitor พร้อมช่วงเวลาที่หยุด (downtime) ในช่วง 24 ชั่วโมงที่ผ่านมา
          </p>
        </div>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-cyan-800 ring-1 ring-cyan-200 shrink-0">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-cyan-300 text-cyan-600 focus:ring-cyan-200"
            checked={cfg.enabled}
            onChange={(e) => setCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          เปิดใช้งาน
        </label>
      </div>

      {/* ── Time + Format info ────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">เวลาที่ส่งรายงาน</label>
          <input
            type="time"
            value={cfg.time}
            onChange={(e) => setCfg((prev) => ({ ...prev, time: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
          <p className="text-xs text-slate-400">
            รายงานจะครอบคลุม 24 ชั่วโมงย้อนหลังจากเวลานี้
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-slate-700">รูปแบบรายงาน</p>
          <ul className="text-xs text-slate-500 space-y-1 mt-1.5">
            <li>✅ web1 - ออนไลน์ปกติ</li>
            <li>✅ web2 - ออนไลน์อยู่ แต่มีหยุดในช่วงนี้</li>
            <li className="text-slate-400">&nbsp;&nbsp;&nbsp;└ หลุด: 02:15 → 03:45</li>
            <li>❌ db1 - ออฟไลน์อยู่ตอนนี้</li>
            <li className="text-slate-400">&nbsp;&nbsp;&nbsp;└ หลุด: 06:30 → ยังไม่กลับมา</li>
            <li>⚠️ api - ไม่สมบูรณ์ตอนนี้</li>
          </ul>
        </div>
      </div>

      {/* ── Channel selector ──────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Notification channels</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {cfg.channelIds.length === 0
                ? `ไม่ได้เลือก → ส่งไปทุก enabled channel (${enabledChannelCount} ช่องทาง)`
                : `เลือกไว้ ${cfg.channelIds.length} ช่องทาง`}
            </p>
          </div>
          {cfg.channelIds.length > 0 && (
            <button
              type="button"
              onClick={() => setCfg((prev) => ({ ...prev, channelIds: [] }))}
              className="text-xs font-semibold text-cyan-700 hover:text-cyan-900 shrink-0"
            >
              ใช้ทุก enabled channel
            </button>
          )}
        </div>

        {channels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-400 text-center">
            ยังไม่มี notification channel — ไปสร้างที่เมนู Channels ก่อนนะครับ
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {channels.map((channel) => (
              <label
                key={channel.id}
                className={[
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-sm transition",
                  channel.enabled
                    ? cfg.channelIds.includes(channel.id)
                      ? "border-cyan-300 ring-1 ring-cyan-200"
                      : "border-slate-200 hover:border-slate-300"
                    : "cursor-not-allowed border-slate-100 opacity-50",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{channel.name}</span>
                  <span className="text-xs text-slate-400">
                    {channel.type} · {channel.enabled ? "Enabled" : "Disabled"}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-200"
                  checked={cfg.channelIds.includes(channel.id)}
                  disabled={!channel.enabled}
                  onChange={() => toggleChannel(channel.id)}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ───────────────────────────────── */}
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-2">
        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSendNow()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {sending ? "กำลังส่ง..." : "ส่งรายงานตอนนี้"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </div>
  );
};

export default ScheduledReportsPage;
