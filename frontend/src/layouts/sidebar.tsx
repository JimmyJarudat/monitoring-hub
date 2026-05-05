import { NavLink } from "react-router-dom";

type SidebarItem = {
  label: string;
  path: string;
  icon: string;
  badge?: string;
  end?: boolean;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const brand = {
  name: "Monitoring Hub",
  tagline: "Lightweight NMS",
  logoSrc: "",
  logoText: "MH",
};

const sidebarSections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: "D", end: true },
      { label: "Status Map", path: "/dashboard/status-map", icon: "S", badge: "Soon" },
      { label: "Reports", path: "/dashboard/reports", icon: "R", badge: "Soon" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Devices", path: "/dashboard/devices", icon: "V", badge: "Soon" },
      { label: "Add Device", path: "/dashboard/devices/new", icon: "+", badge: "Soon" },
      { label: "Groups", path: "/dashboard/groups", icon: "G", badge: "Soon" },
      { label: "Credentials", path: "/dashboard/credentials", icon: "K", badge: "Soon" },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Monitors", path: "/dashboard/monitors", icon: "M" },
      { label: "Add Monitor", path: "/dashboard/monitors/new", icon: "+" },
      { label: "Results", path: "/dashboard/results", icon: "T", badge: "Soon" },
      { label: "Incidents", path: "/dashboard/incidents", icon: "I", badge: "Soon" },
    ],
  },
  {
    title: "Alerting",
    items: [
      { label: "Alert Rules", path: "/dashboard/alerts", icon: "A", badge: "Soon" },
      { label: "Channels", path: "/dashboard/channels", icon: "C", badge: "Soon" },
      { label: "Maintenance", path: "/dashboard/maintenance", icon: "N", badge: "Soon" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users", path: "/dashboard/users", icon: "U", badge: "Soon" },
      { label: "Audit Logs", path: "/dashboard/audit-logs", icon: "L", badge: "Soon" },
      { label: "Settings", path: "/dashboard/settings", icon: "S", badge: "Soon" },
    ],
  },
];

const Sidebar = () => {
  return (
    <aside className="flex h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 text-white">
      <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-5">
        {brand.logoSrc ? (
          <img
            className="h-10 w-10 rounded-lg object-cover"
            src={brand.logoSrc}
            alt={`${brand.name} logo`}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20">
            {brand.logoText}
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{brand.name}</p>
          <p className="truncate text-xs text-slate-400">{brand.tagline}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 scrollbar-thin">
        {sidebarSections.map((section) => (
          <section key={section.title}>
            <h2 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {section.title}
            </h2>

            <div className="mt-2 space-y-1">
              {section.items.map((item) => (
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
        ))}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs font-medium text-slate-300">API Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400">Ready for checks</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
