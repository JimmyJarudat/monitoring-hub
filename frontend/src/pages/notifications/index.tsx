import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useApi } from "@/hooks/useApi";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type AppNotification = {
  id: string;
  recipientId: string;
  title: string;
  message: string | null;
  type: "INCIDENT" | "RESOLVED" | "ALERT" | "SYSTEM" | "DELIVERY" | "SECURITY" | "REPORT" | "MONITOR";
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  href: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  read: boolean;
};

type NotificationResponse = {
  items: AppNotification[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
  hasMore: boolean;
};

type FilterKey = "ALL" | "UNREAD" | AppNotification["type"];

const typeClass: Record<AppNotification["type"], string> = {
  INCIDENT: "bg-rose-50 text-rose-700",
  ALERT: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  SYSTEM: "bg-slate-100 text-slate-700",
  DELIVERY: "bg-orange-50 text-orange-700",
  SECURITY: "bg-violet-50 text-violet-700",
  REPORT: "bg-cyan-50 text-cyan-700",
  MONITOR: "bg-blue-50 text-blue-700",
};

const severityClass: Record<AppNotification["severity"], string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const filterTabs: { key: FilterKey; labelKey: string }[] = [
  { key: "ALL", labelKey: "notificationsPage.all" },
  { key: "UNREAD", labelKey: "notificationsPage.unread" },
  { key: "INCIDENT", labelKey: "notificationsPage.incidents" },
  { key: "DELIVERY", labelKey: "notificationsPage.delivery" },
  { key: "SYSTEM", labelKey: "notificationsPage.system" },
  { key: "MONITOR", labelKey: "notificationsPage.monitor" },
];

const formatDate = (value: string, locale: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const NotificationsPage = () => {
  const { t, i18n } = useTranslation();
  const { api } = useApi();
  const locale = i18n.language === "th" ? "th-TH" : "en-US";
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({
    page,
    limit: 50,
    unread: filter === "UNREAD" ? "true" : undefined,
    type: filter !== "ALL" && filter !== "UNREAD" ? filter : undefined,
  }), [filter, page]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<NotificationResponse>>("/notifications", { params });
      if (!res.data.success) {
        toast.error(res.data.message);
        return;
      }
      setData(res.data.data);
    } catch {
      toast.error(t("notificationsPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [api, params]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const changeFilter = (next: FilterKey) => {
    setFilter(next);
    setPage(1);
  };

  const markRead = async (id: string) => {
    setData((current) => current
      ? {
          ...current,
          unreadCount: Math.max(current.unreadCount - (current.items.find((item) => item.id === id && !item.read) ? 1 : 0), 0),
          items: current.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
        }
      : current);
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      void loadNotifications();
    }
  };

  const markAllRead = async () => {
    setData((current) => current
      ? {
          ...current,
          unreadCount: 0,
          items: current.items.map((item) => ({ ...item, read: true })),
        }
      : current);
    try {
      await api.patch("/notifications/read-all");
      toast.success(t("notificationsPage.markAllSuccess"));
    } catch {
      void loadNotifications();
    }
  };

  const dismissNotification = async (id: string) => {
    setData((current) => current
      ? {
          ...current,
          total: Math.max(current.total - 1, 0),
          unreadCount: Math.max(current.unreadCount - (current.items.find((item) => item.id === id && !item.read) ? 1 : 0), 0),
          items: current.items.filter((item) => item.id !== id),
        }
      : current);
    try {
      await api.patch(`/notifications/${id}/dismiss`);
    } catch {
      void loadNotifications();
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">{t("user.myAccount")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{t("notificationsPage.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            {t("notificationsPage.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <span className="font-semibold text-slate-950">{(data?.unreadCount ?? 0).toLocaleString()}</span>
            <span className="ml-1 text-slate-500">{t("notificationsPage.unread")}</span>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {t("notification.markAllRead")}
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => changeFilter(tab.key)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                filter === tab.key
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">{t("notification.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? t("common.loading") : t("systemLogs.recordsCount", { count: (data?.total ?? 0).toLocaleString() })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {t("common.refresh")}
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {!loading && (data?.items.length ?? 0) === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              {t("notificationsPage.noNotifications")}
            </div>
          ) : null}

          {(data?.items ?? []).map((item) => (
            <div
              key={item.id}
              className="grid gap-3 px-4 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <Link
                to={item.href ?? "/notifications"}
                onClick={() => void markRead(item.id)}
                className="min-w-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!item.read ? <span className="h-2 w-2 rounded-full bg-cyan-500" /> : null}
                  <h3 className="font-semibold text-slate-950">{item.title}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${typeClass[item.type]}`}>
                    {item.type}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClass[item.severity]}`}>
                    {item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.message ?? "-"}</p>
              </Link>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <time className="text-xs text-slate-500">{formatDate(item.createdAt, locale)}</time>
                <button
                  type="button"
                  onClick={() => void dismissNotification(item.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  {t("notificationsPage.dismiss")}
                </button>
              </div>
            </div>
          ))}
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
            {t("notificationsPage.page", { page: data?.page ?? page })}
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

export default NotificationsPage;
