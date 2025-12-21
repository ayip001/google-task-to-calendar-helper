import { google } from 'googleapis';
import { GoogleCalendarEvent, GoogleCalendar, TaskPlacement } from '@/types';
import { UTILITY_MARKER } from '@/lib/constants';
import { logApiCall, createTimezoneContext } from '@/lib/debug-logger';

export function createCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth });
}

export async function getCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const calendar = createCalendarClient(accessToken);
  const response = await calendar.calendarList.list();

  return (response.data.items || []).map((item) => ({
    id: item.id!,
    summary: item.summary!,
    primary: item.primary ?? undefined,
    timeZone: item.timeZone ?? undefined,
  }));
}

export async function getEventsForDay(
  accessToken: string,
  calendarId: string,
  date: string,
  timezone?: string
): Promise<GoogleCalendarEvent[]> {
  const calendar = createCalendarClient(accessToken);

  const getOffsetMinutes = (utcDate: Date, targetTimezone: string): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(utcDate).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

    const zonedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );

    return (zonedAsUtc - utcDate.getTime()) / (60 * 1000);
  };

  // Calculate start and end of day in the specified timezone
  // If no timezone provided, use UTC
  let timeMin: string;
  let timeMax: string;

  if (timezone) {
    // Parse the date and create ISO strings for start/end of day in the timezone
    // We need to find what UTC time corresponds to 00:00 and 23:59:59 in the timezone
    const [year, month, day] = date.split('-').map(Number);
    const utcStartOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const utcEndOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const offsetMinutesAtStart = getOffsetMinutes(utcStartOfDay, timezone);
    const offsetMinutesAtEnd = getOffsetMinutes(utcEndOfDay, timezone);

    // Start of day in timezone = 00:00 in TZ = (00:00 - offset) in UTC
    const startUTC = new Date(utcStartOfDay.getTime() - offsetMinutesAtStart * 60 * 1000);
    // End of day in timezone = 23:59:59 in TZ
    const endUTC = new Date(utcEndOfDay.getTime() - offsetMinutesAtEnd * 60 * 1000);

    timeMin = startUTC.toISOString();
    timeMax = endUTC.toISOString();
  } else {
    // Fallback: use date as UTC (old behavior)
    timeMin = `${date}T00:00:00.000Z`;
    timeMax = `${date}T23:59:59.999Z`;
  }

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = response.data.items || [];
  const events = items
    .filter((item) => item.start?.dateTime && item.end?.dateTime)
    .map((item) => ({
      id: item.id!,
      summary: item.summary || 'Untitled Event',
      description: item.description ?? undefined,
      start: {
        dateTime: item.start?.dateTime ?? undefined,
        date: item.start?.date ?? undefined,
        timeZone: item.start?.timeZone ?? undefined,
      },
      end: {
        dateTime: item.end?.dateTime ?? undefined,
        date: item.end?.date ?? undefined,
        timeZone: item.end?.timeZone ?? undefined,
      },
      colorId: item.colorId ?? undefined,
    }));

  const timezones = createTimezoneContext(undefined, timezone);
  logApiCall('getEventsForDay', { date, calendarId, timezone }, { events, count: events.length }, timezones);

  return events;
}

export async function getEventsForMonth(
  accessToken: string,
  calendarId: string,
  year: number,
  month: number // 0-indexed (0 = January)
): Promise<GoogleCalendarEvent[]> {
  const calendar = createCalendarClient(accessToken);

  // Get first day of the month
  const startOfMonth = new Date(year, month, 1);
  // Get last day of the month (day 0 of next month = last day of current month)
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfMonth.toISOString(),
    timeMax: endOfMonth.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500, // Google Calendar API max
  });

  return (response.data.items || []).map((item) => ({
    id: item.id!,
    summary: item.summary || 'Untitled Event',
    description: item.description ?? undefined,
    start: {
      dateTime: item.start?.dateTime ?? undefined,
      date: item.start?.date ?? undefined,
      timeZone: item.start?.timeZone ?? undefined,
    },
    end: {
      dateTime: item.end?.dateTime ?? undefined,
      date: item.end?.date ?? undefined,
      timeZone: item.end?.timeZone ?? undefined,
    },
    colorId: item.colorId ?? undefined,
  }));
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  placement: TaskPlacement,
  taskColor: string
): Promise<GoogleCalendarEvent> {
  const calendar = createCalendarClient(accessToken);

  // placement.startTime is actual UTC (e.g., "2024-12-20T02:00:00.000Z" for 10am HK)
  // Google Calendar API correctly interprets UTC and converts to calendar timezone
  const startTime = new Date(placement.startTime);
  const endTime = new Date(startTime.getTime() + placement.duration * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      // Append invisible marker to identify events created by this utility
      summary: placement.taskTitle + UTILITY_MARKER,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: endTime.toISOString(),
      },
      colorId: getGoogleColorId(taskColor),
    },
  });

  return {
    id: response.data.id!,
    summary: response.data.summary!,
    description: response.data.description ?? undefined,
    start: {
      dateTime: response.data.start?.dateTime ?? undefined,
      date: response.data.start?.date ?? undefined,
    },
    end: {
      dateTime: response.data.end?.dateTime ?? undefined,
      date: response.data.end?.date ?? undefined,
    },
    colorId: response.data.colorId ?? undefined,
  };
}

export async function createCalendarEvents(
  accessToken: string,
  calendarId: string,
  placements: TaskPlacement[],
  taskColor: string
): Promise<{ success: GoogleCalendarEvent[]; errors: string[] }> {
  const results: GoogleCalendarEvent[] = [];
  const errors: string[] = [];

  for (const placement of placements) {
    try {
      const event = await createCalendarEvent(accessToken, calendarId, placement, taskColor);
      results.push(event);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to create event for "${placement.taskTitle}": ${errorMessage}`);
    }
  }

  return { success: results, errors };
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const calendar = createCalendarClient(accessToken);
  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

export async function createCalendar(
  accessToken: string,
  summary: string,
  timeZone: string
): Promise<GoogleCalendar> {
  const calendar = createCalendarClient(accessToken);
  const response = await calendar.calendars.insert({
    requestBody: {
      summary,
      timeZone,
    },
  });

  return {
    id: response.data.id!,
    summary: response.data.summary!,
    timeZone: response.data.timeZone,
  };
}

export async function deleteCalendar(
  accessToken: string,
  calendarId: string
): Promise<void> {
  const calendar = createCalendarClient(accessToken);
  await calendar.calendars.delete({
    calendarId,
  });
}

function getGoogleColorId(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#a4bdfc': '1',
    '#7ae7bf': '2',
    '#dbadff': '3',
    '#ff887c': '4',
    '#fbd75b': '5',
    '#ffb878': '6',
    '#46d6db': '7',
    '#e1e1e1': '8',
    '#5484ed': '9',
    '#51b749': '10',
    '#dc2127': '11',
    '#4285f4': '9',
  };

  return colorMap[hexColor.toLowerCase()] || '9';
}
