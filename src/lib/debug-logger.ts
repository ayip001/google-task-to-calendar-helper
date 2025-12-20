import { WorkingHours, TaskPlacement, UserSettings } from '@/types';

// Check isDebugEnabled() at runtime instead of module load time
// This allows tests to enable debugging even after the module loads
function isDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG === 'true';
}

// Deduplication cache to prevent duplicate logs from React strict mode double rendering
const logDeduplicationCache = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000; // Skip duplicate logs within 200ms

function shouldLog(key: string): boolean {
  const now = Date.now();
  const lastLogTime = logDeduplicationCache.get(key);
  
  if (lastLogTime === undefined || now - lastLogTime > DEDUP_WINDOW_MS) {
    logDeduplicationCache.set(key, now);
    // Clean up old entries periodically (keep cache size reasonable)
    if (logDeduplicationCache.size > 100) {
      const cutoff = now - DEDUP_WINDOW_MS * 10;
      for (const [k, v] of logDeduplicationCache.entries()) {
        if (v < cutoff) {
          logDeduplicationCache.delete(k);
        }
      }
    }
    return true;
  }
  return false;
}

export interface TimezoneContext {
  browser: string;
  calendar: string;
  userSelected: string;
  utc: string;
}

export interface FormattedTime {
  browser: string;
  calendar: string;
  user: string;
  utc: string;
}

export interface FormattedTimeWithOffsets {
  browser: string;
  calendar: string;
  user: string;
  utc: string;
  browserOffset: number;
  calendarOffset: number;
}

// Logger interface for dependency injection
export interface LoggerWriter {
  log(message: string): void;
}

// Console logger implementation (default)
class ConsoleLogger implements LoggerWriter {
  log(message: string): void {
    console.log(message);
  }
}

// Test logger implementation for unit testing
export class TestLogger implements LoggerWriter {
  private logs: string[] = [];

  log(message: string): void {
    this.logs.push(message);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  getLastLog(): string | undefined {
    return this.logs[this.logs.length - 1];
  }

  hasLogContaining(searchText: string): boolean {
    return this.logs.some((log) => log.includes(searchText));
  }

  getLogsContaining(searchText: string): string[] {
    return this.logs.filter((log) => log.includes(searchText));
  }
}

// Structured data types for testing
export interface DayOpenData {
  date: string;
  timezones: TimezoneContext;
  currentTime: FormattedTime;
}

export interface CalendarLoadData {
  expectedRange: { start: string; end: string };
  businessHours: WorkingHours[];
  firstSlot: Date;
  lastSlot: Date;
  renderedTimeRange: {
    firstRenderedLabel: string;
    lastRenderedLabel: string;
    firstRenderedTime: Date;
    lastRenderedTime: Date;
  };
  timezones: TimezoneContext;
  calendarStartTime: string;
  calendarEndTime: string;
  renderedEvents?: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>;
  visibleEvents?: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>;
  outOfRangeEvents?: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>;
}

export interface ApiCallData {
  endpoint: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  timezones: TimezoneContext;
  events?: Array<{ date: string; time: string; name: string }>;
}

export interface TaskPlacementData {
  taskId: string;
  taskTitle: string;
  targetSlotLabel: string;
  actualStartTime: string;
  duration: number;
  times: FormattedTime;
  timezones: TimezoneContext;
  isOutOfRange: boolean;
  listTitle?: string;
}

export interface TaskDragData {
  taskTitle: string;
  targetSlotLabel: string;
  oldStartTime: string;
  newStartTime: string;
  duration: number;
  oldTimes: FormattedTime;
  newTimes: FormattedTime;
  timezones: TimezoneContext;
}

export interface TaskResizeData {
  taskTitle: string;
  oldDuration: number;
  newDuration: number;
  timezones: TimezoneContext;
}

export interface SaveData {
  placements: TaskPlacement[];
  displayedTimes: Array<{ time: string; duration: number }>;
  timezones: TimezoneContext;
  placementData: Array<{
    placement: TaskPlacement;
    displayedTime: string;
    times: FormattedTime;
  }>;
}

export interface SlotLabelData {
  slotTime: Date;
  labelText: string;
  times: FormattedTime;
  timezones: TimezoneContext;
}

export interface AutoFitPlacementData {
  taskId: string;
  taskTitle: string;
  startTime: string;
  duration: number;
  times: FormattedTime;
  timezones: TimezoneContext;
  listTitle?: string;
}

export interface AutoFitData {
  date: string;
  totalTasks: number;
  filteredTasks: number;
  placements: AutoFitPlacementData[];
  unplacedTasks: Array<{ id: string; title: string; listTitle?: string }>;
  timezones: TimezoneContext;
  businessHours: WorkingHours[];
}

export interface SettingsSaveData {
  previousSettings: Partial<UserSettings>;
  newSettings: UserSettings;
  changedFields: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

function getBrowserTimezone(): string {
  if (typeof window === 'undefined') return 'UTC';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function calculateDayOffset(date: Date, timezone: string, referenceTimezone: string): number {
  const targetDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const referenceDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: referenceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const targetDateStr = targetDateFormatter.format(date);
  const referenceDateStr = referenceDateFormatter.format(date);

  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const referenceDate = new Date(referenceDateStr + 'T00:00:00');
  return Math.round((targetDate.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000));
}

function formatTimeInAllTimezones(date: Date, timezones: TimezoneContext): FormattedTime {
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  };
  
  const timeFormatOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  // User-selected timezone is the reference (no offset shown)
  const referenceTimezone = timezones.userSelected;

  const formatDateTime = (timezone: string, showOffset: boolean): string => {
    const dateStr = new Intl.DateTimeFormat('en-GB', {
      ...dateFormatOptions,
      timeZone: timezone,
    }).format(date);
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      ...timeFormatOptions,
      timeZone: timezone,
    }).format(date);
    
