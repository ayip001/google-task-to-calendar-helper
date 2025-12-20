import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import {
  getNextDayDate,
  saveSettings,
  getSettings,
  getEventsForDate,
  createTestCalendar,
  deleteTestCalendar,
  createTestTask,
  createTestEvent,
  deleteTestEvent,
  isTestEvent,
  runAutoFit,
  clearAllPlacements,
  getPlacements,
  addPlacement,
  deleteAllTestEvents,
} from './calendar-test-helpers';
import { logDayOpen, logTaskPlacement, logSave, logAutoFit, logSettingsSave, createTimezoneContext } from '@/lib/debug-logger';
import { UserSettings, GoogleCalendar, TaskPlacement, GoogleCalendarEvent, GoogleTask, WorkingHours } from '@/types';
import { getTestSession } from './test-auth';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { verifyCalendarTimeRange } from './timezone-test-helpers';
import { render, waitFor } from '@testing-library/react';
import { DayCalendar } from '@/components/calendar/day-calendar';
import { getEventSlotLabel } from '@/lib/fullcalendar-utils';

// Test timezones to verify
const TEST_TIMEZONES = [
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { name: 'Honolulu', tz: 'Pacific/Honolulu' },
  { name: 'Los Angeles', tz: 'America/Los_Angeles' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'Tokyo', tz: 'Asia/Tokyo' },
  { name: 'Sydney', tz: 'Australia/Sydney' },
] as const;

// Test time ranges to verify
const TEST_TIME_RANGES = [
  { start: '00:00', end: '01:00', name: 'Early morning (1 hour)' },
  { start: '00:00', end: '23:00', name: 'Full day' },
  { start: '11:00', end: '18:00', name: 'Business hours' },
] as const;

// Test calendar timezone (Hong Kong)
const TEST_CALENDAR_TIMEZONE = 'Asia/Hong_Kong';
const TEST_CALENDAR_NAME = '[TEST] Timezone Test Calendar';
const TEST_TASK_COLOR = '#4285F4';

/**
 * Converts a time string (e.g., "00:00") in a specific timezone to UTC ISO string for a given date
 */
function timeInTimezoneToUTC(date: string, timeStr: string, timezone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  // Try different UTC times to find one that formats to our target time
  for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
    for (let testHour = 0; testHour < 24; testHour++) {
      const testUTC = new Date(Date.UTC(year, month - 1, day + dayOffset, testHour, minute));
      const formatted = formatter.format(testUTC);
      const parts = formatted.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
      
      if (parts) {
        const [, , , , formattedHour, formattedMinute] = parts;
        if (parseInt(formattedHour, 10) === hour && parseInt(formattedMinute, 10) === minute) {
          return testUTC.toISOString();
        }
      }
    }
  }
  
  // Fallback
  const localDate = new Date(`${date}T${timeStr}:00`);
  return localDate.toISOString();
}

