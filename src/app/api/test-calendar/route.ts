import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-helper';
import { createCalendar, deleteCalendar } from '@/lib/google/calendar';

type ErrorWithMessage = { message?: string };

export async function POST(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { summary, timeZone } = body as {
      summary: string;
      timeZone: string;
    };

    if (!summary || !timeZone) {
      return NextResponse.json({ error: 'Summary and timeZone are required' }, { status: 400 });
    }

    const calendar = await createCalendar(session.accessToken, summary, timeZone);

    return NextResponse.json(calendar);
  } catch (error: unknown) {
    console.error('Error creating test calendar:', error);
    const errorMessage = (error as ErrorWithMessage)?.message || 'Failed to create test calendar';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');

    if (!calendarId) {
      return NextResponse.json({ error: 'Calendar ID is required' }, { status: 400 });
    }

    await deleteCalendar(session.accessToken, calendarId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting test calendar:', error);
    const errorMessage = (error as ErrorWithMessage)?.message || 'Failed to delete test calendar';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

