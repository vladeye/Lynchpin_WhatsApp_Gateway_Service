import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const STATUSES = ["", "pending", "delivered", "failed", "skipped"];
const PAGE = 25;

export function LogsPage() {
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const events = useQuery({
    queryKey: ["events", eventType, status, offset],
    queryFn: () =>
      api.listEvents({
        limit: PAGE,
        offset,
        event_type: eventType || undefined,
        status: status || undefined,
      }),
    refetchInterval: 5000,
  });

  const detail = useQuery({
    queryKey: ["event", selected],
    queryFn: () => api.getEvent(selected!),
    enabled: Boolean(selected),
  });

  const total = events.data?.total ?? 0;
  const types = events.data?.event_types ?? [];

  function changeFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setOffset(0);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
          <p className="text-slate-500">
            Gateway events and webhook deliveries.
          </p>
        </div>
        <span className="text-sm text-slate-400">{total} events</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={eventType}
          onChange={(e) => changeFilter(setEventType, e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All event types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => changeFilter(setStatus, e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.data?.events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No events match these filters.
                </td>
              </tr>
            )}
            {events.data?.events.map((e) => (
              <tr
                key={e.id}
                onClick={() => setSelected(e.id)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {e.event_type}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={e.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{e.message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of{" "}
          {total}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Event detail</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {detail.isLoading && <div className="text-slate-400">Loading…</div>}
            {detail.data && (
              <div className="space-y-3 text-sm">
                <Field label="Event">{detail.data.event_type}</Field>
                <Field label="Status">
                  <StatusBadge status={detail.data.status} />
                </Field>
                <Field label="Account">
                  {detail.data.gateway_account_id ?? "—"}
                </Field>
                <Field label="Attempts">{detail.data.attempts}</Field>
                {detail.data.last_error && (
                  <Field label="Last error">
                    <span className="text-red-600">{detail.data.last_error}</span>
                  </Field>
                )}
                <Field label="Created">
                  {new Date(detail.data.created_at).toLocaleString()}
                </Field>
                {detail.data.delivered_at && (
                  <Field label="Delivered">
                    {new Date(detail.data.delivered_at).toLocaleString()}
                  </Field>
                )}
                <div>
                  <div className="mb-1 text-slate-500">Payload</div>
                  <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {JSON.stringify(detail.data.payload, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    delivered: "bg-brand-50 text-brand-700",
    pending: "bg-amber-50 text-amber-700",
    skipped: "bg-slate-100 text-slate-600",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}
