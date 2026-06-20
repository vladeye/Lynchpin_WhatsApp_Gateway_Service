import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const LABELS: Record<string, string> = {
  environment: "Environment",
  n8n_webhook_base_url: "n8n Webhook Base URL",
  webhook_signing: "Webhook Signing",
  session_root: "Session Root",
  max_text_length: "Max Text Length",
  log_level: "Log Level",
};

export function ParametersPage() {
  const params = useQuery({ queryKey: ["parameters"], queryFn: api.parameters });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Parameters</h1>
      <p className="text-slate-500">
        Effective gateway configuration (read-only). Editing arrives in a later
        release.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {params.data &&
          Object.entries(params.data).map(([key, value]) => (
            <div
              key={key}
              className="rounded-xl border border-slate-100 bg-white p-4"
            >
              <div className="text-sm text-slate-500">{LABELS[key] ?? key}</div>
              <div className="mt-1 font-medium text-slate-900 break-all">
                {value === null ? "—" : String(value)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
