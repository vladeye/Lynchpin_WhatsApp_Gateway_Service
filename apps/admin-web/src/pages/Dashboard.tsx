import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

function StatusCard({
  title,
  value,
  detail,
  tone = "neutral",
}: {
  title: string;
  value: string;
  detail: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  const dot =
    tone === "ok"
      ? "bg-brand-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-slate-300";
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{title}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

export function DashboardPage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
  });
  const ready = useQuery({
    queryKey: ["ready"],
    queryFn: api.ready,
    refetchInterval: 10_000,
  });

  const gatewayOnline = health.data?.status === "ok";
  const apiReady = ready.data?.checks?.api === "ok";

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white">
              ◗
            </span>
            <div>
              <div className="font-semibold text-slate-900">
                WhatsApp Gateway Console
              </div>
              <div className="text-xs text-slate-500">developer-01</div>
            </div>
          </div>
          <Link to="/" className="text-sm text-brand-600 hover:underline">
            Sign out
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-500">Live gateway service status.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            title="Gateway"
            value={
              health.isLoading
                ? "Checking…"
                : gatewayOnline
                  ? "Online"
                  : "Unreachable"
            }
            detail="HTTP API"
            tone={gatewayOnline ? "ok" : health.isLoading ? "neutral" : "warn"}
          />
          <StatusCard
            title="Readiness"
            value={
              ready.isLoading ? "Checking…" : apiReady ? "Ready" : "Not ready"
            }
            detail="/ready probe"
            tone={apiReady ? "ok" : ready.isLoading ? "neutral" : "warn"}
          />
          <StatusCard
            title="Database"
            value="Not configured"
            detail="Postgres — coming soon"
            tone="neutral"
          />
          <StatusCard
            title="n8n Webhook"
            value="Not configured"
            detail="developer-01 — coming soon"
            tone="neutral"
          />
        </div>

        <div className="mt-8 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Connected WhatsApp Accounts</h2>
          <p className="mt-2 text-slate-500">
            No accounts yet. Account management and QR connection land in an
            upcoming release.
          </p>
        </div>
      </main>
    </div>
  );
}
