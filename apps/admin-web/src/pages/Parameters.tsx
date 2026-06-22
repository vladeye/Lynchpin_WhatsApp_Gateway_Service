import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SettingItem } from "@lynchpin-whatsapp-gateway/shared-types";
import { api } from "../lib/api";

const EFFECTIVE_LABELS: Record<string, string> = {
  environment: "Environment",
  session_root: "Session Root",
  media_root: "Media Root",
  webhook_signing: "Webhook Signing",
  max_text_length: "Max Text Length",
  log_level: "Log Level",
  n8n_webhook_base_url: "n8n Webhook Base URL",
  sync_full_history: "Sync Full History",
};

export function ParametersPage() {
  const qc = useQueryClient();
  const params = useQuery({ queryKey: ["parameters"], queryFn: api.parameters });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Parameters</h1>
      <p className="text-slate-500">
        Editable runtime settings (persisted, override environment defaults) and
        the effective configuration.
      </p>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Editable settings
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {params.data?.settings.map((s) => (
          <SettingCard
            key={s.key}
            setting={s}
            onSaved={() => qc.invalidateQueries({ queryKey: ["parameters"] })}
          />
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Effective configuration
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {params.data &&
          Object.entries(params.data.effective).map(([key, value]) => (
            <div
              key={key}
              className="rounded-xl border border-slate-100 bg-white p-4"
            >
              <div className="text-sm text-slate-500">
                {EFFECTIVE_LABELS[key] ?? key}
              </div>
              <div className="mt-1 break-all font-medium text-slate-900">
                {value === null ? "—" : String(value)}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function SettingCard({
  setting,
  onSaved,
}: {
  setting: SettingItem;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>(String(setting.value ?? ""));
  const [bool, setBool] = useState<boolean>(setting.value === true);

  // Keep local state in sync when the query refetches.
  useEffect(() => {
    setValue(String(setting.value ?? ""));
    setBool(setting.value === true);
  }, [setting.value]);

  const save = useMutation({
    mutationFn: () =>
      api.updateParameter(
        setting.key,
        setting.type === "boolean" ? bool : value,
      ),
    onSuccess: onSaved,
  });

  const dirty =
    setting.type === "boolean"
      ? bool !== (setting.value === true)
      : value !== String(setting.value ?? "");

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">
          {setting.label}
        </label>
        {setting.overridden && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            overridden
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {setting.type === "boolean" ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={bool}
              onChange={(e) => setBool(e.target.checked)}
            />
            {bool ? "Enabled" : "Disabled"}
          </label>
        ) : setting.type === "select" ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {setting.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={setting.type === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        <button
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {save.isError && (
        <div className="mt-2 text-xs text-red-600">{String(save.error)}</div>
      )}
      {save.isSuccess && !dirty && (
        <div className="mt-2 text-xs text-brand-600">Saved.</div>
      )}
    </div>
  );
}
