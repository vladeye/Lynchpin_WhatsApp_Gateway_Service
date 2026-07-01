import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReadingDay, ReadingSchedule } from "../lib/api";

type DayKey = keyof ReadingSchedule["days"];

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const snap = (m: number) => Math.max(0, Math.min(1440, Math.round(m / 30) * 30));
const full = (): ReadingDay => ({ start: 0, end: 1440, reversed: false });
const blocked = (): ReadingDay => ({ start: 0, end: 0, reversed: false });
const office = (): ReadingDay => ({ start: 540, end: 1080, reversed: false });

function mkDays(fn: (k: DayKey) => ReadingDay): ReadingSchedule["days"] {
  return {
    mon: fn("mon"), tue: fn("tue"), wed: fn("wed"), thu: fn("thu"),
    fri: fn("fri"), sat: fn("sat"), sun: fn("sun"),
  };
}

const PRESETS: { key: string; label: string; build: () => ReadingSchedule["days"] }[] = [
  { key: "business", label: "Business hours",
    build: () => mkDays((k) => (k === "sat" || k === "sun" ? blocked() : office())) },
  { key: "247", label: "24/7", build: () => mkDays(() => full()) },
  { key: "weekdays", label: "Weekdays only",
    build: () => mkDays((k) => (k === "sat" || k === "sun" ? blocked() : full())) },
];

const TIMEZONES: string[] =
  (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf?.("timeZone") ?? [
    "America/Bogota", "America/Mexico_City", "America/New_York",
    "America/Los_Angeles", "Europe/Madrid", "UTC",
  ];

export function SchedulePage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["schedule", id], queryFn: () => api.getSchedule(id) });

  const [sched, setSched] = useState<ReadingSchedule | null>(null);
  useEffect(() => {
    if (query.data) setSched(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (s: ReadingSchedule) => api.saveSchedule(id, s),
    onSuccess: (s) => qc.setQueryData(["schedule", id], s),
  });

  const [drag, setDrag] = useState<
    { day: DayKey; handle: "start" | "end"; track: HTMLElement } | null
  >(null);
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const rect = drag.track.getBoundingClientRect();
      const m = snap(((e.clientX - rect.left) / rect.width) * 1440);
      setSched((prev) => {
        if (!prev) return prev;
        const d = { ...prev.days[drag.day] };
        if (drag.handle === "start") d.start = Math.min(m, d.end);
        else d.end = Math.max(m, d.start);
        return { ...prev, days: { ...prev.days, [drag.day]: d } };
      });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 2), []);

  if (!sched) return <div className="p-8 text-slate-500">Loading schedule…</div>;

  const setDay = (key: DayKey, d: ReadingDay) =>
    setSched({ ...sched, days: { ...sched.days, [key]: d } });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reading Schedule</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure the 7-day schedule when the system will read incoming
            messages. Red = blocked (still stored, not answered).
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setSched({ ...sched, days: mkDays(() => ({ ...sched.days.mon })) })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Copy to all days
          </button>
          <button
            onClick={() => save.mutate(sched)}
            disabled={save.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>

      {save.isError && <p className="mt-3 text-sm text-red-600">{String(save.error)}</p>}
      {save.isSuccess && !save.isPending && (
        <p className="mt-3 text-sm text-emerald-700">Saved.</p>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-4 rounded bg-emerald-300" /> Reading messages
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-4 rounded bg-red-200" /> Blocked / ignored
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-slate-500">Timezone</label>
            <select
              value={sched.timezone}
              onChange={(e) => setSched({ ...sched, timezone: e.target.value })}
              className="rounded-lg border border-slate-300 px-2 py-1"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setSched({ ...sched, days: p.build() })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mb-1 flex justify-between pl-24 pr-24 text-xs text-slate-400">
          {hours.map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}:00</span>
          ))}
        </div>

        <div className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const d = sched.days[key];
            const seg = (a: number, b: number, green: boolean) => (
              <div
                className={`absolute top-0 h-full ${green ? "bg-emerald-300" : "bg-red-200"}`}
                style={{ left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%` }}
              />
            );
            const handle = (which: "start" | "end", pos: number) => (
              <div
                onPointerDown={(e) => {
                  const track = e.currentTarget.closest("[data-track]") as HTMLElement | null;
                  if (track) setDrag({ day: key, handle: which, track });
                }}
                className="absolute top-0 z-10 flex h-full w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded bg-white shadow ring-1 ring-slate-300"
                style={{ left: `${(pos / 1440) * 100}%` }}
                title={`${String(Math.floor(pos / 60)).padStart(2, "0")}:${String(pos % 60).padStart(2, "0")}`}
              >
                <span className="text-[10px] leading-none text-slate-400">⋮</span>
              </div>
            );
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-sm font-medium text-slate-700">{label}</div>
                <div
                  data-track
                  className="relative h-9 flex-1 select-none rounded-md border border-slate-200 bg-slate-50"
                >
                  <div className="absolute inset-0 overflow-hidden rounded-md">
                    {seg(0, d.start, d.reversed)}
                    {seg(d.start, d.end, !d.reversed)}
                    {seg(d.end, 1440, d.reversed)}
                  </div>
                  {handle("start", d.start)}
                  {handle("end", d.end)}
                </div>
                <button
                  onClick={() => setDay(key, { ...d, reversed: !d.reversed })}
                  className="flex w-24 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:bg-slate-50"
                >
                  ⇄ Reverse
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
          <span>i</span>
          <span>
            Green areas indicate when the system will read incoming messages. Red
            areas indicate when messages are blocked/ignored (stored, not
            answered). Times are in the selected timezone.
          </span>
        </div>
      </div>
    </div>
  );
}
