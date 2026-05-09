import axios from "axios";
import { type FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useSession } from "@/contexts/session.context";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";
const RESET_CODE_LENGTH = 6;

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<ApiFailure>(error)) {
    return error.response?.data?.message ?? error.message;
  }

  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
};

const Login = () => {
  const navigate = useNavigate();
  const { login } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetStep, setResetStep] = useState<"email" | "code" | "password">("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState<string[]>(() => Array.from({ length: RESET_CODE_LENGTH }, () => ""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [isCodeVerifying, setIsCodeVerifying] = useState(false);
  const [isPasswordResetting, setIsPasswordResetting] = useState(false);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const resetCodeValue = resetCode.join("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextIdentifier = String(formData.get("identifier") ?? "").trim();
    const nextPassword = String(formData.get("password") ?? "");

    if (!nextIdentifier || !nextPassword) {
      toast.error("กรุณากรอก username/email และ password");
      return;
    }

    setIsSubmitting(true);
    const result = await login({ identifier: nextIdentifier, password: nextPassword });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    navigate("/dashboard", { replace: true });
  };

  const handleResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = resetEmail.trim().toLowerCase();
    if (!value) return;

    setIsResetSubmitting(true);
    try {
      const response = await axios.post<ApiResponse<{ message: string }>>(
        `${API_BASE_URL}/auth/password-reset/request`,
        { email: value },
      );

      if (response.data.success) {
        toast.success("ส่งอีเมลสำเร็จ กรุณาตรวจสอบอีเมล");
        setResetStep("code");
        window.setTimeout(() => codeInputRefs.current[0]?.focus(), 50);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setResetCode((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    if (digit && index < RESET_CODE_LENGTH - 1) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, RESET_CODE_LENGTH).split("");
    if (digits.length === 0) return;

    setResetCode(Array.from({ length: RESET_CODE_LENGTH }, (_, index) => digits[index] ?? ""));
    window.setTimeout(() => codeInputRefs.current[Math.min(digits.length, RESET_CODE_LENGTH) - 1]?.focus(), 0);
  };

  const handleCodeKeyDown = (index: number, key: string) => {
    if (key !== "Backspace" || resetCode[index] || index === 0) return;
    codeInputRefs.current[index - 1]?.focus();
  };

  const handleCodeVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetEmail.trim()) {
      toast.error("กรุณากรอกอีเมล");
      setResetStep("email");
      return;
    }

    if (!/^\d{6}$/.test(resetCodeValue)) {
      toast.error("กรุณากรอกรหัสยืนยัน 6 หลัก");
      return;
    }

    setIsCodeVerifying(true);
    try {
      const response = await axios.post<ApiResponse<{ message: string }>>(
        `${API_BASE_URL}/auth/password-reset/verify`,
        { email: resetEmail.trim().toLowerCase(), code: resetCodeValue },
      );

      if (response.data.success) {
        toast.success(response.data.data.message);
        setResetStep("password");
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCodeVerifying(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!resetEmail.trim()) {
      toast.error("กรุณากรอกอีเมล");
      return;
    }

    if (!/^\d{6}$/.test(resetCodeValue)) {
      toast.error("กรุณากรอกรหัสยืนยัน 6 หลัก");
      setResetStep("code");
      return;
    }

    if (!newPassword) {
      toast.error("กรุณากรอกรหัสผ่านใหม่");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Password ไม่ตรงกัน");
      return;
    }

    setIsPasswordResetting(true);
    try {
      const response = await axios.post<ApiResponse<{ message: string }>>(
        `${API_BASE_URL}/auth/password-reset/confirm`,
        { email: resetEmail.trim().toLowerCase(), code: resetCodeValue, password: newPassword },
      );

      if (response.data.success) {
        toast.success(response.data.data.message);
        setPassword("");
        setResetEmail("");
        setResetCode(Array.from({ length: RESET_CODE_LENGTH }, () => ""));
        setResetStep("email");
        setNewPassword("");
        setConfirmPassword("");
        setIsResetOpen(false);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsPasswordResetting(false);
    }
  };

  const closeResetDialog = () => {
    setIsResetOpen(false);
    setResetStep("email");
    setResetEmail("");
    setResetCode(Array.from({ length: RESET_CODE_LENGTH }, () => ""));
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <section className="relative hidden overflow-hidden bg-slate-950 text-white lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.22),transparent_28%),radial-gradient(circle_at_78%_32%,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_55%,#111827_100%)]" />
          <div className="relative flex h-full flex-col justify-between px-12 py-10">
            <Link to="/" className="inline-flex w-fit items-center text-2xl font-semibold text-white">
              Monitoring Hub
            </Link>

            <div className="max-w-xl pb-12">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Account access</p>
              <h1 className="mt-5 text-5xl font-semibold leading-tight text-white">
                Sign in to continue managing your monitoring workspace.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
                Use your authorized account to review current service status, acknowledge incidents, and keep notification workflows under control.
              </p>
            </div>

            <div className="grid max-w-2xl grid-cols-3 gap-3 pb-2">
              {[
                ["Secure", "authenticated session"],
                ["Reset", "email verification"],
                ["Audit", "login activity"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <p className="text-xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-300">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link to="/" className="inline-flex items-center text-xl font-semibold text-slate-950">
                Monitoring Hub
              </Link>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8">
              <div className="mb-7">
                <p className="text-sm font-semibold text-cyan-700">Secure sign in</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Use your username or email to continue to Monitoring Hub.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Username or email</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="text"
                    name="identifier"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="username"
                    autoFocus
                  />
                </label>

                <label className="block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <button
                      className="text-sm font-semibold text-cyan-700 transition hover:text-cyan-900"
                      type="button"
                      onClick={() => {
                        setResetStep("email");
                        setResetEmail(identifier.includes("@") ? identifier : "");
                        setResetCode(Array.from({ length: RESET_CODE_LENGTH }, () => ""));
                        setNewPassword("");
                        setConfirmPassword("");
                        setIsResetOpen(true);
                      }}
                    >
                      Reset password
                    </button>
                  </span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="password"
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </label>

                <button
                  className="flex w-full items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>

      {isResetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-cyan-700">Password recovery</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Reset your password</h3>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-lg leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                type="button"
                onClick={closeResetDialog}
                aria-label="Close password reset dialog"
              >
                ×
              </button>
            </div>

            {resetStep === "email" ? (
              <form className="mt-5 space-y-4" onSubmit={handleResetRequest}>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </label>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-6 text-amber-900">
                  ใส่อีเมลแล้วกดส่ง ระบบจะส่งรหัสยืนยัน 6 หลักไปยังอีเมลของบัญชีนั้น
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    type="button"
                    onClick={closeResetDialog}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    type="submit"
                    disabled={isResetSubmitting || resetEmail.trim().length === 0}
                  >
                    {isResetSubmitting ? "Sending..." : "Send code"}
                  </button>
                </div>
              </form>
            ) : null}

            {resetStep === "code" ? (
              <form className="mt-5 space-y-4" onSubmit={handleCodeVerify}>
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3.5 py-3 text-sm leading-6 text-cyan-950">
                  ส่งอีเมลสำเร็จ กรุณาตรวจสอบอีเมล <span className="font-semibold">{resetEmail}</span>
                </div>

                <div>
                  <span className="text-sm font-medium text-slate-700">Verification code</span>
                  <div className="mt-2 grid grid-cols-6 gap-2">
                    {resetCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          codeInputRefs.current[index] = element;
                        }}
                        className="h-12 rounded-lg border border-slate-300 bg-white text-center font-mono text-xl font-semibold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(event) => handleCodeChange(index, event.target.value)}
                        onPaste={(event) => {
                          event.preventDefault();
                          handleCodePaste(event.clipboardData.getData("text"));
                        }}
                        onKeyDown={(event) => handleCodeKeyDown(index, event.key)}
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <button
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    type="button"
                    onClick={() => {
                      setResetStep("email");
                      setResetCode(Array.from({ length: RESET_CODE_LENGTH }, () => ""));
                    }}
                  >
                    Back
                  </button>
                  <button
                    className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    type="submit"
                    disabled={isCodeVerifying || resetCodeValue.length !== RESET_CODE_LENGTH}
                  >
                    {isCodeVerifying ? "Verifying..." : "Verify code"}
                  </button>
                </div>
              </form>
            ) : null}

            {resetStep === "password" ? (
              <form className="mt-5 space-y-4" onSubmit={handlePasswordReset}>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-6 text-emerald-900">
                  ยืนยันรหัสสำเร็จ กรุณาตั้งรหัสผ่านใหม่
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">New password</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Confirm password</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </label>

                <button
                  className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  type="submit"
                  disabled={isPasswordResetting}
                >
                  {isPasswordResetting ? "Resetting..." : "Reset password"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default Login;
