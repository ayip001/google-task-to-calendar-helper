import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-helper';
import { autoFitTasks } from '@/lib/autofit';
import { getEventsForDay } from '@/lib/google/calendar';
import { getPlacements, setPlacements } from '@/lib/kv';
import { getUserSettings } from '@/lib/kv';
import { GoogleTask } from '@/types';
import { logAutoFit, createTimezoneContext } from '@/lib/debug-logger';

// Calculate timezone offset in minutes from a timezone string
function getTimezoneOffsetMinutes(timezone: string, date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const getParts = (formatter: Intl.DateTimeFormat, d: Date) => {
    const parts = formatter.formatToParts(d);
    return {
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10),
      day: parseInt(parts.find(p => p.type === 'day')?.value || '0', 10),
    };
  };

  const tzParts = getParts(tzFormatter, refDate);
  const utcParts = getParts(utcFormatter, refDate);

  // Calculate offset in hours (positive = timezone is ahead of UTC)
  let offsetHours = tzParts.hour - utcParts.hour;
  if (tzParts.day !== utcParts.day) {
    if (tzParts.day > utcParts.day) offsetHours += 24;
    else offsetHours -= 24;
  }
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;

  // Convert to minutes, and negate because JS uses opposite sign convention
  // (JS: negative = ahead of UTC, but we calculated positive = ahead)
  return -offsetHours * 60;
}

export async function POST(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, tasks, timezone } = body as {
      date: string;
      tasks: GoogleTask[];
      timezone?: string;
    };

    if (!date || !tasks || !Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Date and tasks required' }, { status: 400 });
    }

    const settings = await getUserSettings(session.user.email);
    const events = await getEventsForDay(session.accessToken, settings.selectedCalendarId, date, timezone);
    const existingPlacements = await getPlacements(session.user.email, date);

    // Calculate timezone offset from timezone string (default to 0 if not provided)
    const timezoneOffset = timezone ? getTimezoneOffsetMinutes(timezone, date) : 0;
    const result = autoFitTasks(tasks, events, existingPlacements, settings, date, timezoneOffset);

    const allPlacements = [...existingPlacements, ...result.placements];
    await setPlacements(session.user.email, date, allPlacements);

    // Log autofit call
    const calendarTimezone = settings.calendarTimezones?.[settings.selectedCalendarId];
    const userTimezone = timezone || settings.timezone;
    const timezones = createTimezoneContext(calendarTimezone, userTimezone);
    const filteredTasks = settings.ignoreContainerTasks ? tasks.filter(t => !t.hasSubtasks) : tasks;
    
    // Log autofit - ensure DEBUG is enabled for server-side logging
    // Force enable DEBUG for this call since we're in a test environment
    const originalDebug = process.env.NEXT_PUBLIC_DEBUG;
    process.env.NEXT_PUBLIC_DEBUG = 'true';
    
    try {
      logAutoFit(
        date,
        tasks.length,
        filteredTasks.length,
        result.placements,
        result.unplacedTasks.map(t => ({ id: t.id, title: t.title })),
        timezones,
        settings.workingHours
      );
    } finally {
      // Restore original value
      if (originalDebug !== undefined) {
        process.env.NEXT_PUBLIC_DEBUG = originalDebug;
      } else {
        delete process.env.NEXT_PUBLIC_DEBUG;
      }
    }

    return NextResponse.json({
      ...result,
      allPlacements,
    });
  } catch (error) {
    console.error('Error running auto-fit:', error);
    return NextResponse.json({ error: 'Failed to run auto-fit' }, { status: 500 });
  }
}
