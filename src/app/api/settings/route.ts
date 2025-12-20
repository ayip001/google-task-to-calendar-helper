import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-helper';
import { getUserSettings, setUserSettings } from '@/lib/kv';
import { UserSettings } from '@/types';

export async function GET(request: Request) {
  const session = await getAuthSession(request);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await getUserSettings(session.user.email);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getAuthSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates = body as Partial<UserSettings>;

    const settings = await setUserSettings(session.user.email, updates);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