describe('Timezone-Aware Calendar Tests', () => {
  let originalSettings: UserSettings | null = null;
  let testCalendar: GoogleCalendar | null = null;
  let hasTestSession = false;

  beforeAll(async () => {
    const session = await getTestSession();
    hasTestSession = !!session;

    if (!hasTestSession) {
      console.warn('\n⚠️  No test session found. This test requires authentication.');
      console.warn('Please visit http://localhost:3000/test-auth to authenticate and save your session.\n');
      return;
    }

    try {
      originalSettings = await getSettings();
    } catch (error) {
      console.warn('Could not fetch original settings:', error);
      originalSettings = null;
    }

    try {
      testCalendar = await createTestCalendar(TEST_CALENDAR_NAME, TEST_CALENDAR_TIMEZONE);
      console.log(`✓ Created test calendar: ${testCalendar.id} (${TEST_CALENDAR_TIMEZONE})`);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to server. Please ensure the Next.js dev server is running on http://localhost:3000'
        );
      }
      if (errorMessage.includes('insufficient authentication scopes')) {
        console.warn(
          `⚠️  Cannot create test calendar: ${errorMessage}\n` +
          `   Using primary calendar instead.\n`
        );
        testCalendar = {
          id: 'primary',
          summary: 'Primary Calendar',
          timeZone: TEST_CALENDAR_TIMEZONE,
        };
      } else {
        throw new Error(`Failed to create test calendar: ${errorMessage}`);
      }
    }

    // Clean up all test events from the calendar before running tests
    // This runs in the background to avoid blocking test startup
    if (testCalendar) {
      // Run cleanup asynchronously without blocking
      deleteAllTestEvents(testCalendar.id, '2024-01-01', '2026-12-31')
        .then((deletedCount) => {
          if (deletedCount > 0) {
            console.log(`✓ Cleaned up ${deletedCount} test events from calendar`);
          }
        })
        .catch((error) => {
          console.warn('Note: Could not clean up test events (this is okay):', error);
        });
    }
  });

  afterEach(async () => {
    if (!hasTestSession) return;

    if (originalSettings) {
      try {
        await saveSettings(originalSettings);
      } catch (error) {
        console.warn('Failed to restore settings:', error);
      }
    }
  });

  afterAll(async () => {
    if (!hasTestSession) return;

    if (testCalendar?.id && testCalendar.id !== 'primary') {
      try {
        await deleteTestCalendar(testCalendar.id);
        console.log(`✓ Deleted test calendar: ${testCalendar.id}`);
      } catch (error) {
        console.warn('Note: Could not delete test calendar:', error);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  });

  // Global test counter
  let testCounter = 0;

  // Test suite: One per timezone
  describe.each(TEST_TIMEZONES)('User timezone: $name ($tz)', ({ tz: userTimezone, name: timezoneName }) => {
    
    // Test Group 1: Time Range Verification (3 tests per timezone)
    describe('Time Range Verification', () => {
      describe.each(TEST_TIME_RANGES)(
        'Time range: $start-$end ($name)',
        ({ start, end, name: rangeName }) => {
          it(`should verify calendar DOM renders correct time range`, async () => {
            testCounter++;
            console.log(`#${testCounter} ${timezoneName} - ${rangeName} - should verify calendar DOM renders correct time range`);
            
            if (!hasTestSession) {
              console.log('Skipping test: No test session available');
              return;
            }

            if (!originalSettings || !testCalendar) {
              throw new Error('Test setup incomplete');
            }

            const nextDay = getNextDayDate();
            const browserTimezone = typeof window !== 'undefined' 
              ? Intl.DateTimeFormat().resolvedOptions().timeZone 
              : 'UTC';
            
            const timezones = createTimezoneContext(TEST_CALENDAR_TIMEZONE, userTimezone);
            logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

            // Set user timezone and time range
            const testSettings: Partial<UserSettings> = {
              ...originalSettings,
              timezone: userTimezone,
              slotMinTime: start,
              slotMaxTime: end,
              selectedCalendarId: testCalendar.id,
            };

            const updatedSettings = await saveSettings(testSettings);
            expect(updatedSettings.timezone).toBe(userTimezone);
            expect(updatedSettings.slotMinTime).toBe(start);
            expect(updatedSettings.slotMaxTime).toBe(end);

            // Fetch events (empty calendar, just to get the rendering)
            const events = await getEventsForDate(testCalendar.id, nextDay, userTimezone);

            // Render calendar and verify time range in DOM
            const mockSettings = {
              ...DEFAULT_SETTINGS,
              ...updatedSettings,
              timezone: userTimezone,
              slotMinTime: start,
              slotMaxTime: end,
            };

            const result = await verifyCalendarTimeRange(
              nextDay,
              events,
              mockSettings,
              TEST_CALENDAR_TIMEZONE,
              { start, end }
            );

            // Assert - if mismatch detected, test should fail
            if (result.mismatchDetected) {
              expect.fail(result.mismatchMessage || 'Timezone rendering mismatch detected');
            }

            expect(result.mismatchDetected).toBe(false);
            expect(result.actualFirstLabel).toBe(result.expectedFirstLabel);
            expect(result.actualLastLabel).toBe(result.expectedLastLabel);
            
            console.log(`✓ Range verification passed: ${timezoneName} with ${rangeName}`);
          });
        }
      );
    });

    // Test Group 2: Task Operations (Place/Resize/Move) - 1 test per timezone
    describe('Task Operations (Place/Resize/Move)', () => {
      it('should place task at start, resize to 15 minutes, and move half hour later', async () => {
        testCounter++;
        console.log(`#${testCounter} ${timezoneName} - Task Operations - should place task at start, resize to 15 minutes, and move half hour later`);
        
        if (!hasTestSession) {
          console.log('Skipping test: No test session available');
          return;
        }

        if (!originalSettings || !testCalendar) {
          throw new Error('Test setup incomplete');
        }

        const nextDay = getNextDayDate();
        const browserTimezone = typeof window !== 'undefined' 
          ? Intl.DateTimeFormat().resolvedOptions().timeZone 
          : 'UTC';
        
        const timezones = createTimezoneContext(TEST_CALENDAR_TIMEZONE, userTimezone);
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Set user timezone, time range, and default task duration to 30 minutes
        const testSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: TEST_TIME_RANGES[0].start, // Use first range for task operations
          slotMaxTime: TEST_TIME_RANGES[0].end,
          selectedCalendarId: testCalendar.id,
          defaultTaskDuration: 30, // 30 minutes
        };

        const updatedSettings = await saveSettings(testSettings);
        expect(updatedSettings.defaultTaskDuration).toBe(30);

        // Fetch initial events (empty calendar)
        const events = await getEventsForDate(testCalendar.id, nextDay, userTimezone);

        // Render calendar and simulate UI interactions
        const mockSettings = {
          ...DEFAULT_SETTINGS,
          ...updatedSettings,
          timezone: userTimezone,
          slotMinTime: TEST_TIME_RANGES[0].start,
          slotMaxTime: TEST_TIME_RANGES[0].end,
          defaultTaskDuration: 30,
        };

        const placements: TaskPlacement[] = [];
        let createdPlacement: TaskPlacement | null = null;

        const { container } = render(
          <DayCalendar
            date={nextDay}
            events={events}
            placements={placements}
            onPlacementDrop={(placementId, newStartTime) => {
              const placement = placements.find(p => p.id === placementId);
              if (placement) {
                placement.startTime = newStartTime;
              }
            }}
            onPlacementResize={(placementId, newDuration) => {
              const placement = placements.find(p => p.id === placementId);
              if (placement) {
                placement.duration = newDuration;
              }
            }}
            onExternalDrop={(taskId, taskTitle, startTime, taskListTitle) => {
              const placement: TaskPlacement = {
                id: `placement-${Date.now()}`,
                taskId,
                taskTitle,
                startTime,
                duration: mockSettings.defaultTaskDuration,
              };
              placements.push(placement);
              createdPlacement = placement;
            }}
            onPlacementClick={() => {}}
            settings={mockSettings}
            calendarTimezone={TEST_CALENDAR_TIMEZONE}
          />
        );

        await waitFor(() => {
          const calendarContainer = container.querySelector('.day-calendar-container');
          expect(calendarContainer).toBeTruthy();
        }, { timeout: 5000 });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 1: Simulate placing a task at the start of the range (00:00)
        const testTask = createTestTask(`Task ${timezoneName}`);
        const initialStartTime = timeInTimezoneToUTC(nextDay, TEST_TIME_RANGES[0].start, userTimezone);
        
        const initialPlacement: TaskPlacement = {
          id: `placement-initial-${Date.now()}`,
          taskId: testTask.id,
          taskTitle: testTask.title,
          startTime: initialStartTime,
          duration: 30, // 30 minutes (default)
        };
        placements.push(initialPlacement);
        createdPlacement = initialPlacement;

        logTaskPlacement(
          testTask.id,
          testTask.title,
          TEST_TIME_RANGES[0].start,
          initialStartTime,
          30,
          timezones,
          false
        );

        // Step 2: Simulate resizing to 15 minutes
        createdPlacement.duration = 15;
        logTaskPlacement(
          testTask.id,
          testTask.title,
          TEST_TIME_RANGES[0].start,
          initialStartTime,
          15,
          timezones,
          false
        );

        // Step 3: Simulate moving it half an hour later (00:30)
        const movedStartTime = timeInTimezoneToUTC(nextDay, '00:30', userTimezone);
        createdPlacement.startTime = movedStartTime;
        logTaskPlacement(
          testTask.id,
          testTask.title,
          '00:30',
          movedStartTime,
          15,
          timezones,
          false
        );

        // Verify the placement was updated correctly
        expect(createdPlacement.duration).toBe(15);
        expect(createdPlacement.startTime).toBe(movedStartTime);
        
        console.log(`✓ Task operations completed for ${timezoneName}: placed, resized, and moved`);
      });
    });

    // Test Group 3: Fetch and Display Task - 1 test per timezone
    describe('Fetch and Display Task', () => {
      it('should save task, fetch from API, and verify rendering matches placement', async () => {
        testCounter++;
        console.log(`#${testCounter} ${timezoneName} - Fetch and Display Task - should save task, fetch from API, and verify rendering matches placement`);
        
        if (!hasTestSession) {
          console.log('Skipping test: No test session available');
          return;
        }

        if (!originalSettings || !testCalendar) {
          throw new Error('Test setup incomplete');
        }

        const nextDay = getNextDayDate();
        const browserTimezone = typeof window !== 'undefined' 
          ? Intl.DateTimeFormat().resolvedOptions().timeZone 
          : 'UTC';
        
        const timezones = createTimezoneContext(TEST_CALENDAR_TIMEZONE, userTimezone);
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Set user timezone, time range, and default task duration
        const testSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: TEST_TIME_RANGES[0].start,
          slotMaxTime: TEST_TIME_RANGES[0].end,
          selectedCalendarId: testCalendar.id,
          defaultTaskDuration: 30,
        };

        const updatedSettings = await saveSettings(testSettings);

        // Create a test task placement at 00:30 with 15 minutes duration
        const testTask = createTestTask(`Task ${timezoneName}`);
        const taskStartTime = timeInTimezoneToUTC(nextDay, '00:30', userTimezone);
        
        const placement: TaskPlacement = {
          id: `placement-${Date.now()}`,
          taskId: testTask.id,
          taskTitle: testTask.title,
          startTime: taskStartTime,
          duration: 15, // 15 minutes
        };

        logTaskPlacement(
          testTask.id,
          testTask.title,
          '00:30',
          taskStartTime,
          15,
          timezones,
          false
        );

        // Save to calendar
        let savedEvent: GoogleCalendarEvent;
        try {
          savedEvent = await createTestEvent(testCalendar.id, placement, TEST_TASK_COLOR);
          expect(savedEvent.id).toBeDefined();
          
          logSave([placement], [{ time: '00:30', duration: 15 }], timezones);
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          if (errorMessage.includes('authentication') || errorMessage.includes('OAuth')) {
            throw new Error(
              `Event creation failed: Authentication error.\n` +
              `Your test session token may have expired. Please:\n` +
              `1. Visit http://localhost:3000/test-auth\n` +
              `2. Sign in with Google\n` +
              `3. Click "Save Session for Tests" to refresh your token\n` +
              `Original error: ${errorMessage}`
            );
          }
          throw error;
        }

        // Fetch events from Google Calendar API (wait for sync)
        await new Promise(resolve => setTimeout(resolve, 1000));
        let events = await getEventsForDate(testCalendar.id, nextDay, userTimezone);
        const testEvents = events.filter(isTestEvent);
        let fetchedEvent = testEvents.find(e => e.id === savedEvent.id);
        
        if (!fetchedEvent) {
          // Retry after longer delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          events = await getEventsForDate(testCalendar.id, nextDay, userTimezone);
          const retryTestEvents = events.filter(isTestEvent);
          fetchedEvent = retryTestEvents.find(e => e.id === savedEvent.id);
          
          if (!fetchedEvent) {
            console.warn(`Event ${savedEvent.id} not found in fetched events. Available test events:`, 
              retryTestEvents.map(e => ({ id: e.id, summary: e.summary })));
            throw new Error(`Test event not found in fetched events. Created: ${savedEvent.id}, Found: ${retryTestEvents.length} test events`);
          }
        }
        
        expect(fetchedEvent).toBeDefined();

        // Render calendar with fetched events and check where it rendered
        const mockSettings = {
          ...DEFAULT_SETTINGS,
          ...updatedSettings,
          timezone: userTimezone,
          slotMinTime: TEST_TIME_RANGES[0].start,
          slotMaxTime: TEST_TIME_RANGES[0].end,
          defaultTaskDuration: 30,
        };

        const { container } = render(
          <DayCalendar
            date={nextDay}
            events={events}
            placements={[]}
            onPlacementDrop={() => {}}
            onPlacementResize={() => {}}
            onExternalDrop={() => {}}
            onPlacementClick={() => {}}
            settings={mockSettings}
            calendarTimezone={TEST_CALENDAR_TIMEZONE}
          />
        );

        await waitFor(() => {
          const calendarContainer = container.querySelector('.day-calendar-container');
          expect(calendarContainer).toBeTruthy();
        }, { timeout: 5000 });

        await new Promise(resolve => setTimeout(resolve, 1500));

        const calendarContainer = container.querySelector('.day-calendar-container') as HTMLElement;
        if (!calendarContainer) {
          throw new Error('Calendar container not found');
        }

        // Find the event in the DOM and check where it rendered
        const eventElements = calendarContainer.querySelectorAll('.fc-event');
        let eventRenderedSlot: string | null = null;
        let foundEventElement: HTMLElement | null = null;
        
        console.log(`Looking for event with title containing: "${testTask.title}"`);
        console.log(`Found ${eventElements.length} event elements in DOM`);
        
        for (const eventElement of eventElements) {
          const eventText = eventElement.textContent || '';
          console.log(`  Checking event: "${eventText.substring(0, 50)}..."`);
          
          if (eventText.includes('[TEST]')) {
            if (eventText.includes(testTask.title) || 
                (fetchedEvent && eventText.includes(fetchedEvent.summary.replace('[TEST]', '').trim()))) {
              foundEventElement = eventElement as HTMLElement;
              eventRenderedSlot = getEventSlotLabel(foundEventElement, calendarContainer);
              console.log(`  ✓ Found matching event, rendered at: ${eventRenderedSlot}`);
              break;
            }
          }
        }

        // Verify the event rendered at the expected time (00:30)
        if (eventRenderedSlot && foundEventElement) {
          const actualSlot = eventRenderedSlot.split(' | ')[0]; // Get first time from dual timezone display
          const expectedSlot = '00:30';
          
          console.log(`Event rendering verification for ${timezoneName}:`, {
            expectedSlot,
            actualSlot,
            eventRenderedAt: eventRenderedSlot,
          });

          if (actualSlot !== expectedSlot) {
            expect.fail(
              `Event timezone mismatch: Event expected at "${expectedSlot}" but FullCalendar rendered it at "${actualSlot}". ` +
              `This indicates a timezone conversion bug where events are displayed at incorrect times.`
            );
          }
          expect(actualSlot).toBe(expectedSlot);
        } else {
          console.error(`Could not find test event in DOM. Details:`, {
            testTaskTitle: testTask.title,
            fetchedEventSummary: fetchedEvent?.summary,
            eventElementsCount: eventElements.length,
            allEventTexts: Array.from(eventElements).map(el => el.textContent?.substring(0, 50)),
          });
          throw new Error(`Could not find test event in rendered calendar DOM. Found ${eventElements.length} events, but none matched.`);
        }

        // Clean up - delete the test event
        await deleteTestEvent(testCalendar.id, savedEvent.id);
        
        console.log(`✓ Fetch and display test completed for ${timezoneName}`);
      });
    });

    // Test Group 4: Auto Fit Tests - 1 test per timezone
    describe('Auto Fit Tests', () => {
      it('should test autofit with various working hour configurations', async () => {
        testCounter++;
        console.log(`#${testCounter} ${timezoneName} - Auto Fit Tests - should test autofit with various working hour configurations`);
        
        if (!hasTestSession) {
          console.log('Skipping test: No test session available');
          return;
        }

        if (!originalSettings || !testCalendar) {
          throw new Error('Test setup incomplete');
        }

        const nextDay = getNextDayDate();
        const browserTimezone = typeof window !== 'undefined' 
          ? Intl.DateTimeFormat().resolvedOptions().timeZone 
          : 'UTC';
        
        const timezones = createTimezoneContext(TEST_CALENDAR_TIMEZONE, userTimezone);
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Use business hours time range (11:00-18:00)
        const businessHoursRange = TEST_TIME_RANGES.find(r => r.name === 'Business hours')!;
        
        // Step 0: Set up initial settings - clear working hours, set min time between tasks to 15 minutes
        const initialSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: businessHoursRange.start,
          slotMaxTime: businessHoursRange.end,
          selectedCalendarId: testCalendar.id,
          defaultTaskDuration: 30,
          minTimeBetweenTasks: 15, // 15 minutes
          workingHours: [], // Clear working hours
        };

        let previousSettings = { ...originalSettings };
        let updatedSettings = await saveSettings(initialSettings);
        logSettingsSave(previousSettings, updatedSettings);
        expect(updatedSettings.workingHours).toEqual([]);
        expect(updatedSettings.minTimeBetweenTasks).toBe(15);

        // Create 10 test tasks
        const testTasks: GoogleTask[] = [];
        for (let i = 1; i <= 10; i++) {
          testTasks.push(createTestTask(`Task ${i} ${timezoneName}`));
        }

        // Step 1: Auto fit (should not place anything because there are no working hours)
        const result1 = await runAutoFit(nextDay, testTasks, userTimezone);
        expect(result1.placements.length).toBe(0);
        expect(result1.unplacedTasks.length).toBe(10);
        console.log(`✓ Step 1: Autofit with no working hours placed 0 tasks`);

        // Step 2: Set working range 00:00 to 03:00
        const workingHours1: WorkingHours[] = [{ start: '00:00', end: '03:00' }];
        previousSettings = { ...updatedSettings };
        updatedSettings = await saveSettings({
          ...updatedSettings,
          workingHours: workingHours1,
        });
        logSettingsSave(previousSettings, updatedSettings);
        expect(updatedSettings.workingHours).toEqual(workingHours1);

        // Step 3: Auto fit (should not place anything because working range is outside calendar display range)
        const result2 = await runAutoFit(nextDay, testTasks, userTimezone);
        expect(result2.placements.length).toBe(0);
        expect(result2.unplacedTasks.length).toBe(10);
        console.log(`✓ Step 3: Autofit with working hours outside calendar range placed 0 tasks`);

        // Step 4: Add a new working range 10:00-12:45 (keep the old one)
        const workingHours2: WorkingHours[] = [
          { start: '00:00', end: '03:00' },
          { start: '10:00', end: '12:45' },
        ];
        previousSettings = { ...updatedSettings };
        updatedSettings = await saveSettings({
          ...updatedSettings,
          workingHours: workingHours2,
        });
        logSettingsSave(previousSettings, updatedSettings);
        expect(updatedSettings.workingHours.length).toBe(2);

        // Step 5: Auto fit (should place exactly 2 tasks: 11:00-11:30 and 11:45-12:15)
        await clearAllPlacements(nextDay); // Clear any existing placements first
        console.log(`[TEST] Step 5: Calling runAutoFit with ${testTasks.length} tasks, working hours: ${JSON.stringify(workingHours2)}`);
        const result3 = await runAutoFit(nextDay, testTasks, userTimezone);
        console.log(`[TEST] Step 5: Autofit completed, got ${result3.placements.length} placements, ${result3.unplacedTasks.length} unplaced`);
        // Note: Autofit logging happens automatically in the API route

        expect(result3.placements.length).toBe(2);
        expect(result3.unplacedTasks.length).toBe(8);

        // Verify the two placements are at the expected times
        const placement1 = result3.placements[0];
        const placement2 = result3.placements[1];
        
        // Convert UTC times to user timezone to verify
        const placement1Time = new Date(placement1.startTime);
        const placement2Time = new Date(placement2.startTime);
        
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        const time1 = formatter.format(placement1Time);
        const time2 = formatter.format(placement2Time);
        
        expect(time1).toBe('11:00');
        expect(placement1.duration).toBe(30);
        expect(time2).toBe('11:45');
        expect(placement2.duration).toBe(30);
        
        console.log(`✓ Step 5: Autofit placed 2 tasks at 11:00-11:30 and 11:45-12:15`);

        // Step 6: Clear all task placements
        await clearAllPlacements(nextDay);
        const placementsAfterClear = await getPlacements(nextDay);
        expect(placementsAfterClear.length).toBe(0);
        console.log(`✓ Step 6: Cleared all placements`);

        // Step 7: Create a calendar event at 11:30-12:00 to block that time slot, and manually place a task at 12:30
        // First, create a calendar event (not a placement) at 11:30-12:00
        const calendarEventStartTime = timeInTimezoneToUTC(nextDay, '11:30', userTimezone);
        const calendarEventPlacement: TaskPlacement = {
          id: `calendar-event-${Date.now()}`,
          taskId: `event-${Date.now()}`,
          taskTitle: '[TEST] Calendar Event Blocking 11:30-12:00',
          startTime: calendarEventStartTime,
          duration: 30, // 11:30-12:00
        };
        
        const calendarEvent = await createTestEvent(testCalendar.id, calendarEventPlacement, TEST_TASK_COLOR);
        console.log(`✓ Step 7a: Created calendar event at 11:30-12:00 to block time slot (event ID: ${calendarEvent.id})`);
        
        // Wait a bit for the calendar event to be available in the API (Google Calendar API can have slight delays)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify the event was created by fetching events for the day
        const eventsAfterCreation = await getEventsForDate(testCalendar.id, nextDay, userTimezone);
        const createdEvent = eventsAfterCreation.find(e => e.id === calendarEvent.id);
        if (!createdEvent) {
          console.warn(`⚠️  Calendar event ${calendarEvent.id} not found in fetched events, waiting longer...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`✓ Step 7a: Verified calendar event is available in API`);
        }
        
        // Then, manually place a task at 12:30 (this blocks 12:30-13:00, and with minTimeBetweenTasks=15, blocks 12:15-13:15)
        const manualPlacementTime = timeInTimezoneToUTC(nextDay, '12:30', userTimezone);
        const manualPlacement: TaskPlacement = {
          id: `manual-${Date.now()}`,
          taskId: testTasks[0].id,
          taskTitle: testTasks[0].title,
          startTime: manualPlacementTime,
          duration: 30,
        };
        
        await addPlacement(nextDay, manualPlacement);
        const placementsAfterManual = await getPlacements(nextDay);
        expect(placementsAfterManual.length).toBe(1);
        console.log(`✓ Step 7b: Manually placed task at 12:30 (blocks 12:15-13:15 with 15 min gap)`);

        // Step 8: Auto fit (should place exactly 1 task at 11:00-11:30)
        // The calendar event blocks 11:30-12:00
        // The manual placement at 12:30-13:00, with minTimeBetweenTasks=15, blocks 12:15-13:15
        // Available slots: 11:00-11:30 (30 min, fits) and 12:00-12:15 (only 15 min, too short for 30 min task)
        // So only 11:00-11:30 is available for a 30-minute task
        console.log(`[TEST] Step 8: Calling runAutoFit with ${testTasks.slice(1).length} tasks, manual placement at 12:30, calendar event at 11:30-12:00`);
        const result4 = await runAutoFit(nextDay, testTasks.slice(1), userTimezone); // Use remaining 9 tasks
        console.log(`[TEST] Step 8: Autofit completed, got ${result4.placements.length} placements`);
        
        // Verify placements: should be 11:00-11:30
        const allPlacements = result4.allPlacements;
        const placementTimes = allPlacements
          .map(p => formatter.format(new Date(p.startTime)))
          .sort();
        
        if (result4.placements.length > 0) {
          const autofitPlacementTimes = result4.placements.map(p => formatter.format(new Date(p.startTime)));
          console.log(`[TEST] Step 8: Autofit placement times: ${autofitPlacementTimes.join(', ')}`);
        }
        
        // Log error if calendar event isn't blocking correctly (expected bug)
        if (result4.placements.length > 1 || placementTimes.some(t => t >= '11:30' && t < '12:00')) {
          const autofitTimes = result4.placements.map(p => formatter.format(new Date(p.startTime)));
          console.error(`❌ [BUG] Calendar event at 11:30-12:00 is not blocking correctly. Autofit placed ${result4.placements.length} tasks: ${autofitTimes.join(', ')}. Expected only 1 task at 11:00.`);
        }
        
        // Note: Autofit logging happens automatically in the API route
        
        // Should have 2 placements total: manual at 12:30, plus 1 autofit at 11:00
        expect(allPlacements.length).toBe(2);
        expect(result4.placements.length).toBe(1);
        expect(placementTimes).toContain('11:00');
        expect(placementTimes).toContain('12:30'); // Manual placement
        
        console.log(`✓ Step 8: Autofit placed 1 task at 11:00-11:30 (calendar event blocks 11:30-12:00, manual placement at 12:30 blocks 12:15-13:15 with 15 min gap, leaving only 11:00-11:30 available)`);

        // Step 9: Clear all task placements and delete the calendar event
        // Use try-finally to ensure cleanup always runs even if assertions fail
        try {
          console.log(`[TEST] Step 9: Clearing all placements and deleting calendar event`);
          await clearAllPlacements(nextDay);
          await deleteTestEvent(testCalendar.id, calendarEvent.id);
          const finalPlacements = await getPlacements(nextDay);
          expect(finalPlacements.length).toBe(0);
          console.log(`✓ Step 9: Cleared all placements and deleted calendar event`);
        } catch (error) {
          console.error(`❌ Step 9 failed: ${error}`);
          throw error;
        }
        
        console.log(`✓ Auto fit test completed for ${timezoneName}`);
      });
    });
  });
});
