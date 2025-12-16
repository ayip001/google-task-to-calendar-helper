import { GoogleTask, GoogleCalendarEvent, UserSettings, TaskPlacement, TimeSlot, AutoFitResult } from '@/types';
import { TIME_SLOT_INTERVAL } from './constants';

export function autoFitTasks(
  tasks: GoogleTask[],
  existingEvents: GoogleCalendarEvent[],
  existingPlacements: TaskPlacement[],
  settings: UserSettings,
  date: string,
  timezoneOffset: number = 0 // Minutes offset from UTC (e.g., -480 for UTC+8)
): AutoFitResult {
  const availableSlots = _calculateAvailableSlots(
    existingEvents,
    existingPlacements,
    settings,
    date,
    timezoneOffset
  );

  const filteredTasks = settings.ignoreContainerTasks
    ? tasks.filter((t) => !t.hasSubtasks)
    : tasks;

  const sortedTasks = _sortTasksByPriority(filteredTasks);
  const placements: TaskPlacement[] = [];
  const unplacedTasks: GoogleTask[] = [];
  const placedTaskIds = new Set<string>();

  for (const task of sortedTasks) {
    if (placedTaskIds.has(task.id)) {
      continue;
    }

    const slot = _findFirstAvailableSlot(availableSlots, settings.defaultTaskDuration);

    if (slot) {
      const placement: TaskPlacement = {
        id: `${task.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId: task.id,
        taskTitle: task.title,
        startTime: slot.start.toISOString(),
        duration: settings.defaultTaskDuration,
      };

      placements.push(placement);
      placedTaskIds.add(task.id);

      _removeSlotTime(availableSlots, slot.start, settings.defaultTaskDuration, settings.minTimeBetweenTasks);
    } else {
      unplacedTasks.push(task);
    }
  }

  const message = _generateResultMessage(placements, unplacedTasks);

  return { placements, unplacedTasks, message };
}

// Round up to the next slot interval (works with UTC timestamps)
function _roundUpToNextSlot(time: Date): Date {
  const minutes = time.getUTCMinutes();
  const remainder = minutes % TIME_SLOT_INTERVAL;

  if (remainder === 0 && time.getUTCSeconds() === 0 && time.getUTCMilliseconds() === 0) {
    return new Date(time);
  }

  const result = new Date(time);
  result.setUTCMinutes(minutes + (TIME_SLOT_INTERVAL - remainder), 0, 0);
  return result;
}

// Parse a time string (HH:MM) to a Date in the user's timezone
// timezoneOffset is in minutes (e.g., -480 for UTC+8)
function _parseTimeToDate(date: string, time: string, timezoneOffset: number): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const [year, month, day] = date.split('-').map(Number);

  // Create date in UTC, then adjust for user's timezone
  // Formula: UTC = local + offset, so local time in UTC = UTC value - offset
  const utcTime = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  return new Date(utcTime + timezoneOffset * 60 * 1000);
}

function _calculateAvailableSlots(
  events: GoogleCalendarEvent[],
  placements: TaskPlacement[],
  settings: UserSettings,
  date: string,
  timezoneOffset: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  // First, constrain to calendar visible range
  const calendarStart = _parseTimeToDate(date, settings.slotMinTime, timezoneOffset);
  const calendarEnd = _parseTimeToDate(date, settings.slotMaxTime, timezoneOffset);

  // Create slots from working hours, but constrain to calendar range
  for (const hours of settings.workingHours) {
    let start = _parseTimeToDate(date, hours.start, timezoneOffset);
    let end = _parseTimeToDate(date, hours.end, timezoneOffset);

    // Constrain to calendar visible range
    if (start < calendarStart) start = new Date(calendarStart);
    if (end > calendarEnd) end = new Date(calendarEnd);

    // Only add if there's still a valid range
    if (start < end) {
      slots.push({ start, end });
    }
  }

  // Check if this is today (in user's timezone)
  const now = new Date();
  // Convert now to user's timezone for comparison
  // We need to get the date string in user's timezone
  const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
  const todayStr = `${userNow.getUTCFullYear()}-${String(userNow.getUTCMonth() + 1).padStart(2, '0')}-${String(userNow.getUTCDate()).padStart(2, '0')}`;

  // If we're looking at today, exclude past times
  if (date === todayStr) {
    const roundedNow = _roundUpToNextSlot(now);
    const dayStart = _parseTimeToDate(date, '00:00', timezoneOffset);
    _subtractTimeFromSlots(slots, dayStart, roundedNow);
  }

  const blockedTimes = _getBlockedTimes(events, placements, settings.minTimeBetweenTasks);

  for (const blocked of blockedTimes) {
    _subtractTimeFromSlots(slots, blocked.start, blocked.end);
  }

  return slots.filter((slot) => slot.end.getTime() > slot.start.getTime());
}

function _getBlockedTimes(
  events: GoogleCalendarEvent[],
  placements: TaskPlacement[],
  minGap: number
): TimeSlot[] {
  const blocked: TimeSlot[] = [];

  for (const event of events) {
    const start = event.start.dateTime ? new Date(event.start.dateTime) : null;
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null;

    if (start && end) {
      blocked.push({
        start: new Date(start.getTime() - minGap * 60 * 1000),
        end: new Date(end.getTime() + minGap * 60 * 1000),
      });
    }
  }

  for (const placement of placements) {
    const start = new Date(placement.startTime);
    const end = new Date(start.getTime() + placement.duration * 60 * 1000);
    blocked.push({
      start: new Date(start.getTime() - minGap * 60 * 1000),
      end: new Date(end.getTime() + minGap * 60 * 1000),
    });
  }

  return blocked;
}

function _subtractTimeFromSlots(slots: TimeSlot[], blockStart: Date, blockEnd: Date): void {
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i];

    if (blockEnd <= slot.start || blockStart >= slot.end) {
      continue;
    }

    if (blockStart <= slot.start && blockEnd >= slot.end) {
      slots.splice(i, 1);
      continue;
    }

    if (blockStart > slot.start && blockEnd < slot.end) {
      const newSlot: TimeSlot = { start: blockEnd, end: slot.end };
      slot.end = blockStart;
      slots.splice(i + 1, 0, newSlot);
      continue;
    }

    if (blockStart <= slot.start) {
      slot.start = blockEnd;
    } else {
      slot.end = blockStart;
    }
  }
}

function _findFirstAvailableSlot(slots: TimeSlot[], durationMinutes: number): TimeSlot | null {
  const durationMs = durationMinutes * 60 * 1000;

  for (const slot of slots) {
    const slotDuration = slot.end.getTime() - slot.start.getTime();
    if (slotDuration >= durationMs) {
      return { start: new Date(slot.start), end: new Date(slot.start.getTime() + durationMs) };
    }
  }

  return null;
}

function _removeSlotTime(
  slots: TimeSlot[],
  start: Date,
  durationMinutes: number,
  gapMinutes: number
): void {
  const blockStart = start;
  const blockEnd = new Date(start.getTime() + (durationMinutes + gapMinutes) * 60 * 1000);
  _subtractTimeFromSlots(slots, blockStart, blockEnd);
}

function _sortTasksByPriority(tasks: GoogleTask[]): GoogleTask[] {
  return [...tasks].sort((a, b) => {
    const aHasDue = !!a.due;
    const bHasDue = !!b.due;

    // Tasks with due dates come first
    if (aHasDue !== bHasDue) {
      return aHasDue ? -1 : 1;
    }

    // Sort by due date if both have one
    if (aHasDue && bHasDue) {
      return new Date(a.due!).getTime() - new Date(b.due!).getTime();
    }

    return 0;
  });
}

function _generateResultMessage(placements: TaskPlacement[], unplaced: GoogleTask[]): string {
  if (unplaced.length === 0) {
    return `Successfully placed ${placements.length} task(s).`;
  }

  if (placements.length === 0) {
    return `Could not place any tasks. No available time slots.`;
  }

  return `Placed ${placements.length} task(s). ${unplaced.length} task(s) could not fit.`;
}
