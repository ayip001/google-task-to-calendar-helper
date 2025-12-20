import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-helper';
import { getCalendars, getEventsForDay, getEventsForMonth, createCalendarEvents, deleteCalendarEvent } from '@/lib/google/calendar';
import { TaskPlacement } from '@/types';

export async function GET(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const date = searchParams.get('date');
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  const calendarId = searchParams.get('calendarId') || 'primary';
  const timezone = searchParams.get('timezone') || undefined;

  try {
    if (type === 'calendars') {
      const calendars = await getCalendars(session.accessToken);
      return NextResponse.json(calendars);
    }

    // Month-based events fetching
    if (type === 'events' && year && month) {
      const events = await getEventsForMonth(
        session.accessToken,
        calendarId,
        parseInt(year, 10),
        parseInt(month, 10)
      );
      return NextResponse.json({ events });
    }

    // Day-based events fetching (legacy, still used by day view)
    if (type === 'events' && date) {
      const events = await getEventsForDay(session.accessToken, calendarId, date, timezone);
      return NextResponse.json(events);
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.accessToken) {
    // Check if we're in test mode and provide helpful error
    const testToken = request.headers.get('x-test-access-token');
    if (testToken) {
      return NextResponse.json({ 
        error: 'Unauthorized: Test token provided but session not created. Check test session helper.' 
      }, { status: 401 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { calendarId, placements, taskColor } = body as {
      calendarId: string;
      placements: TaskPlacement[];
      taskColor: string;
    };

    if (!calendarId || !placements || !Array.isArray(placements) || !taskColor) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await createCalendarEvents(session.accessToken, calendarId, placements, taskColor);

    // If there are errors, include them in the response
    if (result.errors.length > 0) {
      return NextResponse.json({
        success: false,
        savedCount: result.success.length,
        events: result.success,
        errors: result.errors,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      savedCount: result.success.length,
      events: result.success,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Error creating calendar events:', error);
    // Include more details in the error response for debugging
    const errorMessage = error?.message || 'Failed to create calendar events';
    const errorDetails = error?.response?.data || error?.errors || null;
    return NextResponse.json({ 
      error: errorMessage,
      details: errorDetails,
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId') || 'primary';
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    await deleteCalendarEvent(session.accessToken, calendarId, eventId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 });
  }
}
