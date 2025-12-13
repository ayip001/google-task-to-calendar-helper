import { google } from 'googleapis';
import { GoogleCalendarEvent, GoogleCalendar, TaskPlacement } from '@/types';

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

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  placement: TaskPlacement
): Promise<GoogleCalendarEvent> {
  const calendar = createCalendarClient(accessToken);

  const startTime = new Date(placement.startTime);
  const endTime = new Date(startTime.getTime() + placement.duration * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: placement.taskTitle,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: endTime.toISOString(),
      },
      colorId: getGoogleColorId(placement.color),
      description: `Created from Google Task: ${placement.taskId}`,
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
  placements: TaskPlacement[]
): Promise<{ success: GoogleCalendarEvent[]; errors: string[] }> {
  const results: GoogleCalendarEvent[] = [];
  const errors: string[] = [];

  for (const placement of placements) {
    try {
      const event = await createCalendarEvent(accessToken, calendarId, placement);
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
