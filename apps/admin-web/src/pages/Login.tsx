import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

const features = [
  "Multi-account WhatsApp management",
  "Media stored securely in cloud storage",
  "Real-time webhooks and event delivery",
  "Logs, parameters and audit-ready operations",
];

export function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Auth backend is not wired yet — this is the console foundation.
    navigate("/dashboard");
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid gap-10 lg:grid-cols-2 items-center">
        {/* Marketing panel */}
        <div className="hidden lg:block">
          <h1 className="text-2xl font-bold text-brand-900">Capture. Store. Deliver.</h1>
          <p className="mt-3 text-slate-600 max-w-md">
            Reliable WhatsApp messaging pipeline with cloud storage, webhooks and
            enterprise-grade controls.
          </p>
          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-slate-700">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-600 text-sm">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-brand-500 text-white flex items-center justify-center text-2xl">
              ◗
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              WhatsApp Gateway Console
            </h2>
            <p className="text-slate-500">Conversation Capture Service</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email or Username
              </label>
              <input
                type="text"
                autoComplete="username"
                placeholder="Enter your email or username"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                MFA Code
              </label>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit code"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Sign In
            </button>

            <div className="text-center">
              <a className="text-sm text-brand-600 hover:underline" href="#">
                Forgot password?
              </a>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Environment:{" "}
              <span className="font-medium text-brand-700">Production</span>
            </span>
            <span className="flex items-center gap-2">
              Gateway Status:
              <span className="font-medium text-brand-700">Online</span>
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
