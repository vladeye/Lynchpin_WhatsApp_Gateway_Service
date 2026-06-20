import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function LogsPage() {
  const events = useQuery({
    queryKey: ["events"],
    queryFn: api.listEvents,
    refetchInterval: 5000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Logs</h1>
      <p className="text-slate-500">Recent gateway events and webhook deliveries.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white">
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
            {events.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No events yet.
                </td>
              </tr>
            )}
            {events.data?.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {e.event_type}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.status}</td>
                <td className="px-4 py-3 text-slate-600">{e.message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
