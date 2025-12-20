import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
  createTestTask,
  createTestPlacement,
  getNextDayDate,
  createTestTimeRange,
  isTestEvent,
  saveSettings,
  getSettings,
  deleteTestEvent,
  createTestEvent,
  getEventsForDate,
} from './calendar-test-helpers';
import { extractDayOpenData, extractTaskPlacementData, extractSaveData } from '@/lib/debug-logger';
import { UserSettings } from '@/types';
import { getTestSession } from './test-auth';

describe('Minimal Calendar Action Test', () => {
  const mockCalendarId = 'primary';
  const mockTaskColor = '#4285F4';
  
  let originalSettings: UserSettings | null = null;
  let createdEventId: string | null = null;
  let hasTestSession = false;

  beforeEach(async () => {
    // Check if test session exists
    const session = await getTestSession();
    hasTestSession = !!session;

    if (!hasTestSession) {
      console.warn('\n⚠️  No test session found. This test requires authentication.');
      console.warn('Please visit http://localhost:3000/test-auth to authenticate and save your session.\n');
      return;
    }

    // Save original settings
    try {
      originalSettings = await getSettings();
    } catch (error) {
      // Settings might not exist yet or server might not be running
      console.warn('Could not fetch original settings:', error);
      originalSettings = null;
    }
  });

  afterEach(async () => {
    if (!hasTestSession) return;

    // Cleanup: Delete test event
    if (createdEventId) {
      try {
        await deleteTestEvent(mockCalendarId, createdEventId);
        createdEventId = null;
      } catch (error) {
        console.warn('Failed to cleanup test event:', error);
      }
    }

    // Restore original settings
    if (originalSettings) {
      try {
        await saveSettings(originalSettings);
      } catch (error) {
        console.warn('Failed to restore settings:', error);
      }
    }
  });

  afterAll(async () => {
    // Final cleanup - ensure all async operations complete
    // Give time for any pending network requests to finish
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should complete full workflow: open day, set range, add task, save, verify, cleanup', async () => {
    // Skip test if no session
    if (!hasTestSession) {
      console.log('Skipping test: No test session available');
      return;
    }

    const nextDay = getNextDayDate();
    const timeRange = createTestTimeRange();

    // Step 1: Open the next day
    const dayOpenData = extractDayOpenData(nextDay, 'UTC', 'UTC');
    expect(dayOpenData.date).toBe(nextDay);

    // Step 2: Set the range to 00:00 to 01:00
    const testSettings: Partial<UserSettings> = {
      slotMinTime: timeRange.start,
      slotMaxTime: timeRange.end,
    };
    
    let updatedSettings: UserSettings;
    try {
      updatedSettings = await saveSettings(testSettings);
      expect(updatedSettings.slotMinTime).toBe('00:00');
      expect(updatedSettings.slotMaxTime).toBe('01:00');
    } catch (error: any) {
      if (error.message?.includes('fetch failed') || error.code === 'EPERM') {
        throw new Error(
          'Cannot connect to server. Please ensure the Next.js dev server is running on http://localhost:3000'
        );
      }
      throw error;
    }

    // Step 3: Add a testing task
    const testTask = createTestTask('Minimal Test Task');
    const startTime = new Date(`${nextDay}T00:00:00Z`).toISOString();
    const testPlacement = createTestPlacement(testTask.id, testTask.title, startTime, 30);

    const placementData = extractTaskPlacementData(
      testPlacement.taskId,
      testPlacement.taskTitle,
      '00:00',
      testPlacement.startTime,
      testPlacement.duration,
      { browser: 'UTC', calendar: 'UTC', userSelected: 'UTC', utc: 'UTC' },
      false
    );
    expect(placementData.taskTitle).toContain('[TEST]');

    // Step 4: Save the task
    const saveData = extractSaveData(
      [testPlacement],
      [{ time: '00:00', duration: 30 }],
      { browser: 'UTC', calendar: 'UTC', userSelected: 'UTC', utc: 'UTC' }
    );
    expect(saveData.placements.length).toBe(1);

    // Step 5: Create the event via API
    const createdEvent = await createTestEvent(mockCalendarId, testPlacement, mockTaskColor);
    expect(createdEvent.id).toBeDefined();
    createdEventId = createdEvent.id;

    // Step 6: Calendar reloads and retrieves the created testing task
    const events = await getEventsForDate(mockCalendarId, nextDay);
    const testEvents = events.filter(isTestEvent);
    expect(testEvents.length).toBeGreaterThan(0);
    
    const foundEvent = testEvents.find(e => e.id === createdEvent.id);
    expect(foundEvent).toBeDefined();
    expect(foundEvent?.summary).toContain('[TEST]');

    // Step 7: Remove the testing task via API (handled in afterEach)
    // Step 8: Restore the user settings (handled in afterEach)

    // Test completed successfully - all workflow steps passed
    expect(createdEvent.id).toBeTruthy();
    expect(foundEvent).toBeDefined();
  });
});

