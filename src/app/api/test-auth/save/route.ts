import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessionData = {
      accessToken: session.accessToken,
      user: {
        email: session.user?.email,
        name: session.user?.name,
      },
      savedAt: new Date().toISOString(),
    };

    // Save to .test-session.json in project root
    const projectRoot = process.cwd();
    const filePath = join(projectRoot, '.test-session.json');

    await writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');

    return NextResponse.json({ success: true, message: 'Session saved successfully' });
  } catch (error) {
    console.error('Error saving test session:', error);
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
  }
}
