import { NavLink, Outlet, useNavigate } from "react-router-dom";

const nav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/accounts", label: "Accounts" },
  { to: "/logs", label: "Logs" },
  { to: "/parameters", label: "Parameters" },
  { to: "/security", label: "Security" },
];

export function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full bg-slate-50 flex">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
            ◗
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">
              WhatsApp Gateway
            </div>
            <div className="text-xs text-slate-400">developer-01</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => navigate("/")}
          className="m-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 text-left"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function StateBadge({ state }: { state: string }) {
  const tone: Record<string, string> = {
    connected: "bg-brand-50 text-brand-700",
    connecting: "bg-amber-50 text-amber-700",
    waiting_qr: "bg-blue-50 text-blue-700",
    waiting_code: "bg-blue-50 text-blue-700",
    disconnected: "bg-amber-50 text-amber-700",
    logged_out: "bg-red-50 text-red-700",
    error: "bg-red-50 text-red-700",
    created: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone[state] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {state}
    </span>
  );
}
