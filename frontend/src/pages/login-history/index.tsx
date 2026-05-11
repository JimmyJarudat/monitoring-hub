import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };
type LoginStatus = "SUCCESS" | "FAILED";

type LoginHistoryRow = {
  id: string;
  status: LoginStatus;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type LoginHistoryResponse = {
  items: LoginHistoryRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

const formatDate = (value: string, locale: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
};

const statusClass: Record<LoginStatus, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700",
};

const LoginHistoryPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const [data, setData] = useState<LoginHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(Math.ceil(data.total / data.limit), 1);
  }, [data]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<LoginHistoryResponse>>("/auth/login-history", {
        params: { page, limit: 30 },
      });
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setData(res.data.data);
    } catch {
      toast.error(t("loginHistory.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("user.myAccount")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("loginHistory.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {t("loginHistory.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          {t("common.refresh")}
        </button>
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">{t("loginHistory.eventsTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? t("common.loading") : t("systemLogs.recordsCount", { count: (data?.total ?? 0).toLocaleString() })}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {t("systemLogs.pageCount", { page: data?.page ?? page, totalPages })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("systemLogs.time")}</th>
                <th className="px-4 py-3">{t("common.status")}</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">{t("loginHistory.deviceBrowser")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {!loading && (data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t("loginHistory.noHistory")}
                  </td>
                </tr>
              ) : null}

              {(data?.items ?? []).map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDate(row.createdAt, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[row.status]}`}>
                      {row.status === "SUCCESS" ? t("loginHistory.success") : t("loginHistory.failed")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {row.ipAddress ?? "-"}
                  </td>
                  <td className="max-w-2xl px-4 py-3">
                    <p className="truncate text-xs text-slate-600" title={row.userAgent ?? ""}>
                      {row.userAgent ?? "-"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("systemLogs.previous")}
          </button>
          <span className="text-xs text-slate-500">
            {t("systemLogs.showing", { shown: (data?.items.length ?? 0).toLocaleString(), total: (data?.total ?? 0).toLocaleString() })}
          </span>
          <button
            type="button"
            disabled={!data?.hasMore}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("systemLogs.next")}
          </button>
        </div>
      </section>
    </div>
  );
};

export default LoginHistoryPage;
