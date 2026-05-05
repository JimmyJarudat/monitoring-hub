import { Link, useLocation } from "react-router-dom";
import { useSession } from "@/contexts/session.context";

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  monitors: "Monitors",
  results: "Monitor Results",
  incidents: "Incidents",
  alerts: "Alert Rules",
  channels: "Notification Channels",
  reports: "Reports",
  users: "Users",
  "audit-logs": "Audit Logs",
  settings: "Settings",
};

const formatSegment = (segment: string) => {
  return breadcrumbLabels[segment] ?? segment.replace(/-/g, " ");
};

const Navbar = () => {
  const { user, logout } = useSession();
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const breadcrumbs =
    segments.length > 0
      ? segments.map((segment, index) => ({
          label: formatSegment(segment),
          path: `/${segments.slice(0, index + 1).join("/")}`,
          isLast: index === segments.length - 1,
        }))
      : [{ label: "Dashboard", path: "/dashboard", isLast: true }];

  const currentPage = breadcrumbs[breadcrumbs.length - 1]?.label ?? "Dashboard";
  const displayName = user?.username ?? "demo";
  const displayRole =
    typeof user?.role === "string" ? user.role : user?.role?.name ?? "USER";

  return (
    <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="min-w-0">
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link className="transition hover:text-slate-900" to="/dashboard">
            Home
          </Link>

          {breadcrumbs.map((item) => (
            <div className="flex min-w-0 items-center gap-2" key={item.path}>
              <span className="text-slate-300">/</span>
              {item.isLast ? (
                <span className="truncate font-medium text-slate-700">{item.label}</span>
              ) : (
                <Link
                  className="truncate transition hover:text-slate-900"
                  to={item.path}
                >
                  {item.label}
                </Link>
              )}
            </div>
          ))}
        </nav>

        <h1 className="mt-1 truncate text-lg font-semibold text-slate-950">
          {currentPage}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-2 pr-4 sm:flex">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-sm font-bold text-cyan-300 ring-2 ring-white">
            {user?.email ? (
              <img
                className="h-full w-full object-cover"
                src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(displayName)}`}
                alt={displayName}
              />
            ) : (
              displayName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-36 truncate text-sm font-semibold text-slate-900">
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{displayRole}</p>
          </div>
        </div>

        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
          type="button"
          onClick={() => void logout()}
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Navbar;
