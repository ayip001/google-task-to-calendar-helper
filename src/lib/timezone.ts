import { DateTime, IANAZone } from 'luxon';

const UTC_ZONE = 'UTC';
const MAX_DST_COERCE_MINUTES = 180;

export type TimeFormatPreference = '12h' | '24h';

export function normalizeIanaTimeZone(zone: string | undefined | null): string {
  if (!zone) return UTC_ZONE;
  return IANAZone.isValidZone(zone) ? zone : UTC_ZONE;
}

export function parseTimeLabelToHHMM(label: string, timeFormat: TimeFormatPreference): string | null {
  const raw = label.trim();
  if (!raw) return null;

  // FullCalendar commonly renders: "12am", "12:30am", "12 AM", "12:30 AM", sometimes with NBSP.
  // Normalize whitespace/punctuation but keep the digits/colon.
  const text = raw
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

  // Always prefer explicit am/pm parsing if present (even if the user's preference is 24h).
  if (text.endsWith('am') || text.endsWith('pm')) {
    const period = text.slice(-2); // 'am' | 'pm'
    const timePart = text.slice(0, -2);
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(timePart);
    if (!match) return null;
    const rawHours = Number(match[1]);
    const minutes = Number(match[2] ?? '00');
    if (!Number.isFinite(rawHours) || !Number.isFinite(minutes)) return null;
    if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) return null;

    let hours = rawHours % 12;
    if (period === 'pm') hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Otherwise treat it as 24h-style (or hour-only).
  // If there's no minutes, FullCalendar's axis implies ":00".
  const match24 = /^(\d{1,2})(?::(\d{2}))?$/.exec(text);
  if (!match24) return null;
  const hours = Number(match24[1]);
  const minutes = Number(match24[2] ?? '00');
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseISODateInZone(dateISO: string, zone: string): DateTime {
  const normalizedZone = normalizeIanaTimeZone(zone);
  const dt = DateTime.fromISO(dateISO, { zone: normalizedZone });
  if (!dt.isValid) {
    throw new Error(`Invalid ISO date "${dateISO}"`);
  }
  return dt.startOf('day');
}

export function wallTimeOnDateToUtc(dateISO: string, wallTimeHHMM: string, zone: string): Date {
  const normalizedZone = normalizeIanaTimeZone(zone);
  const iso = `${dateISO}T${wallTimeHHMM}`;
  const dt = DateTime.fromISO(iso, { zone: normalizedZone });
  const coerced = coerceDateTimeToValidWallTime(dt, normalizedZone, iso);
  return coerced.toUTC().toJSDate();
}

export function utcDateToZoneDateTime(date: Date, zone: string): DateTime {
  const normalizedZone = normalizeIanaTimeZone(zone);
  return DateTime.fromJSDate(date, { zone: UTC_ZONE }).setZone(normalizedZone);
}

export function utcISOStringFromInstant(date: Date): string {
  return DateTime.fromJSDate(date, { zone: UTC_ZONE }).toUTC().toISO({ suppressMilliseconds: true })!;
}

export function formatTimeForDisplay(dt: DateTime, format: TimeFormatPreference): string {
  return format === '24h' ? dt.toFormat('HH:mm') : dt.toFormat('h:mm a');
}

export function getUtcOffsetMinutes(zone: string, atInstant: Date = new Date()): number {
  const normalizedZone = normalizeIanaTimeZone(zone);
  return DateTime.fromJSDate(atInstant, { zone: UTC_ZONE }).setZone(normalizedZone).offset;
}

function coerceDateTimeToValidWallTime(dt: DateTime, zone: string, label: string): DateTime {
  if (dt.isValid) return dt;

  // Luxon can produce invalid DateTimes for nonexistent local times during DST spring-forward.
  // We coerce by moving forward minute-by-minute until we reach a valid instant, capped to avoid infinite loops.
  const base = DateTime.fromISO(label, { zone, setZone: true });
  for (let minutes = 1; minutes <= MAX_DST_COERCE_MINUTES; minutes += 1) {
    const candidate = base.plus({ minutes });
    if (candidate.isValid) return candidate;
  }

  throw new Error(
    `Invalid local time "${label}" in zone "${zone}" (could not coerce within ${MAX_DST_COERCE_MINUTES} minutes)`
  );
}


