import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/contexts/session.context";
import { getAvatarUrl } from "@/utils/avatar";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type ProfileData = {
  id: string;
  username: string;
  email: string;
  role: { name: string };
  createdAt: string;
};

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" });

const ProfilePage = () => {
  const { api } = useApi();
  const { user: sessionUser, loadUser } = useSession();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get<ApiResponse<ProfileData>>("/auth/me");
        if (res.data.success) {
          setProfile(res.data.data);
          setUsername(res.data.data.username);
          setEmail(res.data.data.email);
        }
      } catch {
        toast.error("โหลดโปรไฟล์ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [api]);

  const startEdit = () => {
    if (!profile) return;
    setUsername(profile.username);
    setEmail(profile.email);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!username.trim() || !email.trim()) {
      toast.error("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (username.trim() !== profile?.username) payload.username = username.trim();
      if (email.trim().toLowerCase() !== profile?.email) payload.email = email.trim();

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      const res = await api.patch<ApiResponse<ProfileData>>("/auth/profile", payload);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setProfile(res.data.data);
      setEditing(false);
      toast.success("อัปเดตโปรไฟล์แล้ว");
      await loadUser();
    } catch (error) {
      const msg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const roleName =
    typeof sessionUser?.role === "string"
      ? sessionUser.role
      : (sessionUser?.role?.name ?? profile?.role.name ?? "USER");

  const ROLE_BADGE: Record<string, string> = {
    ADMIN: "bg-rose-100 text-rose-700",
    USER: "bg-cyan-100 text-cyan-700",
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-700">บัญชีของฉัน</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">โปรไฟล์ของฉัน</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — avatar + summary */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <img
                src={getAvatarUrl(profile?.username ?? "user")}
                alt="avatar"
                className="h-20 w-20 rounded-full object-cover ring-4 ring-pink-200"
              />
              <p className="mt-4 text-lg font-semibold text-slate-900">{profile?.username}</p>
              <p className="text-sm text-slate-500">{profile?.email}</p>
              <span
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGE[roleName] ?? "bg-slate-100 text-slate-600"}`}
              >
                {roleName}
              </span>
              {profile?.createdAt ? (
                <p className="mt-4 text-xs text-slate-400">
                  สมาชิกตั้งแต่ {dateFormatter.format(new Date(profile.createdAt))}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              ลิงก์ด่วน
            </p>
            <div className="flex flex-col gap-1">
              <Link
                to="/change-password"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                เปลี่ยนรหัสผ่าน
              </Link>
              <Link
                to="/login-history"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 4a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd" />
                </svg>
                ประวัติการล็อกอิน
              </Link>
            </div>
          </div>
        </div>

        {/* Right — editable form */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-950">ข้อมูลส่วนตัว</h2>
              {!editing ? (
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  แก้ไข
                </button>
              ) : null}
            </div>

            <div className="grid gap-5 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Username
                  </p>
                  {editing ? (
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900">{profile?.username}</p>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Email
                  </p>
                  {editing ? (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900">{profile?.email}</p>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Role
                </p>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ROLE_BADGE[roleName] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {roleName}
                </span>
                <p className="mt-1 text-xs text-slate-400">Role ถูกกำหนดโดย Admin เท่านั้น</p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  User ID
                </p>
                <p className="font-mono text-xs text-slate-500">{profile?.id}</p>
              </div>
            </div>

            {editing ? (
              <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={cancelEdit}
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
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
