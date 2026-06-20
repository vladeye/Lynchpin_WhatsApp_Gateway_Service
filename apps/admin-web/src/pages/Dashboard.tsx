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
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: api.listAccounts,
    refetchInterval: 10_000,
  });

  const gatewayOnline = health.data?.status === "ok";
  const apiReady = ready.data?.checks?.api === "ok";
  const connectedCount =
    accounts.data?.filter((a) => a.state === "connected").length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-500">Live gateway service status.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Gateway"
          value={
            health.isLoading ? "Checking…" : gatewayOnline ? "Online" : "Unreachable"
          }
          detail="HTTP API"
          tone={gatewayOnline ? "ok" : health.isLoading ? "neutral" : "warn"}
        />
        <StatusCard
          title="Readiness"
          value={ready.isLoading ? "Checking…" : apiReady ? "Ready" : "Not ready"}
          detail="/ready probe"
          tone={apiReady ? "ok" : ready.isLoading ? "neutral" : "warn"}
        />
        <StatusCard
          title="Accounts"
          value={String(accounts.data?.length ?? 0)}
          detail={`${connectedCount} connected`}
          tone={connectedCount > 0 ? "ok" : "neutral"}
        />
        <StatusCard
          title="n8n Webhook"
          value="See Parameters"
          detail="developer-01"
          tone="neutral"
        />
      </div>

      <div className="mt-8 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">WhatsApp Accounts</h2>
        <p className="mt-2 text-slate-500">
          Manage sessions and connect via QR on the{" "}
          <Link to="/accounts" className="text-brand-600 hover:underline">
            Accounts
          </Link>{" "}
          screen.
        </p>
      </div>
    </div>
  );
}
