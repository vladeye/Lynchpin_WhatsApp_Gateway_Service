import { z } from "zod";
import type { ReadingSchedule, ScheduleRepository } from "../stores/types";

const dayZ = z.object({
  start: z.number().int().min(0).max(1440),
  end: z.number().int().min(0).max(1440),
  reversed: z.boolean(),
});

export const ReadingScheduleSchema = z.object({
  timezone: z.string().min(1),
  days: z.object({
    mon: dayZ,
    tue: dayZ,
    wed: dayZ,
    thu: dayZ,
    fri: dayZ,
    sat: dayZ,
    sun: dayZ,
  }),
});

type DayKey = keyof ReadingSchedule["days"];

const WEEKDAY_MAP: Record<string, DayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

export function defaultSchedule(): ReadingSchedule {
  const full = () => ({ start: 0, end: 1440, reversed: false });
  return {
    timezone: "America/Bogota",
    days: {
      mon: full(),
      tue: full(),
      wed: full(),
      thu: full(),
      fri: full(),
      sat: full(),
      sun: full(),
    },
  };
}

/**
 * Per-account reading schedule with an in-memory cache. `readingAllowed` is the
 * hot-path gate used by the message pipeline; it is synchronous and cache-only.
 */
export class ScheduleService {
  private cache = new Map<string, ReadingSchedule>();

  constructor(private readonly repo: ScheduleRepository) {}

  async load(): Promise<void> {
    this.cache = await this.repo.all();
  }

  async get(accountId: string): Promise<ReadingSchedule> {
    return (
      this.cache.get(accountId) ??
      (await this.repo.get(accountId)) ??
      defaultSchedule()
    );
  }

  async save(accountId: string, schedule: ReadingSchedule): Promise<void> {
    await this.repo.upsert(accountId, schedule);
    this.cache.set(accountId, schedule);
  }

  /** True when the account may forward inbound now. No schedule = always. */
  readingAllowed(accountId: string, now: Date = new Date()): boolean {
    const sched = this.cache.get(accountId);
    if (!sched) return true;
    const parts = this.localParts(now, sched.timezone);
    if (!parts) return true;
    const day = sched.days[parts.weekday];
    if (!day) return true;
    const inside = parts.minutes >= day.start && parts.minutes < day.end;
    return day.reversed ? !inside : inside;
  }

  private localParts(
    now: Date,
    timezone: string,
  ): { weekday: DayKey; minutes: number } | null {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
      const weekday = WEEKDAY_MAP[wd];
      if (!weekday) return null;
      return { weekday, minutes: (hh % 24) * 60 + mm };
    } catch {
      return null;
    }
  }
}
