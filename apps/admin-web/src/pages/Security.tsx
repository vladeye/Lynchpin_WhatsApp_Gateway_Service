import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function SecurityPage() {
  const security = useQuery({ queryKey: ["security"], queryFn: api.security });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Security</h1>
      <p className="text-slate-500">
        Admin account and programmatic access for this gateway.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChangePasswordCard username={security.data?.username ?? "—"} />
        <ApiKeyCard
          configured={security.data?.api_key_configured ?? false}
          hint={security.data?.api_key_hint ?? null}
          webhookSigning={security.data?.webhook_signing ?? false}
        />
      </div>
    </div>
  );
}

function ChangePasswordCard({ username }: { username: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setLocalError(null);
    },
  });

  function submit() {
    setLocalError(null);
    if (next.length < 8) {
      setLocalError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setLocalError("New passwords do not match.");
      return;
    }
    change.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Change password</h2>
      <p className="mt-1 text-sm text-slate-500">
        Signed in as <span className="font-medium">{username}</span>.
      </p>
      <div className="mt-4 space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {(localError || change.isError) && (
          <div className="text-xs text-red-600">
            {localError ?? String(change.error)}
          </div>
        )}
        {change.isSuccess && (
          <div className="text-xs text-brand-600">Password updated.</div>
        )}
        <button
          disabled={!current || !next || !confirm || change.isPending}
          onClick={submit}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Update password
        </button>
      </div>
    </div>
  );
}

function ApiKeyCard({
  configured,
  hint,
  webhookSigning,
}: {
  configured: boolean;
  hint: string | null;
  webhookSigning: boolean;
}) {
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState<string | null>(null);

  const rotate = useMutation({
    mutationFn: () => api.rotateApiKey(),
    onSuccess: (key) => {
      setRevealed(key);
      void qc.invalidateQueries({ queryKey: ["security"] });
    },
  });

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5">
      <h2 className="font-semibold text-slate-900">API access</h2>
      <p className="mt-1 text-sm text-slate-500">
        Programmatic clients (e.g. n8n) authenticate with the{" "}
        <code className="rounded bg-slate-100 px-1">X-Gateway-Api-Key</code>{" "}
        header.
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">API key</dt>
          <dd className="font-medium text-slate-800">
            {configured ? (hint ?? "configured") : "not configured"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Webhook signing</dt>
          <dd className="font-medium text-slate-800">
            {webhookSigning ? "enabled" : "disabled"}
          </dd>
        </div>
      </dl>

      {revealed && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-800">
            Copy this key now — it won't be shown again:
          </div>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs">
            {revealed}
          </code>
        </div>
      )}

      <button
        disabled={rotate.isPending}
        onClick={() => rotate.mutate()}
        className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {configured ? "Rotate API key" : "Generate API key"}
      </button>
      {rotate.isError && (
        <div className="mt-2 text-xs text-red-600">{String(rotate.error)}</div>
      )}
    </div>
  );
}
