import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/contexts/session.context";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const ChangePasswordPage = () => {
  const { api } = useApi();
  const { logout } = useSession();
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.currentPassword) { toast.error("กรุณากรอกรหัสผ่านปัจจุบัน"); return; }
    if (!form.newPassword) { toast.error("กรุณากรอกรหัสผ่านใหม่"); return; }
    if (form.newPassword !== form.confirm) { toast.error("รหัสผ่านใหม่ไม่ตรงกัน"); return; }
    if (form.newPassword === form.currentPassword) { toast.error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม"); return; }

    setSaving(true);
    try {
      const res = await api.post<ApiResponse<{ message: string }>>("/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      toast.success("เปลี่ยนรหัสผ่านสำเร็จ กำลังออกจากระบบ...");
      setTimeout(() => {
        void logout().then(() => navigate("/login"));
      }, 1500);
    } catch (error) {
      const msg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const strength = (() => {
    const p = form.newPassword;
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { label: "อ่อน", color: "bg-rose-500", width: "w-1/5" };
    if (score <= 2) return { label: "พอใช้", color: "bg-amber-400", width: "w-2/5" };
    if (score <= 3) return { label: "ดี", color: "bg-yellow-400", width: "w-3/5" };
    if (score <= 4) return { label: "แข็งแกร่ง", color: "bg-emerald-400", width: "w-4/5" };
    return { label: "ยอดเยี่ยม", color: "bg-emerald-500", width: "w-full" };
  })();

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-700">บัญชีของฉัน</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">เปลี่ยนรหัสผ่าน</h1>
        <p className="mt-2 text-sm text-slate-500">
          หลังเปลี่ยนรหัสผ่าน ระบบจะออกจากระบบทุก session และให้ล็อกอินใหม่
        </p>
      </div>

      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">กรอกรหัสผ่าน</h2>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-5 p-5">
            {/* Current password */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">รหัสผ่านปัจจุบัน</span>
              <div className="relative mt-2">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={form.currentPassword}
                  onChange={set("currentPassword")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showCurrent ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {/* New password */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">รหัสผ่านใหม่</span>
              <div className="relative mt-2">
                <input
                  type={showNew ? "text" : "password"}
                  value={form.newPassword}
                  onChange={set("newPassword")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showNew ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  )}
                </button>
              </div>
              {strength ? (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full transition-all ${strength.color} ${strength.width}`} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">ความแข็งแกร่ง: {strength.label}</p>
                </div>
              ) : null}
            </label>

            {/* Confirm */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">ยืนยันรหัสผ่านใหม่</span>
              <input
                type="password"
                value={form.confirm}
                onChange={set("confirm")}
                className={`mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
                  form.confirm && form.confirm !== form.newPassword
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                    : "border-slate-300 focus:border-cyan-500 focus:ring-cyan-500/20"
                }`}
                autoComplete="new-password"
              />
              {form.confirm && form.confirm !== form.newPassword ? (
                <p className="mt-1 text-xs text-rose-500">รหัสผ่านไม่ตรงกัน</p>
              ) : null}
            </label>

            <div className="rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-700">
              การเปลี่ยนรหัสผ่านจะ revoke session ทั้งหมด รวมถึง session ปัจจุบัน และต้องล็อกอินใหม่
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "เปลี่ยนรหัสผ่าน"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
