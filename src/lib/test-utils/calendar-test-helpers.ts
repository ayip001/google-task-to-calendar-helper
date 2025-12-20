import { GoogleTask, TaskPlacement, UserSettings, GoogleCalendarEvent } from '@/types';
import { UTILITY_MARKER } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { getTestSession, createAuthenticatedFetch } from './test-auth';

const TEST_TASK_PREFIX = '[TEST]';

let testFetch: typeof fetch | null = null;

async function getTestFetch(): Promise<typeof fetch> {
  if (testFetch) {
    return testFetch;
  }

  const session = await getTestSession();
  if (!session) {
    throw new Error('No test session found. Please visit /test-auth to authenticate.');
  }

  testFetch = createAuthenticatedFetch(session);
  return testFetch;
}

export function createTestTask(
  title: string = 'Test Task',
  listId: string = 'test-list-id',
  listTitle: string = 'Test List'
): GoogleTask {
  return {
    id: `test-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: `${TEST_TASK_PREFIX} ${title}`,
    status: 'needsAction',
    listId,
    listTitle,
    hasSubtasks: false,
  };
}

export function createTestPlacement(
  taskId: string,
  taskTitle: string,
  startTime: string,
  duration: number = 30
): TaskPlacement {
  return {
    id: `test-placement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taskId,
    taskTitle,
    startTime,
    duration,
  };
}

export function getNextDayDate(): string {
  const tomorrow = addDays(new Date(), 1);
  return format(tomorrow, 'yyyy-MM-dd');
}

export function createTestTimeRange(): { start: string; end: string } {
  return {
    start: '00:00',
    end: '01:00',
  };
}

export function isTestEvent(event: GoogleCalendarEvent): boolean {
  return event.summary.includes(TEST_TASK_PREFIX) || event.summary.endsWith(UTILITY_MARKER);
}

export async function saveSettings(
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error('Failed to save settings');
  }

  return response.json();
}

export async function getSettings(): Promise<UserSettings> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(`${baseUrl}/api/settings`);

  if (!response.ok) {
    throw new Error('Failed to get settings');
  }

  return response.json();
}

export async function deleteTestEvent(
  calendarId: string,
  eventId: string
): Promise<void> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/calendar?calendarId=${encodeURIComponent(calendarId)}&eventId=${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to delete test event');
  }
}

export async function createTestEvent(
  calendarId: string,
  placement: TaskPlacement,
  taskColor: string
): Promise<GoogleCalendarEvent> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(`${baseUrl}/api/calendar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      calendarId,
      placements: [placement],
      taskColor,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create test event');
  }

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors[0]);
  }

  return result.events[0];
}

export async function getEventsForDate(
  calendarId: string,
  date: string,
  timezone?: string
): Promise<GoogleCalendarEvent[]> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/calendar?type=events&date=${date}&calendarId=${encodeURIComponent(calendarId)}${timezone ? `&timezone=${encodeURIComponent(timezone)}` : ''}`;
  
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    throw new Error('Failed to get events');
  }

  return response.json();
}

