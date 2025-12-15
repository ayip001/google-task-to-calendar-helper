import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCalendars, getEventsForDay, getEventsForMonth, createCalendarEvents } from '@/lib/google/calendar';
import { TaskPlacement } from '@/types';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const date = searchParams.get('date');
  const year = searchParams.get('year');
  const month = searchParams.get('month');
  const calendarId = searchParams.get('calendarId') || 'primary';

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
      const events = await getEventsForDay(session.accessToken, calendarId, date);
      return NextResponse.json(events);
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
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

    return NextResponse.json({
      success: true,
      savedCount: result.success.length,
      events: result.success,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error creating calendar events:', error);
    return NextResponse.json({ error: 'Failed to create calendar events' }, { status: 500 });
  }
}
