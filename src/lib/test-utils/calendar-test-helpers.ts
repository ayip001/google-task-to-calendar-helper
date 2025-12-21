import { GoogleTask, TaskPlacement, UserSettings, GoogleCalendarEvent, GoogleCalendar } from '@/types';
import { UTILITY_MARKER } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { getTestSession, createAuthenticatedFetch } from './test-auth';

const TEST_TASK_PREFIX = '[TEST]';

let testFetch: typeof fetch | null = null;

export async function getTestFetch(): Promise<typeof fetch> {
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
  
  try {
    const response = await authenticatedFetch(
      `${baseUrl}/api/calendar?calendarId=${encodeURIComponent(calendarId)}&eventId=${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(3000), // 3 second timeout per request
      }
    );

    // For 404 (already deleted) or 200/204 (success), just return
    if (response.status === 404 || response.status === 200 || response.status === 204) {
      return;
    }

    // For other errors, don't block - just return silently
    // The event might already be deleted or there might be a transient error
    return;
  } catch (error: any) {
    // Silently ignore all errors - deletion failures are non-fatal for tests
    // This includes network errors, timeouts, and API errors
    return;
  }
}

export async function deleteTestEvents(
  calendarId: string,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  try {
    const response = await authenticatedFetch(
      `${baseUrl}/api/calendar?calendarId=${encodeURIComponent(calendarId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds }),
        signal: AbortSignal.timeout(5000), // 5 second timeout for bulk deletion
      }
    );

    // For 200/204 (success), just return
    if (response.status === 200 || response.status === 204) {
      return;
    }

    // For other errors, don't block - just return silently
    return;
  } catch (error: any) {
    // Silently ignore all errors - deletion failures are non-fatal for tests
    return;
  }
}

export async function createTestEvent(
  calendarId: string,
  placement: TaskPlacement,
  taskColor: string
): Promise<GoogleCalendarEvent> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  let response: Response;
  try {
    response = await authenticatedFetch(`${baseUrl}/api/calendar`, {
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
  } catch (fetchError: any) {
    if (fetchError.message?.includes('fetch failed') || fetchError.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to server at ${baseUrl}. Please ensure the Next.js dev server is running: npm run dev`
      );
    }
    throw fetchError;
  }

  // Parse response regardless of status to get error details
  let result: any;
  let responseText: string;
  try {
    responseText = await response.text();
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { error: responseText || `HTTP ${response.status}: ${response.statusText}` };
    }
  } catch {
    result = { error: `HTTP ${response.status}: ${response.statusText}` };
    responseText = '';
  }

  if (!response.ok) {
    // Check if result has errors array (from our API route)
    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors[0];
      // Check if it's an authentication error
      if (errorMessage.includes('authentication') || errorMessage.includes('OAuth') || errorMessage.includes('invalid authentication credentials')) {
        throw new Error(
          `Authentication error: ${errorMessage}\n` +
          `Your test session token may have expired. Please:\n` +
          `1. Visit http://localhost:3000/test-auth\n` +
          `2. Sign in with Google\n` +
          `3. Click "Save Session for Tests" to refresh your token`
        );
      }
      throw new Error(`Failed to create event for "${placement.taskTitle}": ${errorMessage}`);
    }
    
    // Fallback to generic error
    const errorMessage = result.error || `HTTP ${response.status}: ${response.statusText}`;
    const errorDetails = result.details ? ` Details: ${JSON.stringify(result.details)}` : '';
    throw new Error(`Failed to create test event: ${errorMessage}${errorDetails}`);
  }

  // Response is OK, but check for errors in the result
  if (result.errors && result.errors.length > 0) {
    const errorMessage = result.errors[0];
    // Check if it's an authentication error
    if (errorMessage.includes('authentication') || errorMessage.includes('OAuth') || errorMessage.includes('invalid authentication credentials')) {
      throw new Error(
        `Authentication error: ${errorMessage}\n` +
        `Your test session token may have expired. Please:\n` +
        `1. Visit http://localhost:3000/test-auth\n` +
        `2. Sign in with Google\n` +
        `3. Click "Save Session for Tests" to refresh your token`
      );
    }
    throw new Error(`Failed to create event for "${placement.taskTitle}": ${errorMessage}`);
  }

  if (!result.events || result.events.length === 0) {
    throw new Error(`Event creation succeeded but no event returned`);
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

export async function getCalendars(): Promise<Array<{ id: string; summary: string; timeZone?: string }>> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/calendar?type=calendars`;
  
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    throw new Error('Failed to get calendars');
  }

  return response.json();
}

export async function createTestCalendar(
  summary: string,
  timeZone: string
): Promise<GoogleCalendar> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/test-calendar`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, timeZone }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create test calendar: ${errorText}`);
  }

  return response.json();
}

export async function deleteTestCalendar(calendarId: string): Promise<void> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/test-calendar?calendarId=${encodeURIComponent(calendarId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete test calendar: ${errorText}`);
  }
}

export async function runAutoFit(
  date: string,
  tasks: GoogleTask[],
  timezone?: string
): Promise<{ placements: TaskPlacement[]; unplacedTasks: Array<{ id: string; title: string }>; allPlacements: TaskPlacement[]; message: string }> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/autofit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, tasks, timezone }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to run autofit: ${errorText}`);
  }

  return response.json();
}

export async function clearAllPlacements(date: string): Promise<void> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/placements?date=${encodeURIComponent(date)}&clearAll=true`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to clear placements: ${errorText}`);
  }
}

export async function getPlacements(date: string): Promise<TaskPlacement[]> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/placements?date=${encodeURIComponent(date)}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get placements: ${errorText}`);
  }

  return response.json();
}

export async function addPlacement(date: string, placement: TaskPlacement): Promise<TaskPlacement[]> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const response = await authenticatedFetch(
    `${baseUrl}/api/placements`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, placement }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add placement: ${errorText}`);
  }

  return response.json();
}

/**
 * Deletes all test events from a calendar for a date range
 * Test events are identified by the UTILITY_MARKER in their summary
 * Fetches events month by month to avoid API limits
 */
export async function deleteAllTestEvents(
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const authenticatedFetch = await getTestFetch();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);
  
  let totalDeleted = 0;
  
  // Iterate through each month in the range
  for (let year = startYear; year <= endYear; year++) {
    const monthStart = year === startYear ? startMonth : 1;
    const monthEnd = year === endYear ? endMonth : 12;
    
    for (let month = monthStart; month <= monthEnd; month++) {
      try {
        // Fetch events for this month
        const response = await authenticatedFetch(
          `${baseUrl}/api/calendar?type=events&year=${year}&month=${month - 1}&calendarId=${encodeURIComponent(calendarId)}`
        );

        if (!response.ok) {
          console.warn(`Failed to fetch events for ${year}-${month}:`, await response.text());
          continue;
        }

        const data = await response.json();
        const events: GoogleCalendarEvent[] = data.events || [];
        
        // Filter test events
        const testEvents = events.filter(e => isTestEvent(e));
        
        // Delete each test event
        for (const event of testEvents) {
          try {
            await deleteTestEvent(calendarId, event.id);
            totalDeleted++;
          } catch (error) {
            console.warn(`Failed to delete test event ${event.id}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Error processing month ${year}-${month}:`, error);
      }
    }
  }
  
  return totalDeleted;
}

