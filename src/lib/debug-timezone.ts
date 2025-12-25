import { DateTime } from 'luxon';
import {
  getUtcOffsetMinutes,
  normalizeIanaTimeZone,
  parseTimeLabelToHHMM,
  TimeFormatPreference,
  wallTimeOnDateToUtc,
} from '@/lib/timezone';

type DebugParams = {
  container: HTMLElement;
  dateISO: string;
  selectedTimeZone: string;
  calendarTimeZone?: string;
  slotMinTime: string;
  slotMaxTime: string;
  timeFormat: TimeFormatPreference;
};

const DEBUG_REFRESH_EVENT = 'timezone-debug-refresh';
const DETECTED_END_ADJUST_MINUTES = 30;
let lastLogKey: string | null = null;

export function requestTimezoneDebugRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DEBUG_REFRESH_EVENT));
}

export function onTimezoneDebugRefresh(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => callback();
  window.addEventListener(DEBUG_REFRESH_EVENT, handler);
  return () => window.removeEventListener(DEBUG_REFRESH_EVENT, handler);
}

export function logTimezoneDebug(params: DebugParams): void {
  // Runtime check (not build-time): allows toggling via `.env.local` + reload.
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') return;

  const selectedZone = normalizeIanaTimeZone(params.selectedTimeZone);
  const calendarZone = normalizeIanaTimeZone(params.calendarTimeZone);

  const now = new Date();
  const selectedOffset = getUtcOffsetMinutes(selectedZone, now);
  const calendarOffset = getUtcOffsetMinutes(calendarZone, now);

  const selectedOffsetHours = (selectedOffset / 60).toFixed(1).replace(/\.0$/, '');
  const calendarOffsetHours = (calendarOffset / 60).toFixed(1).replace(/\.0$/, '');

  const detected = detectRenderedRange(params.container, params.timeFormat);

  const key = JSON.stringify({
    dateISO: params.dateISO,
    selectedZone,
    calendarZone,
    slotMinTime: params.slotMinTime,
    slotMaxTime: params.slotMaxTime,
    timeFormat: params.timeFormat,
    detected,
  });

  if (key === lastLogKey) return;
  lastLogKey = key;

  const selectedRange = `${params.slotMinTime} - ${params.slotMaxTime}`;
  const detectedRange = detected
    ? formatDetectedRange({
        dateISO: params.dateISO,
        selectedZone,
        calendarZone,
        startHHMM: detected.startHHMM,
        endHHMM: detected.endHHMM,
      })
    : 'N/A (no rendered labels found)';

  // eslint-disable-next-line no-console
  console.log(
    [
      `Calendar Timezone: ${calendarZone} (UTC${calendarOffset >= 0 ? '+' : ''}${calendarOffsetHours})`,
      `Selected Timezone: ${selectedZone} (UTC${selectedOffset >= 0 ? '+' : ''}${selectedOffsetHours})`,
      `Selected Range: ${selectedRange}`,
      `Detected Range: ${detectedRange}${detected ? ' [+30 mins]' : ''}`,
    ].join('\n')
  );
}

function detectRenderedRange(
  container: HTMLElement,
  timeFormat: TimeFormatPreference
): { startHHMM: string; endHHMM: string } | null {
  const labelEls = Array.from(
    container.querySelectorAll<HTMLElement>(
      '.fc-timegrid-slot-label .fc-timegrid-slot-label-cushion, .fc-timegrid-axis-cushion'
    )
  ).filter((el) => Boolean(el.innerText?.trim()));

  if (labelEls.length === 0) return null;

  const firstText = labelEls[0].innerText.trim();
  const lastText = labelEls[labelEls.length - 1].innerText.trim();

  const firstPrimary = firstText.split('\n')[0]?.trim() ?? '';
  const lastPrimary = lastText.split('\n')[0]?.trim() ?? '';

  const startHHMM = parseTimeLabelToHHMM(firstPrimary, timeFormat);
  const lastHHMM = parseTimeLabelToHHMM(lastPrimary, timeFormat);
  if (!startHHMM || !lastHHMM) return null;

  const endHHMM = addMinutesToHHMM(lastHHMM, DETECTED_END_ADJUST_MINUTES);
  return { startHHMM, endHHMM };
}

function addMinutesToHHMM(hhmm: string, minutesToAdd: number): string {
  const [hStr, mStr] = hhmm.split(':');
  const baseMinutes = Number(hStr) * 60 + Number(mStr);
  const total = (baseMinutes + minutesToAdd) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDetectedRange(params: {
  dateISO: string;
  selectedZone: string;
  calendarZone: string;
  startHHMM: string;
  endHHMM: string;
}): string {
  const startUtc = wallTimeOnDateToUtc(params.dateISO, params.startHHMM, params.selectedZone);
  const endUtc = wallTimeOnDateToUtc(params.dateISO, params.endHHMM, params.selectedZone);

  const startSelected = DateTime.fromJSDate(startUtc).setZone(params.selectedZone).toFormat('HH:mm');
  const endSelected = DateTime.fromJSDate(endUtc).setZone(params.selectedZone).toFormat('HH:mm');

  const startCalendar = DateTime.fromJSDate(startUtc).setZone(params.calendarZone).toFormat('HH:mm');
  const endCalendar = DateTime.fromJSDate(endUtc).setZone(params.calendarZone).toFormat('HH:mm');

  return `${startSelected} (${startCalendar}) - ${endSelected} (${endCalendar})`;
}


