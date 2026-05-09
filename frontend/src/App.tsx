import { Link } from "react-router-dom";
import { useSession } from "@/contexts/session.context";

const featureCards = [
  {
    title: "Broad Monitor Coverage",
    description:
      "Create HTTP, TCP, ping, DNS, TLS, database, Docker, and SNMP monitors with the checks each type actually needs.",
  },
  {
    title: "Device And Network Visibility",
    description:
      "Track device identity, CPU, memory, disk, uptime, interface traffic, errors, discards, and historical metric trends.",
  },
  {
    title: "Incidents, Alerts, And Audit",
    description:
      "Turn degraded checks into incidents, route notifications through configured channels, and keep access history traceable.",
  },
];

const App = () => {
  const { isAuthenticated } = useSession();

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-cyan-300">Monitoring Hub</p>
              <p className="mt-1 text-sm text-slate-400">Service, device, and incident monitoring</p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                to="/login"
              >
                Login
              </Link>
              {isAuthenticated ? (
                <Link
                  className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                  to="/dashboard"
                >
                  Open Dashboard
                </Link>
              ) : null}
            </div>
          </header>

          <div className="flex flex-1 items-center py-12 lg:py-16">
            <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
                  Monitoring workspace
                </p>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  One place to monitor services, devices, incidents, and alerts.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                  Monitoring Hub combines lightweight uptime checks with NMS-style device insight, grouped inventory,
                  reusable credentials, alert rules, notification channels, audit logs, and availability reports.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    to="/login"
                  >
                    Sign in to continue
                  </Link>
                  {/* <Link
                    className="rounded-md border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                    to="/dashboard"
                  >
                    View operations dashboard
                  </Link> */}
                </div>
              </div>

              <div className="grid gap-4">
                {featureCards.map((card) => (
                  <article
                    className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 backdrop-blur"
                    key={card.title}
                  >
                    <h2 className="text-base font-semibold text-white">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default App;