    if (showOffset) {
      const offset = calculateDayOffset(date, timezone, referenceTimezone);
      if (offset !== 0) {
        const offsetStr = offset > 0 ? `+${offset}` : `${offset}`;
        return `${dateStr} ${timeStr} (${offsetStr})`;
      }
    }
    return `${dateStr} ${timeStr}`;
  };

  return {
    browser: formatDateTime(timezones.browser, true),
    calendar: formatDateTime(timezones.calendar, true),
    user: formatDateTime(timezones.userSelected, false),
    utc: date.toISOString().replace('T', ' ').slice(0, 16) + 'Z',
  };
}

function formatTimeInAllTimezonesWithOffsets(date: Date, timezones: TimezoneContext): FormattedTimeWithOffsets {
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  };
  
  const timeFormatOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  const referenceTimezone = timezones.userSelected;

  const formatDateTime = (timezone: string): string => {
    const dateStr = new Intl.DateTimeFormat('en-GB', {
      ...dateFormatOptions,
      timeZone: timezone,
    }).format(date);
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      ...timeFormatOptions,
      timeZone: timezone,
    }).format(date);
    return `${dateStr} ${timeStr}`;
  };

  const browserOffset = calculateDayOffset(date, timezones.browser, referenceTimezone);
  const calendarOffset = calculateDayOffset(date, timezones.calendar, referenceTimezone);

  return {
    browser: formatDateTime(timezones.browser),
    calendar: formatDateTime(timezones.calendar),
    user: formatDateTime(timezones.userSelected),
    utc: date.toISOString().replace('T', ' ').slice(0, 16) + 'Z',
    browserOffset,
    calendarOffset,
  };
}

export function createTimezoneContext(
  calendarTimezone?: string,
  userTimezone?: string
): TimezoneContext {
  return {
    browser: getBrowserTimezone(),
    calendar: calendarTimezone || getBrowserTimezone(),
    userSelected: userTimezone || getBrowserTimezone(),
    utc: 'UTC',
  };
}

function formatBusinessHours(hours: WorkingHours[]): string {
  return hours.map((h) => `${h.start}-${h.end}`).join(', ');
}

// Data extraction functions (pure, testable)
export function extractDayOpenData(
  date: string,
  calendarTimezone?: string,
  userTimezone?: string
): DayOpenData {
  const timezones = createTimezoneContext(calendarTimezone, userTimezone);
  const now = new Date();
  const times = formatTimeInAllTimezones(now, timezones);

  return {
    date,
    timezones,
    currentTime: times,
  };
}

