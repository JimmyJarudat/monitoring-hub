import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSession } from "@/contexts/session.context";
import { isAdminUser } from "@/utils/permissions";
import { getAvatarUrl } from "@/utils/avatar";
import { mockNotifications, type MockNotification } from "@/data/mockNotifications";

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  monitors: "Monitors",
  results: "Monitor Results",
  incidents: "Incidents",
  alerts: "Alert Rules",
  channels: "Notification Channels",
  reports: "Reports",
  devices: "Devices",
  interfaces: "Interfaces",
  credentials: "Credentials",
  groups: "Groups",
  users: "Users",
  "audit-logs": "Audit Logs",
  settings: "Settings",
  profile: "My Profile",
  "login-history": "ประวัติการล็อกอินของฉัน",
  "change-password": "Change Password",
  notifications: "Notifications",
  domain: "Domain Intelligence",
};

const formatSegment = (segment: string) =>
  breadcrumbLabels[segment] ?? segment.replace(/-/g, " ");


const notificationDateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
});

const notificationTone: Record<MockNotification["type"], string> = {
  incident: "bg-rose-50 text-rose-700",
  alert: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  system: "bg-slate-100 text-slate-700",
};

const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : notificationDateFormatter.format(date);
};

const Navbar = () => {
  const { user, logout } = useSession();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(
    () => mockNotifications.filter((item) => item.read).map((item) => item.id),
  );
  const ref = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const segments = location.pathname.split("/").filter(Boolean);
  const breadcrumbs =
    segments.length > 0
      ? segments.map((segment, index) => ({
          label: formatSegment(segment),
          path: `/${segments.slice(0, index + 1).join("/")}`,
          isLast: index === segments.length - 1,
        }))
      : [{ label: "Dashboard", path: "/dashboard", isLast: true }];

  const displayName = user?.username ?? "demo";
  const displayEmail = user?.email ?? "";
  const displayRole =
    typeof user?.role === "string" ? user.role : (user?.role?.name ?? "USER");
  const isAdmin = isAdminUser(user);
  const visibleNotifications = mockNotifications.slice(0, 4);
  const unreadCount = mockNotifications.filter(
    (item) => !readNotificationIds.includes(item.id),
  ).length;
  const markNotificationRead = (id: string) => {
    setReadNotificationIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const markAllNotificationsRead = () => {
    setReadNotificationIds(mockNotifications.map((item) => item.id));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="flex min-h-16 items-center justify-between border-b border-slate-100 bg-white px-6 shadow-sm">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm">
        <Link
          to="/dashboard"
          className="flex items-center gap-1 text-slate-400 transition hover:text-slate-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span className="hidden sm:inline">Home</span>
        </Link>

        {breadcrumbs.map((item) => (
          <div key={item.path} className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {item.isLast ? (
              <span className="font-medium text-slate-800">{item.label}</span>
            ) : (
              <Link to={item.path} className="text-slate-400 transition hover:text-slate-700">
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
          onClick={() => {
            setNotificationOpen((value) => !value);
            setOpen(false);
          }}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none"
          aria-label="Open notifications"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>

        {notificationOpen ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">การแจ้งเตือน</p>
                <p className="mt-0.5 text-xs text-slate-500">Mock data สำหรับโครง UI</p>
              </div>
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                อ่านทั้งหมด
              </button>
            </div>

            <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {visibleNotifications.map((item) => {
                const isRead = readNotificationIds.includes(item.id);
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    onClick={() => {
                      markNotificationRead(item.id);
                      setNotificationOpen(false);
                    }}
                    className="block px-4 py-3 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isRead ? "bg-slate-300" : "bg-cyan-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${notificationTone[item.type]}`}>
                            {item.type}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.message}</p>
                        <p className="mt-2 text-[11px] text-slate-400">{formatNotificationDate(item.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="border-t border-slate-100 p-2">
              <Link
                to="/notifications"
                onClick={() => setNotificationOpen(false)}
                className="flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
              >
                ดูการแจ้งเตือนทั้งหมด
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* User dropdown */}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setNotificationOpen(false);
          }}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-100 focus:outline-none"
        >
          <img src={getAvatarUrl(displayName)} alt="avatar" className="h-9 w-9 rounded-full object-cover ring-2 ring-pink-200" />
          <div className="hidden text-left sm:block">
            <p className="max-w-32 truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="text-xs text-slate-400">{displayRole}</p>
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
          <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">

            {/* Profile header */}
            <div className="flex items-center gap-3 border-b border-slate-100 bg-linear-to-r from-pink-50 to-purple-50 px-4 py-3">
              <img src={getAvatarUrl(displayName)} alt="avatar" className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-pink-200" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                {displayEmail && (
                  <p className="truncate text-xs text-slate-500">{displayEmail}</p>
                )}
                <span className="mt-1 inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">
                  {displayRole}
                </span>
              </div>
            </div>

            {/* Account section */}
            <div className="p-1.5">
              <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                บัญชีของฉัน
              </p>
              <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                โปรไฟล์ของฉัน
              </Link>
              <Link to="/change-password" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                เปลี่ยนรหัสผ่าน
              </Link>
              <Link to="/login-history" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 4a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd" />
                </svg>
                ประวัติการล็อกอินของฉัน
              </Link>
            </div>

            <div className="mx-3 border-t border-slate-100" />

            {/* Preferences section */}
            {isAdmin ? (
              <div className="p-1.5">
                <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  การตั้งค่า
                </p>
                <Link to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  ตั้งค่าระบบ
                </Link>
                <Link to="/channels" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                    <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                  </svg>
                  ช่องทางแจ้งเตือน
                </Link>
              </div>
            ) : null}

            {/* Admin section */}
            {isAdmin && (
              <>
                <div className="mx-3 border-t border-slate-100" />
                <div className="p-1.5">
                  <p className="mb-0.5 px-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Admin
                  </p>
                  <Link to="/users" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                    จัดการผู้ใช้งาน
                  </Link>
                  <Link to="/audit-logs" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    Audit Logs
                  </Link>
                  <Link to="/domain" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16A8 8 0 0010 2zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                    </svg>
                    Domain Intelligence
                  </Link>
                </div>
              </>
            )}

            {/* Sign out */}
            <div className="border-t border-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); void logout(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                </svg>
                ออกจากระบบ
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
