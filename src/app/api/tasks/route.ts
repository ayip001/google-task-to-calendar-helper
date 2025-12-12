import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllTasks, getTaskLists } from '@/lib/google/tasks';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'lists') {
      const lists = await getTaskLists(session.accessToken);
      return NextResponse.json(lists);
    }

    const tasks = await getAllTasks(session.accessToken);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}
