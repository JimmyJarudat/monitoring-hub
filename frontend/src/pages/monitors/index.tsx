import { Link } from "react-router-dom";

type MonitorStatus = "UP" | "DOWN" | "DEGRADED";

type MonitorRow = {
  id: string;
  name: string;
  type: "PING" | "TCP" | "HTTP" | "DOCKER" | "DATABASE";
  target: string;
  status: MonitorStatus;
  interval: string;
  responseTime: string;
  lastChecked: string;
};

const monitors: MonitorRow[] = [
  {
    id: "mon-web-01",
    name: "Main Website",
    type: "HTTP",
    target: "https://example.com",
    status: "UP",
    interval: "60s",
    responseTime: "184 ms",
    lastChecked: "just now",
  },
  {
    id: "mon-db-01",
    name: "Primary Database",
    type: "DATABASE",
    target: "postgres.internal:5432",
    status: "DEGRADED",
    interval: "60s",
    responseTime: "812 ms",
    lastChecked: "1 min ago",
  },
  {
    id: "mon-router-01",
    name: "Edge Router",
    type: "PING",
    target: "10.10.0.1",
    status: "DOWN",
    interval: "30s",
    responseTime: "-",
    lastChecked: "2 min ago",
  },
];

const statusStyles: Record<MonitorStatus, string> = {
  UP: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DOWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const summary = [
  { label: "Total", value: monitors.length, className: "text-slate-950" },
  { label: "Up", value: monitors.filter((item) => item.status === "UP").length, className: "text-emerald-600" },
  { label: "Degraded", value: monitors.filter((item) => item.status === "DEGRADED").length, className: "text-amber-600" },
  { label: "Down", value: monitors.filter((item) => item.status === "DOWN").length, className: "text-rose-600" },
];

const MonitorsPage = () => {
  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-700">Monitoring</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Monitors</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Manage health checks for services, devices, databases, and infrastructure targets.
          </p>
        </div>

        <Link
          className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          to="/dashboard/monitors/new"
        >
          Add Monitor
        </Link>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <div className="rounded-lg border border-slate-200 bg-white p-4" key={item.label}>
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.className}`}>{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Active monitor inventory</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Interval</th>
                <th className="px-4 py-3">Response</th>
                <th className="px-4 py-3">Last checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monitors.map((monitor) => (
                <tr className="transition hover:bg-slate-50" key={monitor.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">
                    {monitor.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{monitor.type}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{monitor.target}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[monitor.status]}`}
                    >
                      {monitor.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{monitor.interval}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{monitor.responseTime}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{monitor.lastChecked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MonitorsPage;
