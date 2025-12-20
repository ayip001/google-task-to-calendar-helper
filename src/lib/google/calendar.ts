import { google } from 'googleapis';
import { GoogleCalendarEvent, GoogleCalendar, TaskPlacement } from '@/types';
import { UTILITY_MARKER } from '@/lib/constants';

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
  date: string
): Promise<GoogleCalendarEvent[]> {
  const calendar = createCalendarClient(accessToken);

  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59`);

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (response.data.items || [])
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
  taskColor: string,
  timezone?: string
): Promise<GoogleCalendarEvent> {
  const calendar = createCalendarClient(accessToken);

  // The placement.startTime is pseudo-UTC from FullCalendar (wall-clock time in UTC fields)
  // We need to interpret it as the display timezone, not as actual UTC
  const startDate = new Date(placement.startTime);
  const endDate = new Date(startDate.getTime() + placement.duration * 60 * 1000);

  // Extract wall-clock components from the pseudo-UTC date
  const formatDateTime = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      // Append invisible marker to identify events created by this utility
      summary: placement.taskTitle + UTILITY_MARKER,
      start: {
        dateTime: formatDateTime(startDate),
        timeZone: timezone,
      },
      end: {
        dateTime: formatDateTime(endDate),
        timeZone: timezone,
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
  taskColor: string,
  timezone?: string
): Promise<{ success: GoogleCalendarEvent[]; errors: string[] }> {
  const results: GoogleCalendarEvent[] = [];
  const errors: string[] = [];

  for (const placement of placements) {
    try {
      const event = await createCalendarEvent(accessToken, calendarId, placement, taskColor, timezone);
      results.push(event);
    } catch (error) {
      errors.push(`Failed to create event for "${placement.taskTitle}": ${error}`);
    }
  }

  return { success: results, errors };
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
