import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "@/contexts/session.context";
import { useTheme } from "@/contexts/theme.context";
import { isAdminUser } from "@/utils/permissions";
import { getAvatarUrl } from "@/utils/avatar";
import { useApi } from "@/hooks/useApi";
import { useTranslation } from "react-i18next";
import { toggleLanguage } from "@/i18n";

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string };

type AppNotification = {
  id: string;
  title: string;
  message: string | null;
  type: "INCIDENT" | "RESOLVED" | "ALERT" | "SYSTEM" | "DELIVERY" | "SECURITY" | "REPORT" | "MONITOR";
  severity: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  href: string | null;
  createdAt: string;
  read: boolean;
};

type NotificationSummary = {
  unreadCount: number;
  latest: AppNotification[];
};

const breadcrumbKeys: Record<string, string> = {
  dashboard:        "nav.dashboard",
  monitors:         "nav.monitors",
  results:          "nav.results",
  incidents:        "nav.incidents",
  alerts:           "nav.alerts",
  channels:         "nav.channels",
  reports:          "nav.reports",
  devices:          "nav.devices",
  interfaces:       "nav.interfaces",
  credentials:      "nav.credentials",
  groups:           "nav.groups",
  users:            "nav.users",
  "audit-logs":     "nav.auditLogs",
  settings:         "nav.settings",
  profile:          "nav.profile",
  "login-history":  "nav.loginHistory",
  "change-password":"nav.changePassword",
  notifications:    "nav.notifications",
  domain:           "nav.domain",
  "api-tokens":     "nav.apiTokens",
  "scheduled-reports": "nav.scheduledReports",
  "system-logs":    "nav.systemLogs",
};

const notificationDateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
});

const notificationTone: Record<AppNotification["type"], string> = {
  INCIDENT: "bg-rose-50 text-rose-700",
  ALERT: "bg-amber-50 text-amber-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  SYSTEM: "bg-slate-100 text-slate-700",
  DELIVERY: "bg-orange-50 text-orange-700",
  SECURITY: "bg-violet-50 text-violet-700",
  REPORT: "bg-cyan-50 text-cyan-700",
  MONITOR: "bg-blue-50 text-blue-700",
};

const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : notificationDateFormatter.format(date);
};

const IconSun = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
  </svg>
);

const IconMoon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
  </svg>
);

