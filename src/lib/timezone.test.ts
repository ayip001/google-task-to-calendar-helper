import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { normalizeIanaTimeZone, wallTimeOnDateToUtc } from '@/lib/timezone';

describe('timezone helpers', () => {
  it('normalizeIanaTimeZone falls back to UTC for invalid zones', () => {
    expect(normalizeIanaTimeZone('Not/AZone')).toBe('UTC');
    expect(normalizeIanaTimeZone(undefined)).toBe('UTC');
  });

  it('wallTimeOnDateToUtc converts selected-zone wall time to correct UTC instant (DST case)', () => {
    // Australia/Sydney is typically UTC+11 on Dec 27 (DST).
    const utc = wallTimeOnDateToUtc('2025-12-27', '00:00', 'Australia/Sydney');
    const dtUtc = DateTime.fromJSDate(utc).toUTC();
    const dtInSydney = DateTime.fromJSDate(utc).setZone('Australia/Sydney');

    expect(dtInSydney.toISODate()).toBe('2025-12-27');
    expect(dtInSydney.toFormat('HH:mm')).toBe('00:00');
    expect(dtUtc.toISO()).toContain('T13:00:00');
  });

  it('wallTimeOnDateToUtc coerces nonexistent local times forward (DST spring-forward gap)', () => {
    // America/Los_Angeles jumps from 02:00 -> 03:00 on 2025-03-09.
    // 02:30 doesn't exist, so we coerce forward; ensure the returned time is valid and >= 03:00 local.
    const utc = wallTimeOnDateToUtc('2025-03-09', '02:30', 'America/Los_Angeles');
    const dtLa = DateTime.fromJSDate(utc).setZone('America/Los_Angeles');
    expect(dtLa.toISODate()).toBe('2025-03-09');
    expect(dtLa.hour).toBeGreaterThanOrEqual(3);
  });
});


