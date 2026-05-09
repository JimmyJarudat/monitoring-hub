import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useApi } from "@/hooks/useApi";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
};

const isExpired = (expiresAt: string | null) => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

const ApiTokensPage = () => {
  const { api } = useApi();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ApiToken[]>>("/api-tokens");
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setTokens(res.data.data);
    } catch {
      toast.error("โหลด API tokens ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<ApiResponse<ApiToken & { token: string }>>("/api-tokens", {
        name: newName.trim(),
        expiresAt: newExpiry || null,
      });
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setCreatedToken(res.data.data.token);
      setTokens((prev) => [res.data.data as ApiToken, ...prev]);
      setNewName("");
      setNewExpiry("");
      setShowForm(false);
      setCopied(false);
    } catch {
      toast.error("สร้าง API token ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`ยืนยันการยกเลิก token "${name}"?`)) return;
    setRevoking(id);
    try {
      const res = await api.delete<ApiResponse<unknown>>(`/api-tokens/${id}`);
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setTokens((prev) => prev.filter((t) => t.id !== id));
      toast.success("ยกเลิก API token แล้ว");
    } catch {
      toast.error("ยกเลิก API token ไม่สำเร็จ");
    } finally {
      setRevoking(null);
    }
  };

  const copyToken = () => {
    if (!createdToken) return;
    void navigator.clipboard.writeText(createdToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">บัญชีของฉัน</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">API Tokens</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            สร้าง token สำหรับเรียก API โดยตรงโดยไม่ต้องใช้ session — ใช้ได้ใน script, integration หรือ automation
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setCreatedToken(null);
          }}
          className="shrink-0 rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
        >
          + สร้าง Token ใหม่
        </button>
      </div>

      {/* Create form */}
      {showForm ? (
        <section className="mt-6 rounded-lg border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">สร้าง API Token ใหม่</h2>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">ชื่อ Token</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น Grafana Integration, Deploy Script"
                maxLength={100}
                required
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">
                วันหมดอายุ <span className="text-slate-400">(ไม่บังคับ)</span>
              </label>
              <input
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "กำลังสร้าง..." : "สร้าง"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Newly created token reveal */}
      {createdToken ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">คัดลอก token นี้ไว้ทันที — จะไม่แสดงอีกครั้ง</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-xs font-mono text-slate-800 border border-amber-200 select-all">
                  {createdToken}
                </code>
                <button
                  type="button"
                  onClick={copyToken}
                  className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                >
                  {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-700">
                ใช้งานใน HTTP header:{" "}
                <code className="font-mono">Authorization: Bearer {createdToken.slice(0, 14)}...</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreatedToken(null)}
            className="mt-4 text-xs text-amber-700 underline hover:text-amber-900"
          >
            ปิดข้อความนี้
          </button>
        </section>
      ) : null}

      {/* Token list */}
      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Token ทั้งหมด</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading ? "กำลังโหลด..." : `${tokens.length.toLocaleString()} token`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ชื่อ</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">หมดอายุ</th>
                <th className="px-4 py-3">ใช้ล่าสุด</th>
                <th className="px-4 py-3">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && tokens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    ยังไม่มี API token — กดปุ่ม "สร้าง Token ใหม่" เพื่อเริ่มต้น
                  </td>
                </tr>
              ) : null}
              {tokens.map((token) => {
                const expired = isExpired(token.expiresAt);
                return (
                  <tr key={token.id} className={`transition hover:bg-slate-50 ${expired ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {token.name}
                        {expired ? (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                            หมดอายุ
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {token.prefix}…
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {token.expiresAt ? (
                        <span className={expired ? "text-rose-600" : "text-slate-700"}>
                          {formatDate(token.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">ไม่มีวันหมดอายุ</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(token.lastUsedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(token.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={revoking === token.id}
                        onClick={() => void handleRevoke(token.id, token.name)}
                        className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {revoking === token.id ? "กำลังยกเลิก..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default ApiTokensPage;