const Navbar = () => {
  const { api } = useApi();
  const { user, logout } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>({
    unreadCount: 0,
    latest: [],
  });
  const ref = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const segments = location.pathname.split("/").filter(Boolean);
  const breadcrumbs =
    segments.length > 0
      ? segments.map((segment, index) => ({
          label: breadcrumbKeys[segment] ? t(breadcrumbKeys[segment]) : segment.replace(/-/g, " "),
          path: `/${segments.slice(0, index + 1).join("/")}`,
          isLast: index === segments.length - 1,
        }))
      : [{ label: t("nav.dashboard"), path: "/dashboard", isLast: true }];

  const displayName = user?.username ?? "demo";
  const displayEmail = user?.email ?? "";
  const displayRole =
    typeof user?.role === "string" ? user.role : (user?.role?.name ?? "USER");
  const isAdmin = isAdminUser(user);

  const loadNotificationSummary = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<NotificationSummary>>("/notifications/summary");
      if (res.data.success) {
        setNotificationSummary(res.data.data);
      }
    } catch {
      // silent
    }
  }, [api]);

  const markNotificationRead = async (id: string) => {
    setNotificationSummary((current) => ({
      unreadCount: Math.max(current.unreadCount - (current.latest.find((item) => item.id === id && !item.read) ? 1 : 0), 0),
      latest: current.latest.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      void loadNotificationSummary();
    }
  };

  const markAllNotificationsRead = async () => {
    setNotificationSummary((current) => ({
      unreadCount: 0,
      latest: current.latest.map((item) => ({ ...item, read: true })),
    }));
    try {
      await api.patch("/notifications/read-all");
    } catch {
      void loadNotificationSummary();
    }
  };

  useEffect(() => {
    void loadNotificationSummary();
    const timer = window.setInterval(() => void loadNotificationSummary(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotificationSummary]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setNotificationOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="flex min-h-16 items-center justify-between border-b border-slate-100 bg-white px-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-900">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
        <Link
          to="/dashboard"
          className="flex items-center gap-1 text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span className="hidden sm:inline">{t("nav.home")}</span>
        </Link>

        {breadcrumbs.map((item) => (
          <div key={item.path} className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 dark:text-slate-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {item.isLast ? (
              <span className="font-medium text-slate-800 dark:text-slate-100">{item.label}</span>
            ) : (
              <Link to={item.path} className="text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200">
                {item.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {/* Notification dropdown */}
        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => { setNotificationOpen((v) => !v); setOpen(false); }}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none"
            aria-label="Open notifications"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            {notificationSummary.unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
                {notificationSummary.unreadCount > 9 ? "9+" : notificationSummary.unreadCount}
              </span>
            ) : null}
          </button>

          {notificationOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{t("notification.title")}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {notificationSummary.unreadCount.toLocaleString()} {t("notification.unread")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {t("notification.markAllRead")}
                </button>
              </div>

              <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
                {notificationSummary.latest.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t("notification.empty")}
                  </div>
                ) : null}
                {notificationSummary.latest.map((item) => {
                  const isRead = item.read;
                  return (
                    <Link
                      key={item.id}
                      to={item.href ?? "/notifications"}
                      onClick={() => { void markNotificationRead(item.id); setNotificationOpen(false); }}
                      className="block px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-700/60"
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isRead ? "bg-slate-300 dark:bg-slate-600" : "bg-cyan-500"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${notificationTone[item.type]}`}>
                              {item.type}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.message ?? "-"}</p>
                          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{formatNotificationDate(item.createdAt)}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 p-2 dark:border-slate-700">
                <Link
                  to="/notifications"
                  onClick={() => setNotificationOpen(false)}
                  className="flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
                >
                  {t("notification.viewAll")}
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        {/* Language toggle */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none"
          aria-label="Toggle language"
        >
          {i18n.language === "th" ? "EN" : "TH"}
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none"
          aria-label={theme === "dark" ? "เปลี่ยนเป็น Light mode" : "เปลี่ยนเป็น Dark mode"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>

        {/* User dropdown */}
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => { setOpen((v) => !v); setNotificationOpen(false); }}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
          >
            <img src={getAvatarUrl(displayName)} alt="avatar" className="h-9 w-9 rounded-full object-cover ring-2 ring-pink-200 dark:ring-pink-900" />
            <div className="hidden text-left sm:block">
              <p className="max-w-32 truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{displayRole}</p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
              {/* Profile header */}
              <div className="flex items-center gap-3 border-b border-slate-100 bg-linear-to-r from-pink-50 to-purple-50 px-4 py-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800/80">
                <img src={getAvatarUrl(displayName)} alt="avatar" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-pink-200 dark:ring-pink-900" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</p>
                  {displayEmail && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{displayEmail}</p>
                  )}
                  <span className="mt-1 inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/40 dark:text-pink-400">
                    {displayRole}
                  </span>
                </div>
              </div>

              {/* Account section */}
              <div className="p-1.5">
                <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("user.myAccount")}
                </p>
                {[
                  { to: "/profile",         label: t("user.profile"),         icon: <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /> },
                  { to: "/change-password", label: t("user.changePassword"),   icon: <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /> },
                  { to: "/login-history",   label: t("user.loginHistory"),     icon: <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 4a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd" /> },
                  { to: "/api-tokens",      label: t("user.apiTokens"),        icon: <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" /> },
                ].map(({ to, label, icon }) => (
                  <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                      {icon}
                    </svg>
                    {label}
                  </Link>
                ))}
              </div>

              <div className="mx-3 border-t border-slate-100 dark:border-slate-700" />

              {/* Settings section (admin) */}
              {isAdmin ? (
                <div className="p-1.5">
                  <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {t("user.configuration")}
                  </p>
                  {[
                    { to: "/settings", label: t("user.systemSettings"),      icon: <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /> },
                    { to: "/channels", label: t("user.notificationChannels"), icon: <><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" /><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" /></> },
                  ].map(({ to, label, icon }) => (
                    <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                        {icon}
                      </svg>
                      {label}
                    </Link>
                  ))}
                </div>
              ) : null}

              {/* Admin section */}
              {isAdmin && (
                <>
                  <div className="mx-3 border-t border-slate-100 dark:border-slate-700" />
                  <div className="p-1.5">
                    <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Admin
                    </p>
                    {[
                      { to: "/users",      label: t("user.manageUsers"),       icon: <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /> },
                      { to: "/audit-logs", label: t("user.auditLogs"),          icon: <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /> },
                      { to: "/domain",     label: t("user.domainIntelligence"), icon: <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16A8 8 0 0010 2zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" /> },
                    ].map(({ to, label, icon }) => (
                      <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                          {icon}
                        </svg>
                        {label}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              {/* Sign out */}
              <div className="border-t border-slate-100 p-1.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => { setOpen(false); void logout(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                  {t("user.signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
