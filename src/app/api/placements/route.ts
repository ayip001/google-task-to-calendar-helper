import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getPlacements,
  setPlacements,
  addPlacement,
  updatePlacement,
  removePlacement,
  clearPlacements,
} from '@/lib/kv';
import { TaskPlacement } from '@/types';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Date parameter required' }, { status: 400 });
  }

  try {
    const placements = await getPlacements(session.user.email, date);
    return NextResponse.json(placements);
  } catch (error) {
    console.error('Error fetching placements:', error);
    return NextResponse.json({ error: 'Failed to fetch placements' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, placement } = body as { date: string; placement: TaskPlacement };

    if (!date || !placement) {
      return NextResponse.json({ error: 'Date and placement required' }, { status: 400 });
    }

    const placements = await addPlacement(session.user.email, date, placement);
    return NextResponse.json(placements);
  } catch (error) {
    console.error('Error adding placement:', error);
    return NextResponse.json({ error: 'Failed to add placement' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, placementId, updates, placements: bulkPlacements } = body;

    if (bulkPlacements && date) {
      await setPlacements(session.user.email, date, bulkPlacements);
      return NextResponse.json(bulkPlacements);
    }

    if (!date || !placementId || !updates) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const placements = await updatePlacement(session.user.email, date, placementId, updates);
    return NextResponse.json(placements);
  } catch (error) {
    console.error('Error updating placement:', error);
    return NextResponse.json({ error: 'Failed to update placement' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const placementId = searchParams.get('placementId');
  const clearAll = searchParams.get('clearAll') === 'true';

  if (!date) {
    return NextResponse.json({ error: 'Date parameter required' }, { status: 400 });
  }

  try {
    if (clearAll) {
      await clearPlacements(session.user.email, date);
      return NextResponse.json({ success: true });
    }

    if (!placementId) {
      return NextResponse.json({ error: 'Placement ID required' }, { status: 400 });
    }

    const placements = await removePlacement(session.user.email, date, placementId);
    return NextResponse.json(placements);
  } catch (error) {
    console.error('Error deleting placement:', error);
    return NextResponse.json({ error: 'Failed to delete placement' }, { status: 500 });
  }
}
