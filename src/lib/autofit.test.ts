import { describe, expect, it } from 'vitest';
import { autoFitTasks } from '@/lib/autofit';
import type { GoogleCalendarEvent, GoogleTask, TaskPlacement, UserSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { DateTime } from 'luxon';

function makeTask(id: string, title: string): GoogleTask {
  return {
    id,
    title,
    status: 'needsAction',
    listId: 'list',
    listTitle: 'List',
  };
}

describe('autoFitTasks (timezone)', () => {
  it('places tasks inside working hours interpreted in selected timezone', () => {
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS,
      defaultTaskDuration: 30,
      minTimeBetweenTasks: 0,
      ignoreContainerTasks: false,
      workingHours: [{ start: '09:00', end: '10:00' }],
      slotMinTime: '00:00',
      slotMaxTime: '23:59',
      timeFormat: '24h',
      timezone: 'Australia/Sydney',
      selectedCalendarId: 'primary',
    };

    const tasks: GoogleTask[] = [makeTask('t1', 'Task 1'), makeTask('t2', 'Task 2')];
    const events: GoogleCalendarEvent[] = [];
    const existingPlacements: TaskPlacement[] = [];

    const result = autoFitTasks(tasks, events, existingPlacements, settings, '2025-12-27', 'Australia/Sydney');
    expect(result.placements).toHaveLength(2);

    const p1 = DateTime.fromISO(result.placements[0].startTime).setZone('Australia/Sydney');
    const p2 = DateTime.fromISO(result.placements[1].startTime).setZone('Australia/Sydney');

    expect(p1.toISODate()).toBe('2025-12-27');
    expect(p1.toFormat('HH:mm')).toBe('09:00');
    expect(p2.toFormat('HH:mm')).toBe('09:30');
  });
});


