import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { autoFitTasks } from '@/lib/autofit';
import { getEventsForDay } from '@/lib/google/calendar';
import { getPlacements, setPlacements } from '@/lib/kv';
import { getUserSettings } from '@/lib/kv';
import { GoogleTask } from '@/types';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, tasks, timezoneOffset } = body as {
      date: string;
      tasks: GoogleTask[];
      timezoneOffset?: number;
    };

    if (!date || !tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Date and tasks required' }, { status: 400 });
    }

    const settings = await getUserSettings(session.user.email);
    const events = await getEventsForDay(session.accessToken, settings.selectedCalendarId, date);
    const existingPlacements = await getPlacements(session.user.email, date);

    // Pass timezone offset (default to 0 if not provided)
    const result = autoFitTasks(tasks, events, existingPlacements, settings, date, timezoneOffset ?? 0);

    const allPlacements = [...existingPlacements, ...result.placements];
    await setPlacements(session.user.email, date, allPlacements);

    return NextResponse.json({
      ...result,
      allPlacements,
    });
  } catch (error) {
    console.error('Error running auto-fit:', error);
    return NextResponse.json({ error: 'Failed to run auto-fit' }, { status: 500 });
  }
}
