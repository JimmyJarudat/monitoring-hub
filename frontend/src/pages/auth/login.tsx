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
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const resetCodeValue = resetCode.join("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextIdentifier = String(formData.get("identifier") ?? "").trim();
    const nextPassword = String(formData.get("password") ?? "");

    if (!nextIdentifier || !nextPassword) {
      toast.error("Please enter your username/email and password");
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
        toast.success("Email sent successfully, please check your inbox");
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
      toast.error("Please enter your email");
      setResetStep("email");
      return;
    }

    if (!/^\d{6}$/.test(resetCodeValue)) {
      toast.error("Please enter the 6-digit verification code");
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
      toast.error("Please enter your email");
      return;
    }

    if (!/^\d{6}$/.test(resetCodeValue)) {
      toast.error("Please enter the 6-digit verification code");
      setResetStep("code");
      return;
    }

    if (!newPassword) {
      toast.error("Please enter a new password");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.22),transparent_28%),radial-gradient(circle_at_78%_32%,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_55%,#111827_100%)]" />

      <div className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link to="/" className="inline-flex items-center text-2xl font-semibold text-white">
              Monitoring Hub
            </Link>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-7">
              <p className="text-sm font-semibold text-cyan-400">Secure sign in</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Use your username or email to continue to Monitoring Hub.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Username or email</span>
                <input
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/8 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/20"
                  type="text"
                  name="identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="name@company.com"
                  autoComplete="username"
                  autoFocus
                />
              </label>

              <div className="block">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-300">Password</span>
                  <button
                    className="text-sm font-semibold text-cyan-400 transition hover:text-cyan-300"
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
                <div className="relative mt-2">
                  <input
                    className="w-full rounded-lg border border-white/10 bg-white/8 px-3.5 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/20"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                className="flex w-full items-center justify-center rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {isResetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-cyan-400">Password recovery</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Reset your password</h3>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-lg leading-none text-slate-400 transition hover:bg-white/10 hover:text-white"
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
                  <span className="text-sm font-medium text-slate-300">Email</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20"
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </label>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm leading-6 text-amber-300">
                  ใส่อีเมลแล้วกดส่ง ระบบจะส่งรหัสยืนยัน 6 หลักไปยังอีเมลของบัญชีนั้น
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                    type="button"
                    onClick={closeResetDialog}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-3 text-sm leading-6 text-cyan-300">
                  ส่งอีเมลสำเร็จ กรุณาตรวจสอบอีเมล <span className="font-semibold">{resetEmail}</span>
                </div>

                <div>
                  <span className="text-sm font-medium text-slate-300">Verification code</span>
                  <div className="mt-2 grid grid-cols-6 gap-2">
                    {resetCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          codeInputRefs.current[index] = element;
                        }}
                        className="h-12 rounded-lg border border-white/10 bg-white/5 text-center font-mono text-xl font-semibold text-white outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20"
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
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                    type="button"
                    onClick={() => {
                      setResetStep("email");
                      setResetCode(Array.from({ length: RESET_CODE_LENGTH }, () => ""));
                    }}
                  >
                    Back
                  </button>
                  <button
                    className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm leading-6 text-emerald-300">
                  ยืนยันรหัสสำเร็จ กรุณาตั้งรหัสผ่านใหม่
                </div>

                <div className="block">
                  <span className="text-sm font-medium text-slate-300">New password</span>
                  <div className="relative mt-2">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
                      aria-label={showNewPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    >
                      {showNewPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="block">
                  <span className="text-sm font-medium text-slate-300">Confirm password</span>
                  <div className="relative mt-2">
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-200"
                      aria-label={showConfirmPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    >
                      {showConfirmPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
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
