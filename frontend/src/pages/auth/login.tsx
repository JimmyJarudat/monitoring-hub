import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useSession } from "@/contexts/session.context";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useSession();
  const [identifier, setIdentifier] = useState("demo");
  const [password, setPassword] = useState("1234");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const result = await login({ identifier, password });

    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success("เข้าสู่ระบบสำเร็จ");
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6">
          <p className="text-sm font-medium text-cyan-300">Monitoring Hub</p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-400">
            Access your monitoring dashboard.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm text-slate-300">Username</span>
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="demo"
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">Password</span>
            <input
              className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="1234"
              autoComplete="current-password"
            />
          </label>

          <button
            className="w-full rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Login
