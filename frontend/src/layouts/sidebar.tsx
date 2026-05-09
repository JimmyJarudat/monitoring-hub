import { NavLink } from "react-router-dom";
import { useSession } from "@/contexts/session.context";
import { useSystemConfig } from "@/contexts/systemConfig.context";
import { isAdminUser } from "@/utils/permissions";
import { API_BASE_URL } from "@/lib/constants";

type SidebarItem = {
  label: string;
  path: string;
  icon: string;
  badge?: string;
  end?: boolean;
  adminOnly?: boolean;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};


const sidebarSections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: "D", end: true },
      { label: "Status Map", path: "/status-map", icon: "S" },
      { label: "Reports", path: "/reports", icon: "R" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Devices", path: "/devices", icon: "V" },
      { label: "Interfaces", path: "/interfaces", icon: "If" },
      { label: "Add Device", path: "/monitors/new", icon: "+", adminOnly: true },
      { label: "Groups", path: "/groups", icon: "G" },
      { label: "Credentials", path: "/credentials", icon: "K", adminOnly: true },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Monitors", path: "/monitors", icon: "M" },
      { label: "Add Monitor", path: "/monitors/new", icon: "+", adminOnly: true },
      { label: "Results", path: "/results", icon: "T" },
      { label: "Incidents", path: "/incidents", icon: "I" },
    ],
  },
  {
    title: "Alerting",
    items: [
      { label: "Alert Rules", path: "/alerts", icon: "A", adminOnly: true },
      { label: "Channels", path: "/channels", icon: "C", adminOnly: true },
      // { label: "Maintenance", path: "/maintenance", icon: "N", badge: "Soon" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users", path: "/users", icon: "U", adminOnly: true },
      { label: "Audit Logs", path: "/audit-logs", icon: "L", adminOnly: true },
      { label: "System Logs", path: "/system-logs", icon: "Lg", adminOnly: true },
      { label: "Scheduled Reports", path: "/scheduled-reports", icon: "Sr", adminOnly: true },
      { label: "Settings", path: "/settings", icon: "S", adminOnly: true },
      // ไม่แสดงใน sidebar แสดงใน nav dropdown พอ
      // { label: "Domain Intel", path: "/domain", icon: "Di", adminOnly: true },
    ],
  },
];

const Sidebar = () => {
  const { user } = useSession();
  const isAdmin = isAdminUser(user);
  const { config } = useSystemConfig();

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 text-white">
      <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-5">
        {config.general.logoUrl ? (
          <img
            src={`${API_BASE_URL}${config.general.logoUrl}?v=${Date.now()}`}
            alt="logo"
            className="h-10 w-10 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20">
            {config.general.logoText}
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{config.general.systemName}</p>
          <p className="truncate text-xs text-slate-400">{config.general.tagline}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 scrollbar-thin">
        {sidebarSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <section key={section.title}>
              <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {section.title}
              </h2>

              <div className="mt-2 space-y-1">
                {visibleItems.map((item) => (
                  <NavLink
                    className={({ isActive }) =>
                      [
                        "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                        isActive
                          ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/15"
                          : "text-slate-300 hover:bg-slate-900 hover:text-white",
                      ].join(" ")
                    }
                    end={item.end}
                    key={item.path}
                    to={item.path}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={[
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold transition",
                            isActive
                              ? "bg-slate-950 text-cyan-300"
                              : "bg-slate-900 text-slate-400 group-hover:bg-slate-800 group-hover:text-cyan-300",
                          ].join(" ")}
                        >
                          {item.icon}
                        </span>

                        <span className="min-w-0 flex-1 truncate">{item.label}</span>

                        {item.badge ? (
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              isActive
                                ? "bg-slate-950/15 text-slate-900"
                                : "bg-slate-800 text-slate-400",
                            ].join(" ")}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-4 py-3">
        <div className="rounded-xl border border-slate-700/60 bg-linear-to-b from-slate-800/60 to-slate-900/80 px-3.5 py-3 shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 truncate">
              {config.general.systemName}
            </span>
            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-400 border border-cyan-400/20 shrink-0 ml-2">
              v{__APP_VERSION__}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
