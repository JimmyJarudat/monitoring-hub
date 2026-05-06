import { Link } from "react-router-dom";
import { useSession } from "@/contexts/session.context";

const featureCards = [
  {
    title: "Monitor Everything",
    description:
      "Track web services, ports, databases, Docker endpoints, and the next wave of network devices from one place.",
  },
  {
    title: "Investigate Fast",
    description:
      "See recent results, filter by time range, and move from global results into each monitor detail without losing context.",
  },
  {
    title: "Build Toward NMS",
    description:
      "The platform is set up to grow into SNMP-based device monitoring, incidents, alerting, and long-term history management.",
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
              <p className="mt-1 text-sm text-slate-400">Lightweight Monitor direction</p>
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
                  Public Entry
                </p>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  Central monitoring for services now, device visibility next.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                  This front page stays public. The working area behind it requires login, so
                  monitors, results, and operational controls remain private.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    className="rounded-md bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    to="/login"
                  >
                    Sign in to continue
                  </Link>
                  <Link
                    className="rounded-md border border-slate-700 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                    to="/results"
                  >
                    Private Results Area
                  </Link>
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