// Logging functions (with dependency injection)
export function logDayOpen(
  date: string,
  calendarTimezone?: string,
  userTimezone?: string,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  // Deduplicate: create a key from the log parameters
  const logKey = `dayOpen:${date}:${calendarTimezone || ''}:${userTimezone || ''}`;
  if (!shouldLog(logKey)) return;

  const data = extractDayOpenData(date, calendarTimezone, userTimezone);

  writer.log('[DEBUG] Day Opened');
  writer.log(`  Date: ${data.date}`);
  writer.log('  Timezones:');
  writer.log(`    Browser: ${data.timezones.browser}`);
  writer.log(`    Calendar: ${data.timezones.calendar}`);
  writer.log(`    User Selected: ${data.timezones.userSelected}`);
  writer.log(`    UTC: ${data.timezones.utc}`);
  writer.log('  Current Time (all timezones):');
  writer.log(`    Browser: ${data.currentTime.browser} (${data.timezones.browser})`);
  writer.log(`    Calendar: ${data.currentTime.calendar} (${data.timezones.calendar})`);
  writer.log(`    User: ${data.currentTime.user} (${data.timezones.userSelected})`);
  writer.log(`    UTC: ${data.currentTime.utc}`);
}

function convertTimeToTimezone(
  timeStr: string,
  date: Date,
  fromTimezone: string,
  toTimezone: string
): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create a date string in ISO format, then create a date object
  // We need to interpret this time as being in the source timezone
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  // Create a date representing this time in the source timezone
  // We'll use a trick: format a date in the source timezone, then parse it
  const tempDate = new Date(dateStr + 'T12:00:00Z');
  
  // Get the offset between source and target timezones for this date
  const sourceFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: fromTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const targetFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: toTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  // Get what noon looks like in both timezones to calculate offset
  const sourceNoon = sourceFormatter.formatToParts(tempDate);
  const targetNoon = targetFormatter.formatToParts(tempDate);
  
  const sourceHour = parseInt(sourceNoon.find(p => p.type === 'hour')?.value || '12', 10);
  const targetHour = parseInt(targetNoon.find(p => p.type === 'hour')?.value || '12', 10);
  
  // Calculate offset (how many hours to add to source time to get target time)
  let offsetHours = targetHour - sourceHour;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  
  // Apply offset
  let newHour = hours + offsetHours;
  if (newHour < 0) newHour += 24;
  if (newHour >= 24) newHour -= 24;
  
  return `${newHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function parseTimeFromLabel(label: string): number | null {
  const firstTime = label.split(' | ')[0].trim();
  const match = firstTime.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return null;
}

function filterVisibleEvents(
  renderedEvents: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>,
  firstRenderedLabel: string,
  lastRenderedLabel: string
): {
  visibleEvents: typeof renderedEvents;
  outOfRangeEvents: typeof renderedEvents;
} {
  const rangeStart = parseTimeFromLabel(firstRenderedLabel);
  const rangeEnd = parseTimeFromLabel(lastRenderedLabel);
  const visibleEndMinutes = rangeEnd !== null ? rangeEnd + 30 : null;

  const visibleEvents: typeof renderedEvents = [];
  const outOfRangeEvents: typeof renderedEvents = [];

  renderedEvents.forEach((event) => {
    const eventTimeStr = event.time.split(' | ')[0].trim();
    const eventTimeMatch = eventTimeStr.match(/(\d{1,2}):(\d{2})/);

    if (eventTimeMatch && rangeStart !== null && visibleEndMinutes !== null) {
      const eventHours = parseInt(eventTimeMatch[1], 10);
      const eventMinutes = parseInt(eventTimeMatch[2], 10);
      const eventTotalMinutes = eventHours * 60 + eventMinutes;

      if (eventTotalMinutes >= rangeStart && eventTotalMinutes < visibleEndMinutes) {
        visibleEvents.push(event);
      } else {
        outOfRangeEvents.push(event);
      }
    } else {
      visibleEvents.push(event);
    }
  });

  return { visibleEvents, outOfRangeEvents };
}

function formatTimeWithOffset(timeStr: string, date: Date, timezone: string, referenceTimezone: string): string {
  // Use convertTimeToTimezone to get the time in the target timezone
  const targetTimeStr = convertTimeToTimezone(timeStr, date, referenceTimezone, timezone);
  
  // To calculate day offset, we need to create a Date object representing the time in reference timezone
  // and see what date it represents in the target timezone
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Get date string in reference timezone
  const refDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: referenceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  
  // Create a date at noon in reference timezone to calculate offset
  const noonRef = new Date(`${refDateStr}T12:00:00Z`);
  const refNoonHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: referenceTimezone,
    hour: 'numeric',
    hour12: false,
  }).format(noonRef), 10);
  const utcNoonHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    hour12: false,
  }).format(noonRef), 10);
  
  let refOffset = utcNoonHour - refNoonHour;
  if (refOffset > 12) refOffset -= 24;
  if (refOffset < -12) refOffset += 24;
  
  // Create date representing the desired time in reference timezone
  const utcHour = (hours - refOffset + 24) % 24;
  const actualDate = new Date(`${refDateStr}T${utcHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00Z`);
  
  // Calculate day offset by comparing dates in both timezones
  const refDateOnly = new Intl.DateTimeFormat('en-CA', {
    timeZone: referenceTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(actualDate);
  const targetDateOnly = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(actualDate);
  
  const refDate = new Date(`${refDateOnly}T00:00:00`);
  const targetDate = new Date(`${targetDateOnly}T00:00:00`);
  const offset = Math.round((targetDate.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000));
  
  if (offset !== 0) {
    const offsetStr = offset > 0 ? `+${offset}` : `${offset}`;
    return `${targetTimeStr} (${offsetStr})`;
  }
  return targetTimeStr;
}

function formatRenderedTimeRangeLabel(
  label: string,
  date: Date,
  userTimezone: string,
  calendarTimezone: string
): string {
  // Parse label which may be "10:00" or "10:00 | 04:00"
  const parts = label.split(' | ');
  
  if (parts.length === 1) {
    // Single timezone - no offset needed
    return label;
  }
  
  // Dual timezone format: "userTime | calendarTime"
  const userTime = parts[0].trim();
  const calendarTime = parts[1].trim();
  
  // Calculate day offset for calendar time
  const [calHours, calMinutes] = calendarTime.split(':').map(Number);
  const userDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  
  // Create date representing the user time in user timezone
  const [userHours, userMinutes] = userTime.split(':').map(Number);
  const userDate = new Date(`${userDateStr}T${userHours.toString().padStart(2, '0')}:${userMinutes.toString().padStart(2, '0')}:00`);
  
  // Calculate day offset for calendar timezone
  const offset = calculateDayOffset(userDate, calendarTimezone, userTimezone);
  
  if (offset !== 0) {
    const offsetStr = offset > 0 ? `+${offset}` : `${offset}`;
    return `${userTime} | ${calendarTime} (${offsetStr})`;
  }
  
  return label;
}

export function extractCalendarLoadData(
  expectedRange: { start: string; end: string },
  businessHours: WorkingHours[],
  firstSlot: Date,
  lastSlot: Date,
  renderedTimeRange: {
    firstRenderedLabel: string;
    lastRenderedLabel: string;
    firstRenderedTime: Date;
    lastRenderedTime: Date;
  },
  timezones: TimezoneContext,
  renderedEvents?: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>
): CalendarLoadData {
  const calendarStartTime = formatTimeWithOffset(
    expectedRange.start,
    firstSlot,
    timezones.calendar,
    timezones.userSelected
  );
  const calendarEndTime = formatTimeWithOffset(
    expectedRange.end,
    lastSlot,
    timezones.calendar,
    timezones.userSelected
  );

  let visibleEvents: typeof renderedEvents | undefined;
  let outOfRangeEvents: typeof renderedEvents | undefined;

  if (renderedEvents && renderedEvents.length > 0) {
    const filtered = filterVisibleEvents(
      renderedEvents,
      renderedTimeRange.firstRenderedLabel,
      renderedTimeRange.lastRenderedLabel
    );
    visibleEvents = filtered.visibleEvents;
    outOfRangeEvents = filtered.outOfRangeEvents;
  }

  return {
    expectedRange,
    businessHours,
    firstSlot,
    lastSlot,
    renderedTimeRange,
    timezones,
    calendarStartTime,
    calendarEndTime,
    renderedEvents,
    visibleEvents,
    outOfRangeEvents,
  };
}

export function logCalendarLoad(
  expectedRange: { start: string; end: string },
  businessHours: WorkingHours[],
  firstSlot: Date,
  lastSlot: Date,
  renderedTimeRange: {
    firstRenderedLabel: string;
    lastRenderedLabel: string;
    firstRenderedTime: Date;
    lastRenderedTime: Date;
  },
  timezones: TimezoneContext,
  renderedEvents?: Array<{
    index: number;
    displayIndex: number;
    time: string;
    duration: number;
    name: string;
  }>,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  // Deduplicate: create a key from the log parameters
  const dateStr = firstSlot.toISOString().split('T')[0];
  const logKey = `calendarLoad:${dateStr}:${expectedRange.start}:${expectedRange.end}:${timezones.userSelected}:${timezones.calendar}:${renderedTimeRange.firstRenderedLabel}:${renderedTimeRange.lastRenderedLabel}`;
  if (!shouldLog(logKey)) return;

  const data = extractCalendarLoadData(
    expectedRange,
    businessHours,
    firstSlot,
    lastSlot,
    renderedTimeRange,
    timezones,
    renderedEvents
  );

  // Check if calendar failed to render (using fallback values)
  const isFallback = 
    data.renderedTimeRange.firstRenderedLabel.includes('(expected, not detected)') ||
    data.renderedTimeRange.lastRenderedLabel.includes('(expected, not detected)');

  if (isFallback) {
    writer.log('⚠️ [DEBUG] Calendar Load FAILED - FullCalendar did not render properly');
    writer.log(`  Expected Time Range: ${data.expectedRange.start} - ${data.expectedRange.end}`);
    writer.log(`  Attempted to detect rendered slots from DOM but found none.`);
    writer.log(`  Date Range: ${data.firstSlot.toISOString().split('T')[0]}`);
    writer.log(`  Business Hours: ${formatBusinessHours(data.businessHours)}`);
    writer.log(`  Time Range (${data.timezones.userSelected} | ${data.timezones.calendar}): ${data.expectedRange.start} | ${data.calendarStartTime} - ${data.expectedRange.end} | ${data.calendarEndTime}`);
    return;
  }

  writer.log('[DEBUG] Calendar Loaded');
  writer.log(`  Date Range: ${data.firstSlot.toISOString().split('T')[0]}`);
  writer.log(`  Business Hours: ${formatBusinessHours(data.businessHours)}`);
  writer.log(`  Time Range (${data.timezones.userSelected} | ${data.timezones.calendar}): ${data.expectedRange.start} | ${data.calendarStartTime} - ${data.expectedRange.end} | ${data.calendarEndTime}`);
  
  // Format rendered time range with day offsets
  const firstLabel = formatRenderedTimeRangeLabel(
    data.renderedTimeRange.firstRenderedLabel,
    data.renderedTimeRange.firstRenderedTime,
    data.timezones.userSelected,
    data.timezones.calendar
  );
  const lastLabel = formatRenderedTimeRangeLabel(
    data.renderedTimeRange.lastRenderedLabel,
    data.renderedTimeRange.lastRenderedTime,
    data.timezones.userSelected,
    data.timezones.calendar
  );
  writer.log(`  Rendered Time Range (from FullCalendar DOM): "${firstLabel}" - "${lastLabel}"`);

  if (data.visibleEvents && data.visibleEvents.length > 0) {
    writer.log('  Rendered Events:');
    data.visibleEvents.forEach((event) => {
      writer.log(`    ${event.index}. ${event.time} (${event.duration} min) - ${event.name}`);
    });

    if (data.outOfRangeEvents && data.outOfRangeEvents.length > 0) {
      writer.log(`    ... and ${data.outOfRangeEvents.length} out of range event(s)`);
    }
  }
}

export function extractApiCallData(
  endpoint: string,
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  timezones: TimezoneContext
): ApiCallData {
  let events: Array<{ date: string; time: string; name: string }> | undefined;

  if (endpoint === 'getEventsForDay' && Array.isArray(response.events)) {
    events = response.events as Array<{ date: string; time: string; name: string }>;
  }

  return {
    endpoint,
    request,
    response,
    timezones,
    events,
  };
}

export function logApiCall(
  endpoint: string,
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  timezones: TimezoneContext,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractApiCallData(endpoint, request, response, timezones);

  writer.log(`[DEBUG] Google API Call: ${data.endpoint}`);
  writer.log(`  Request: ${JSON.stringify(data.request, null, 2)}`);

  if (data.events) {
    writer.log(`  Response: ${(data.response.count as number) || 0} event(s)`);
    writer.log('  Events:');
    data.events.forEach((event, index) => {
      writer.log(`    ${index + 1}. (${event.date}) ${event.time} - ${event.name}`);
    });
  } else {
    writer.log(`  Response: ${JSON.stringify(data.response, null, 2)}`);
  }
}

export function extractTaskPlacementData(
  taskId: string,
  taskTitle: string,
  targetSlotLabel: string,
  actualStartTime: string,
  duration: number,
  timezones: TimezoneContext,
  isOutOfRange: boolean,
  listTitle?: string
): TaskPlacementData {
  const actualDate = new Date(actualStartTime);
  const times = formatTimeInAllTimezones(actualDate, timezones);

  return {
    taskId,
    taskTitle,
    targetSlotLabel,
    actualStartTime,
    duration,
    times,
    timezones,
    isOutOfRange,
    listTitle,
  };
}

export function logTaskPlacement(
  taskId: string,
  taskTitle: string,
  targetSlotLabel: string,
  actualStartTime: string,
  duration: number,
  timezones: TimezoneContext,
  isOutOfRange: boolean,
  listTitle?: string,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractTaskPlacementData(
    taskId,
    taskTitle,
    targetSlotLabel,
    actualStartTime,
    duration,
    timezones,
    isOutOfRange,
    listTitle
  );

  writer.log(`[DEBUG] Task Placement Attempt: "${data.taskTitle}" (${data.duration} minutes)`);
  writer.log(`  Target Slot Label (from DOM): "${data.targetSlotLabel}"`);
  writer.log('  Actual Placement Time:');
  writer.log(`    Browser: ${data.times.browser} (${data.timezones.browser})`);
  writer.log(`    Calendar: ${data.times.calendar} (${data.timezones.calendar})`);
  writer.log(`    User: ${data.times.user} (${data.timezones.userSelected})`);
  writer.log(`    UTC: ${data.times.utc}`);

  if (data.isOutOfRange) {
    writer.log('  ⚠️ WARNING: Task placed outside visible calendar range');
  }
}

export function extractTaskDragData(
  taskTitle: string,
  targetSlotLabel: string,
  oldStartTime: string,
  newStartTime: string,
  duration: number,
  timezones: TimezoneContext
): TaskDragData {
  const oldDate = new Date(oldStartTime);
  const newDate = new Date(newStartTime);
  const oldTimes = formatTimeInAllTimezones(oldDate, timezones);
  const newTimes = formatTimeInAllTimezones(newDate, timezones);

  return {
    taskTitle,
    targetSlotLabel,
    oldStartTime,
    newStartTime,
    duration,
    oldTimes,
    newTimes,
    timezones,
  };
}

export function logTaskDrag(
  taskTitle: string,
  targetSlotLabel: string,
  oldStartTime: string,
  newStartTime: string,
  duration: number,
  timezones: TimezoneContext,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractTaskDragData(
    taskTitle,
    targetSlotLabel,
    oldStartTime,
    newStartTime,
    duration,
    timezones
  );

  writer.log(`[DEBUG] Task Drag: "${data.taskTitle}" (${data.duration} minutes)`);
  writer.log(`  Target Slot Label (from DOM): "${data.targetSlotLabel}"`);
  writer.log('  Position:');
  writer.log(`    Browser: ${data.oldTimes.browser} -> ${data.newTimes.browser} (${data.timezones.browser})`);
  writer.log(`    Calendar: ${data.oldTimes.calendar} -> ${data.newTimes.calendar} (${data.timezones.calendar})`);
  writer.log(`    User: ${data.oldTimes.user} -> ${data.newTimes.user} (${data.timezones.userSelected})`);
  writer.log(`    UTC: ${data.oldTimes.utc} -> ${data.newTimes.utc}`);
}

export function extractTaskResizeData(
  taskTitle: string,
  oldDuration: number,
  newDuration: number,
  timezones: TimezoneContext
): TaskResizeData {
  return {
    taskTitle,
    oldDuration,
    newDuration,
    timezones,
  };
}

export function logTaskResize(
  taskTitle: string,
  oldDuration: number,
  newDuration: number,
  timezones: TimezoneContext,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractTaskResizeData(taskTitle, oldDuration, newDuration, timezones);

  writer.log(`[DEBUG] Task Resize: "${data.taskTitle}" (${data.oldDuration} -> ${data.newDuration} minutes)`);
}

export function extractSaveData(
  placements: TaskPlacement[],
  displayedTimes: Array<{ time: string; duration: number }>,
  timezones: TimezoneContext
): SaveData {
  const placementData = placements.map((placement, index) => {
    const date = new Date(placement.startTime);
    const times = formatTimeInAllTimezones(date, timezones);
    const displayedTime = displayedTimes[index]?.time || 'N/A';

    return {
      placement,
      displayedTime,
      times,
    };
  });

  return {
    placements,
    displayedTimes,
    timezones,
    placementData,
  };
}

export function logSave(
  placements: TaskPlacement[],
  displayedTimes: Array<{ time: string; duration: number }>,
  timezones: TimezoneContext,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractSaveData(placements, displayedTimes, timezones);

  writer.log(`[DEBUG] Save to Calendar (${data.placements.length}):`);
  data.placementData.forEach((item, index) => {
    writer.log(`    ${index + 1}. "${item.placement.taskTitle}" (${item.placement.duration} minutes)`);
    writer.log(`       Displayed Time (in dialog): ${item.displayedTime}`);
    writer.log(`       Actual Start Time:`);
    writer.log(`         Browser: ${item.times.browser} (${data.timezones.browser})`);
    writer.log(`         Calendar: ${item.times.calendar} (${data.timezones.calendar})`);
    writer.log(`         User: ${item.times.user} (${data.timezones.userSelected})`);
    writer.log(`         UTC: ${item.times.utc}`);
  });
}

export function extractSlotLabelData(
  slotTime: Date,
  labelText: string,
  timezones: TimezoneContext
): SlotLabelData {
  const times = formatTimeInAllTimezones(slotTime, timezones);

  return {
    slotTime,
    labelText,
    times,
    timezones,
  };
}

export function logFullCalendarSlotLabel(
  slotTime: Date,
  labelText: string,
  timezones: TimezoneContext,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractSlotLabelData(slotTime, labelText, timezones);

  writer.log('[DEBUG] FullCalendar Slot Label Detected');
  writer.log(`  Label Text: "${data.labelText}"`);
  writer.log('  Slot Time:');
  writer.log(`    Browser: ${data.times.browser} (${data.timezones.browser})`);
  writer.log(`    Calendar: ${data.times.calendar} (${data.timezones.calendar})`);
  writer.log(`    User: ${data.times.user} (${data.timezones.userSelected})`);
  writer.log(`    UTC: ${data.times.utc}`);
}

export function extractAutoFitPlacementData(
  taskId: string,
  taskTitle: string,
  startTime: string,
  duration: number,
  timezones: TimezoneContext,
  listTitle?: string
): AutoFitPlacementData {
  const startDate = new Date(startTime);
  const times = formatTimeInAllTimezones(startDate, timezones);

  return {
    taskId,
    taskTitle,
    startTime,
    duration,
    times,
    timezones,
    listTitle,
  };
}

export function extractAutoFitData(
  date: string,
  totalTasks: number,
  filteredTasks: number,
  placements: TaskPlacement[],
  unplacedTasks: Array<{ id: string; title: string; listTitle?: string }>,
  timezones: TimezoneContext,
  businessHours: WorkingHours[]
): AutoFitData {
  const placementData = placements.map((placement) =>
    extractAutoFitPlacementData(
      placement.taskId,
      placement.taskTitle,
      placement.startTime,
      placement.duration,
      timezones,
      placement.listTitle
    )
  );

  return {
    date,
    totalTasks,
    filteredTasks,
    placements: placementData,
    unplacedTasks,
    timezones,
    businessHours,
  };
}

export function logAutoFitPlacement(
  taskId: string,
  taskTitle: string,
  startTime: string,
  duration: number,
  timezones: TimezoneContext,
  listTitle?: string,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractAutoFitPlacementData(
    taskId,
    taskTitle,
    startTime,
    duration,
    timezones,
    listTitle
  );

  writer.log(`[DEBUG] Auto-Fit Placement: "${data.taskTitle}" (${data.duration} minutes)`);
  writer.log('  Actual Placement Time:');
  writer.log(`    Browser: ${data.times.browser} (${data.timezones.browser})`);
  writer.log(`    Calendar: ${data.times.calendar} (${data.timezones.calendar})`);
  writer.log(`    User: ${data.times.user} (${data.timezones.userSelected})`);
  writer.log(`    UTC: ${data.times.utc}`);
}

export function logAutoFit(
  date: string,
  totalTasks: number,
  filteredTasks: number,
  placements: TaskPlacement[],
  unplacedTasks: Array<{ id: string; title: string; listTitle?: string }>,
  timezones: TimezoneContext,
  businessHours: WorkingHours[],
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractAutoFitData(
    date,
    totalTasks,
    filteredTasks,
    placements,
    unplacedTasks,
    timezones,
    businessHours
  );

  writer.log('[DEBUG] Auto-Fit Started');
  writer.log(`  Business Hours: ${formatBusinessHours(data.businessHours)}`);

  if (data.placements.length > 0) {
    writer.log(`  Placements (${data.placements.length}):`);
    data.placements.forEach((placement, index) => {
      writer.log(`    ${index + 1}. "${placement.taskTitle}" (${placement.duration} minutes)`);
      writer.log(`       Actual Placement Time:`);
      writer.log(`         Browser: ${placement.times.browser} (${placement.timezones.browser})`);
      writer.log(`         Calendar: ${placement.times.calendar} (${placement.timezones.calendar})`);
      writer.log(`         User: ${placement.times.user} (${placement.timezones.userSelected})`);
      writer.log(`         UTC: ${placement.times.utc}`);
    });
  }

  writer.log(`[DEBUG] Auto-Fit Completed: ${data.placements.length} placed, ${data.unplacedTasks.length} unplaced`);
}

export function extractSettingsSaveData(
  previousSettings: Partial<UserSettings>,
  newSettings: UserSettings
): SettingsSaveData {
  const changedFields: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }> = [];

  // Check all settings fields for changes
  const allFields: Array<keyof UserSettings> = [
    'defaultTaskDuration',
    'taskColor',
    'workingHours',
    'minTimeBetweenTasks',
    'ignoreContainerTasks',
    'selectedCalendarId',
    'slotMinTime',
    'slotMaxTime',
    'timeFormat',
    'timezone',
    'calendarTimezones',
  ];

  allFields.forEach((field) => {
    const oldValue = previousSettings[field];
    const newValue = newSettings[field];

    // Deep comparison for arrays and objects
    if (field === 'workingHours') {
      const oldHours = oldValue as WorkingHours[] | undefined;
      const newHours = newValue as WorkingHours[];
      if (
        !oldHours ||
        oldHours.length !== newHours.length ||
        oldHours.some((h, i) => h.start !== newHours[i].start || h.end !== newHours[i].end)
      ) {
        changedFields.push({
          field,
          oldValue: oldHours,
          newValue: newHours,
        });
      }
    } else if (field === 'calendarTimezones') {
      const oldTz = oldValue as Record<string, string> | undefined;
      const newTz = newValue as Record<string, string> | undefined;
      if (JSON.stringify(oldTz) !== JSON.stringify(newTz)) {
        changedFields.push({
          field,
          oldValue: oldTz,
          newValue: newTz,
        });
      }
    } else if (oldValue !== newValue) {
      changedFields.push({
        field,
        oldValue,
        newValue,
      });
    }
  });

  return {
    previousSettings,
    newSettings,
    changedFields,
  };
}

function formatSettingValue(value: unknown): string {
  if (value === undefined || value === null) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // Format working hours array
    if (value[0] && typeof value[0] === 'object' && 'start' in value[0] && 'end' in value[0]) {
      return (value as WorkingHours[]).map((h) => `${h.start}-${h.end}`).join(', ');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function logSettingsSave(
  previousSettings: Partial<UserSettings>,
  newSettings: UserSettings,
  writer: LoggerWriter = new ConsoleLogger()
): void {
  if (!isDebugEnabled()) return;

  const data = extractSettingsSaveData(previousSettings, newSettings);

  writer.log('[DEBUG] Settings Saved');
  
  if (data.changedFields.length === 0) {
    writer.log('  No changes detected');
    return;
  }

  writer.log(`  Changed Fields (${data.changedFields.length}):`);
  data.changedFields.forEach((change) => {
    const oldFormatted = formatSettingValue(change.oldValue);
    const newFormatted = formatSettingValue(change.newValue);
    writer.log(`    ${change.field}: ${oldFormatted} -> ${newFormatted}`);
  });
}

