// Book 10 — pure scheduling helpers. The cron PARSING and next-fire math are
// kept dependency-free and testable; the actual firing is a hook a worker
// calls (see service.ts runDueSchedules), the same honest boundary the
// notification and webhook queues draw.
//
// A deliberately small cron: 5 fields (min hour dom mon dow), supporting "*",
// exact numbers, and step values (*/n) — enough for "every day at 6am",
// "every 15 minutes", "1st of the month". Ranges and lists are intentionally
// not supported yet; isValidCron rejects them rather than silently
// misinterpreting, so a schedule that wouldn't fire as the user expects is
// caught at save time.

export interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  const step = field.match(/^\*\/(\d+)$/);
  if (step) {
    const n = Number(step[1]);
    return n > 0 && value % n === 0;
  }
  if (/^\d+$/.test(field)) return Number(field) === value;
  return false; // ranges/lists unsupported — see header
}

export function isValidCron(expr: string): boolean {
  const fields = parseCron(expr);
  if (!fields) return false;
  const ok = (f: string) => f === "*" || /^\d+$/.test(f) || /^\*\/\d+$/.test(f);
  return ok(fields.minute) && ok(fields.hour) && ok(fields.dayOfMonth) && ok(fields.month) && ok(fields.dayOfWeek);
}

/** Whether a cron expression fires at the given minute. */
export function cronMatches(expr: string, at: Date): boolean {
  const fields = parseCron(expr);
  if (!fields) return false;
  return (
    fieldMatches(fields.minute, at.getUTCMinutes()) &&
    fieldMatches(fields.hour, at.getUTCHours()) &&
    fieldMatches(fields.dayOfMonth, at.getUTCDate()) &&
    fieldMatches(fields.month, at.getUTCMonth() + 1) &&
    fieldMatches(fields.dayOfWeek, at.getUTCDay())
  );
}

/**
 * The next minute at or after `from` at which the expression fires, scanning
 * minute by minute up to a bounded horizon (default ~366 days). Returns null if
 * nothing matches within the horizon — which for a valid 5-field cron only
 * happens on impossible dates (e.g. Feb 30), and is surfaced rather than
 * looping forever.
 */
export function nextRunAfter(expr: string, from: Date, horizonMinutes = 366 * 24 * 60): Date | null {
  if (!isValidCron(expr)) return null;
  // Start at the next whole minute so we don't re-fire the current one.
  const start = new Date(from);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(start.getUTCMinutes() + 1);

  const cursor = new Date(start);
  for (let i = 0; i < horizonMinutes; i++) {
    if (cronMatches(expr, cursor)) return new Date(cursor);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** Whether a schedule is due at `now`: enabled and its nextRunAt has arrived. */
export function isDue(schedule: { enabled: boolean; nextRunAt: Date | null }, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.nextRunAt) return false;
  return schedule.nextRunAt.getTime() <= now.getTime();
}
