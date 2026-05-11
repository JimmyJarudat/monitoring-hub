import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/contexts/session.context";

type Role = { id: string; name: string };

type UserRow = {
  id: string;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
};

type UserForm = {
  username: string;
  email: string;
  password: string;
  roleId: string;
};

type PasswordForm = { password: string; confirm: string };

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

const emptyForm = (): UserForm => ({ username: "", email: "", password: "", roleId: "" });

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-rose-50 text-rose-700",
  USER: "bg-cyan-50 text-cyan-700",
};

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

const UsersPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const { user: currentUser } = useSession();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm>(() => emptyForm());
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [pwForm, setPwForm] = useState<PasswordForm>({ password: "", confirm: "" });
  const [resetting, setResetting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<ApiResponse<UserRow[]>>("/admin/users"),
        api.get<ApiResponse<Role[]>>("/admin/users/roles"),
      ]);
      if (usersRes.data.success) setUsers(usersRes.data.data);
      if (rolesRes.data.success) setRoles(rolesRes.data.data);
    } catch {
      toast.error(t("users.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), roleId: roles[0]?.id ?? "" });
    setIsFormOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setForm({ username: user.username, email: user.email, password: "", roleId: user.role.id });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.roleId) {
      toast.error(t("users.validationRequired"));
      return;
    }
    if (!editing && !form.password.trim()) {
      toast.error(t("users.validationPassword"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, string> = {};
        if (form.username !== editing.username) payload.username = form.username.trim();
        if (form.email !== editing.email) payload.email = form.email.trim();
        if (form.roleId !== editing.role.id) payload.roleId = form.roleId;
        const res = await api.patch<ApiResponse<UserRow>>(`/admin/users/${editing.id}`, payload);
        if (!res.data.success) { toast.error(res.data.message); return; }
        toast.success(t("users.updateSuccess"));
      } else {
        const res = await api.post<ApiResponse<UserRow>>("/admin/users", {
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          roleId: form.roleId,
        });
        if (!res.data.success) { toast.error(res.data.message); return; }
        toast.success(t("users.createSuccess"));
      }
      closeForm();
      await loadData();
    } catch (error) {
      const msg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg ?? t("users.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (!pwForm.password) { toast.error(t("users.validationNewPassword")); return; }
    if (pwForm.password !== pwForm.confirm) { toast.error(t("changePassword.validationMismatch")); return; }
    setResetting(true);
    try {
      const res = await api.post<ApiResponse<{ message: string }>>(
        `/admin/users/${resetTarget.id}/reset-password`,
        { password: pwForm.password },
      );
      if (!res.data.success) { toast.error(res.data.message); return; }
      toast.success(t("users.resetSuccess"));
      setResetTarget(null);
      setPwForm({ password: "", confirm: "" });
    } catch {
      toast.error(t("users.resetError"));
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await api.delete<ApiResponse<{ message: string }>>(`/admin/users/${deleteTarget.id}`);
      if (!res.data.success) { toast.error(res.data.message); return; }
      toast.success(t("users.deleteSuccess"));
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      const msg =
        error && typeof error === "object" && "response" in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg ?? t("users.deleteError"));
    } finally {
      setDeleting(false);
    }
  };

  const adminCount = users.filter((u) => u.role.name === "ADMIN").length;

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("systemLogs.subtitle")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("users.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {t("users.description")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {t("users.newUser")}
          </button>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label={t("users.totalUsers")} value={users.length} tone="text-slate-950" />
        <SummaryCard label={t("users.admins")} value={adminCount} tone="text-rose-700" />
        <SummaryCard label={t("users.regularUsers")} value={users.length - adminCount} tone="text-cyan-700" />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">{t("users.allAccounts")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {loading ? t("common.loading") : t("users.usersCount", { count: users.length })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">{t("users.lastLogin")}</th>
                <th className="px-4 py-3">{t("common.createdAt")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t("users.noUsers")}
                  </td>
                </tr>
              ) : null}
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <tr key={user.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.username}
                      {isSelf ? (
                        <span className="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                          {t("users.you")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${ROLE_BADGE[user.role.name] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {user.role.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.lastLoginAt, locale)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.createdAt, locale)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setResetTarget(user); setPwForm({ password: "", confirm: "" }); }}
                          className="rounded-md border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          {t("users.resetPw")}
                        </button>
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => setDeleteTarget(user)}
                          className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("common.delete")}
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

      {/* Create / Edit modal */}
      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="shrink-0 border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">
                {editing ? t("users.editTitle") : t("users.createTitle")}
              </h2>
            </div>
            <div className="grid gap-4 overflow-y-auto p-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Username</span>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              {!editing ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {editing && editing.id === currentUser?.id ? (
                  <p className="mt-1 text-xs text-amber-600">{t("users.selfRoleHint")}</p>
                ) : null}
              </label>
            </div>
            <div className="shrink-0 flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? t("alerts.saving") : editing ? t("common.save") : t("users.createUser")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reset password modal */}
      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("users.resetTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("users.resetDescriptionPrefix")} <strong>{resetTarget.username}</strong> {t("users.resetDescriptionSuffix")}
              </p>
            </div>
            <div className="grid gap-4 p-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("changePassword.newPassword")}</span>
                <input
                  type="password"
                  value={pwForm.password}
                  onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">{t("changePassword.confirmPassword")}</span>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => void handleResetPassword()}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
              >
                {resetting ? t("users.resetting") : t("users.resetTitle")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirm modal */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{t("users.deleteTitle")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("users.deleteConfirmPrefix")} <strong>{deleteTarget.username}</strong> ({deleteTarget.email}) {t("users.deleteConfirmSuffix")}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? t("users.deleting") : t("common.delete")}
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

export default UsersPage;
