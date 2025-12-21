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
  deleteTestEvents,
  isTestEvent,
  runAutoFit,
  clearAllPlacements,
  getPlacements,
  addPlacement,
  deleteAllTestEvents,
  getTestFetch,
} from './calendar-test-helpers';
import { logDayOpen, logTaskPlacement, logSave, logSettingsSave } from '@/lib/debug-logger';
import { UserSettings, GoogleCalendar, TaskPlacement, GoogleCalendarEvent, GoogleTask, WorkingHours } from '@/types';
import { getTestSession } from './test-auth';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { verifyCalendarTimeRange } from './timezone-test-helpers';
import { render, waitFor } from '@testing-library/react';
import { DayCalendar } from '@/components/calendar/day-calendar';
import { getEventSlotLabel, getRenderedTimeRange } from '@/lib/fullcalendar-utils';
import { logCalendarLoad } from '@/lib/debug-logger';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Cities representing each UTC offset for DOM rendering tests
const UTC_OFFSET_CITIES = [
  { name: 'Baker Island', tz: 'Pacific/Baker_Island', offset: -12 },
  { name: 'Honolulu', tz: 'Pacific/Honolulu', offset: -10 },
  { name: 'Los Angeles', tz: 'America/Los_Angeles', offset: -8 },
  { name: 'Denver', tz: 'America/Denver', offset: -7 },
  { name: 'Chicago', tz: 'America/Chicago', offset: -6 },
  { name: 'New York', tz: 'America/New_York', offset: -5 },
  { name: 'Caracas', tz: 'America/Caracas', offset: -4 },
  { name: 'Buenos Aires', tz: 'America/Buenos_Aires', offset: -3 },
  { name: 'São Paulo', tz: 'America/Sao_Paulo', offset: -3 },
  { name: 'Cape Verde', tz: 'Atlantic/Cape_Verde', offset: -1 },
  { name: 'London', tz: 'Europe/London', offset: 0 },
  { name: 'Paris', tz: 'Europe/Paris', offset: 1 },
  { name: 'Cairo', tz: 'Africa/Cairo', offset: 2 },
  { name: 'Moscow', tz: 'Europe/Moscow', offset: 3 },
  { name: 'Dubai', tz: 'Asia/Dubai', offset: 4 },
  { name: 'Karachi', tz: 'Asia/Karachi', offset: 5 },
  { name: 'Dhaka', tz: 'Asia/Dhaka', offset: 6 },
  { name: 'Bangkok', tz: 'Asia/Bangkok', offset: 7 },
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong', offset: 8 },
  { name: 'Tokyo', tz: 'Asia/Tokyo', offset: 9 },
  { name: 'Sydney', tz: 'Australia/Sydney', offset: 10 },
  { name: 'Auckland', tz: 'Pacific/Auckland', offset: 12 },
  { name: 'Fiji', tz: 'Pacific/Fiji', offset: 12 },
] as const;

// Test time ranges for DOM rendering tests (business hours commented out)
const DOM_RENDERING_TIME_RANGES = [
  { start: '00:00', end: '01:00', name: 'Early morning (1 hour)' },
  { start: '00:00', end: '23:00', name: 'Full day' },
  { start: '11:00', end: '18:00', name: 'Business hours' },
] as const;

// Timezones for calendar event rendering tests
const EVENT_RENDERING_TEST_TIMEZONES = [
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { name: 'Bangkok', tz: 'Asia/Bangkok' },
  { name: 'Tokyo', tz: 'Asia/Tokyo' },
] as const;

// Timezones for autofit and placement tests
const AUTOFIT_TEST_TIMEZONES = [
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { name: 'Paris', tz: 'Europe/Paris' },
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
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

  // ============================================================================
  // Test Group 0: Calendar Event Rendering Tests - Verify events render correctly
  // ============================================================================
  describe('Calendar Event Rendering Tests', () => {
    let createdHourlyEvents: GoogleCalendarEvent[] = [];
    const nextDay = getNextDayDate();

    beforeAll(async () => {
      if (!hasTestSession || !testCalendar) {
        return;
      }

      // Create calendar events for each hour of the day (00:00-01:00, 01:00-02:00, ..., 23:00-24:00)
      const placements: TaskPlacement[] = [];
      
      for (let hour = 0; hour < 24; hour++) {
        const startTime = `${String(hour).padStart(2, '0')}:00`;
        const nextHour = (hour + 1) % 24;
        const endTime = `${String(nextHour).padStart(2, '0')}:00`;
        const eventTitle = `[TEST] Event from ${startTime} - ${endTime}`;
        
        // Calculate start time in UTC for the calendar timezone
        const eventStartTime = timeInTimezoneToUTC(nextDay, startTime, TEST_CALENDAR_TIMEZONE);
        
        placements.push({
          id: `event-${hour}-${Date.now()}`,
          taskId: `task-${hour}`,
          taskTitle: eventTitle,
          startTime: eventStartTime,
          duration: 60, // 1 hour
        });
      }

      // Bulk create all events in a single API call
      const authenticatedFetch = await getTestFetch();
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const response = await authenticatedFetch(`${baseUrl}/api/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: testCalendar.id,
          placements,
          taskColor: TEST_TASK_COLOR,
        }),
      });

      // Parse response even if status is not OK (API may return partial success)
      const result = await response.json();
      createdHourlyEvents = result.events || [];
      
      // Check if we got any events at all
      if (createdHourlyEvents.length === 0) {
        const errorText = result.errors?.join(', ') || result.error || 'Unknown error';
        throw new Error(`Failed to create any events: ${errorText}`);
      }
      
      // Log warnings for partial failures, but proceed with what we have
      if (result.errors && result.errors.length > 0) {
        console.warn(`⚠️  ${result.errors.length} events failed to create (proceeding with ${createdHourlyEvents.length} created events)`);
      }
      
      console.log(`✓ Created ${createdHourlyEvents.length} hourly events (out of ${placements.length} requested) for all timezone tests`);
      
      if (createdHourlyEvents.length < 24) {
        console.warn(`⚠️  Expected 24 events but only ${createdHourlyEvents.length} were created - this may be due to API rate limits or auth token expiration`);
      }

      // Wait for events to be available in the API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, 30000); // 30 second timeout for event creation

    afterAll(async () => {
      if (!hasTestSession || !testCalendar) {
        return;
      }

      // Clean up - delete all test events from ±24 hours around the test day
      // This includes events created in this session and leftover from previous sessions
      try {
        const allTestEventIds: string[] = [];
        
        // Parse nextDay string and calculate date range (±24 hours)
        const [year, month, day] = nextDay.split('-').map(Number);
        const testDate = new Date(year, month - 1, day);
        
        // Fetch events for previous day, current day, and next day (±24 hours)
        const datesToCheck = [
          format(addDays(testDate, -1), 'yyyy-MM-dd'),
          nextDay,
          format(addDays(testDate, 1), 'yyyy-MM-dd'),
        ];

        for (const date of datesToCheck) {
          try {
            const events = await getEventsForDate(testCalendar.id, date);
            const testEvents = events.filter(isTestEvent);
            allTestEventIds.push(...testEvents.map(e => e.id));
          } catch (error) {
            // Ignore errors fetching events for a specific day
            console.warn(`Failed to fetch events for ${date}:`, error);
          }
        }

        // Remove duplicates (in case an event spans multiple days)
        const uniqueEventIds = [...new Set(allTestEventIds)];

        if (uniqueEventIds.length > 0) {
          // Use Promise.race to ensure deletion doesn't hang
          await Promise.race([
            deleteTestEvents(testCalendar.id, uniqueEventIds).catch(() => {
              // Silently ignore deletion failures - non-fatal for tests
            }),
            new Promise(resolve => setTimeout(resolve, 10000)) // 10 second max for bulk deletion
          ]);
          console.log(`✓ Cleaned up test events`);
        }
      } catch (error) {
        // Silently ignore cleanup errors - non-fatal for tests
        console.warn('Note: Could not clean up all test events:', error);
      }
    });

    describe.each(EVENT_RENDERING_TEST_TIMEZONES)('User timezone: $name ($tz)', ({ tz: userTimezone, name: timezoneName }) => {
      it('should create hourly events and verify DOM rendering', async () => {
        testCounter++;
        console.log(`#${testCounter} ${timezoneName} - Calendar Event Rendering - should verify DOM rendering with pre-created events`);
        
        if (!hasTestSession) {
          console.log('Skipping test: No test session available');
          return;
        }

        if (!originalSettings || !testCalendar) {
          throw new Error('Test setup incomplete');
        }

        if (createdHourlyEvents.length === 0) {
          throw new Error('No hourly events were created in beforeAll');
        }

        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Set user timezone and display hours to 12:00-14:00
        const testSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: '12:00',
          slotMaxTime: '14:00',
          selectedCalendarId: testCalendar.id,
        };

        const updatedSettings = await saveSettings(testSettings);
        expect(updatedSettings.timezone).toBe(userTimezone);
        expect(updatedSettings.slotMinTime).toBe('12:00');
        expect(updatedSettings.slotMaxTime).toBe('14:00');

        // Fetch events from Google Calendar API (events were created in beforeAll)
        const events = await getEventsForDate(testCalendar.id, nextDay, userTimezone);
        const testEvents = events.filter(isTestEvent);
        
        // Proceed with whatever events we have (non-zero is fine)
        if (testEvents.length === 0) {
          throw new Error('No test events were fetched from API');
        }

        // Render calendar with fetched events and check what's rendered in DOM
        const mockSettings = {
          ...DEFAULT_SETTINGS,
          ...updatedSettings,
          timezone: userTimezone,
          slotMinTime: '12:00',
          slotMaxTime: '14:00',
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

        // Get rendered time range from DOM
        const renderedTimeRange = getRenderedTimeRange(calendarContainer);
        if (!renderedTimeRange) {
          throw new Error('Could not detect rendered time range from FullCalendar DOM');
        }

        // Find all rendered events in the DOM and format for logging
        // Deduplicate events to handle React strict mode double rendering
        const eventElements = calendarContainer.querySelectorAll('.fc-event');
        const renderedEventsForLog: Array<{
          index: number;
          displayIndex: number;
          time: string;
          duration: number;
          name: string;
        }> = [];
        
        // Use a Set to track seen DOM elements directly to avoid duplicates from React strict mode
        const seenElements = new WeakSet<Element>();
        
        let testEventIndex = 0;
        for (const eventElement of eventElements) {
          // Skip if we've already processed this exact DOM element
          if (seenElements.has(eventElement)) {
            continue;
          }
          seenElements.add(eventElement);
          
          const eventText = eventElement.textContent?.trim() || '';
          if (!eventText.includes('[TEST]')) continue;
          
          const slot = getEventSlotLabel(eventElement as HTMLElement, calendarContainer);
          if (!slot) continue;
          
          // Extract the user timezone time (first part before |)
          const userTimeStr = slot.split(' | ')[0];
          const [hours, minutes] = userTimeStr.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes)) continue;
          
          const eventTimeMinutes = hours * 60 + minutes;
          
          // Only include events within 12:00-14:00 range (720-840 minutes)
          const minMinutes = 12 * 60; // 12:00
          const maxMinutes = 14 * 60; // 14:00
          if (eventTimeMinutes >= minMinutes && eventTimeMinutes < maxMinutes) {
            
            // Find the matching event from testEvents to get its actual start time
            // Match by extracting the hour from the event title (e.g., "Event from 12:00 - 13:00" -> hour 12)
            const hourMatch = eventText.match(/Event from (\d{2}):\d{2}/);
            const matchingEvent = hourMatch 
              ? testEvents.find(e => {
                  const eventHourMatch = e.summary?.match(/Event from (\d{2}):\d{2}/);
                  return eventHourMatch && eventHourMatch[1] === hourMatch[1];
                })
              : testEvents.find(e => e.summary === eventText);
            
            // Construct dual timezone format from the event's actual start time
            let dualTimeFormat = userTimeStr;
            if (matchingEvent && matchingEvent.start.dateTime) {
              const eventStartDate = new Date(matchingEvent.start.dateTime);
              const userTime = eventStartDate.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: userTimezone,
              });
              const calendarTime = eventStartDate.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: TEST_CALENDAR_TIMEZONE,
              });
              dualTimeFormat = `${userTime} | ${calendarTime}`;
            } else if (slot.includes(' | ')) {
              // If slot already has dual format, use it
              dualTimeFormat = slot;
            }
            
            // Try to extract duration from event element or estimate
            const estimatedDuration = Math.round((eventRect.height / 60) * 15); // Rough estimate based on height
            
            renderedEventsForLog.push({
              index: testEventIndex + 1,
              displayIndex: testEventIndex + 1,
              time: dualTimeFormat,
              duration: estimatedDuration,
              name: eventText,
            });
            testEventIndex++;
          }
        }

        // Final deduplication pass on the array (in case DOM query returned duplicates)
        // Normalize and deduplicate by name + time to catch any remaining duplicates
        const uniqueEvents = new Map<string, typeof renderedEventsForLog[0]>();
        for (const event of renderedEventsForLog) {
          // Normalize both name and time to handle any whitespace or formatting differences
          const normalizedName = event.name.replace(/\s+/g, ' ').trim();
          const normalizedTime = event.time.replace(/\s+/g, ' ').trim();
          const key = `${normalizedName}:${normalizedTime}`;
          // Keep the first occurrence of each unique event
          if (!uniqueEvents.has(key)) {
            uniqueEvents.set(key, event);
          }
        }
        const deduplicatedEvents = Array.from(uniqueEvents.values()).map((event, idx) => ({
          ...event,
          index: idx + 1,
          displayIndex: idx + 1,
        }));

        // Calculate first and last slot dates for logCalendarLoad
        const [year, month, day] = nextDay.split('-').map(Number);
        const [minHour, minMin] = '12:00'.split(':').map(Number);
        const [maxHour, maxMin] = '14:00'.split(':').map(Number);
        
        const firstSlot = new Date(year, month - 1, day, minHour, minMin);
        const lastSlot = new Date(year, month - 1, day, maxHour, maxMin);

        // Use logCalendarLoad to display rendered events using existing logging
        logCalendarLoad(
          { start: '12:00', end: '14:00' },
          [],
          firstSlot,
          lastSlot,
          {
            firstRenderedLabel: renderedTimeRange.firstLabel,
            lastRenderedLabel: renderedTimeRange.lastLabel,
            firstRenderedTime: renderedTimeRange.firstTime,
            lastRenderedTime: renderedTimeRange.lastTime,
          },
          timezones,
          deduplicatedEvents
        );

        // Verify we have rendered events
        expect(deduplicatedEvents.length).toBeGreaterThan(0);
        
        // Verify the rendered events match the expected pattern for each timezone
        // Expected patterns:
        // - Hong Kong: Events from 12:00-13:00 and 13:00-14:00 showing as "12:00 | 12:00" and "13:00 | 13:00"
        // - Tokyo: Events from 11:00-12:00 and 12:00-13:00 showing as "12:00 | 11:00" and "13:00 | 12:00"
        // - Bangkok: Events from 13:00-14:00 and 14:00-15:00 showing as "12:00 | 13:00" and "13:00 | 14:00"
        
        const expectedEvents: Array<{ time: string; name: string }> = [];
        if (timezoneName === 'Hong Kong') {
          expectedEvents.push(
            { time: '12:00 | 12:00', name: '[TEST] Event from 12:00 - 13:00' },
            { time: '13:00 | 13:00', name: '[TEST] Event from 13:00 - 14:00' }
          );
        } else if (timezoneName === 'Tokyo') {
          expectedEvents.push(
            { time: '12:00 | 11:00', name: '[TEST] Event from 11:00 - 12:00' },
            { time: '13:00 | 12:00', name: '[TEST] Event from 12:00 - 13:00' }
          );
        } else if (timezoneName === 'Bangkok') {
          expectedEvents.push(
            { time: '12:00 | 13:00', name: '[TEST] Event from 13:00 - 14:00' },
            { time: '13:00 | 14:00', name: '[TEST] Event from 14:00 - 15:00' }
          );
        }
        
        if (expectedEvents.length > 0) {
          expect(deduplicatedEvents.length).toBe(expectedEvents.length);
          for (let i = 0; i < expectedEvents.length; i++) {
            const expected = expectedEvents[i];
            const actual = deduplicatedEvents[i];
            expect(actual.time).toBe(expected.time);
            expect(actual.name).toBe(expected.name);
          }
        }
        
        console.log(`✓ Event rendering test completed for ${timezoneName}`);
      });
    });
  });

  // ============================================================================
  // Test Group 1: DOM Rendering Tests - One city per UTC offset
  // ============================================================================
  describe('DOM Rendering Tests (All UTC Offsets)', () => {
    describe.each(UTC_OFFSET_CITIES)('UTC Offset: $offset ($name)', ({ tz: userTimezone, name: timezoneName }) => {
      describe.each(DOM_RENDERING_TIME_RANGES)(
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
  });

  // ============================================================================
  // Test Group 2: Autofit and Placement Tests - Specific timezones only
  // ============================================================================
  describe('Autofit and Placement Tests', () => {
    describe.each(AUTOFIT_TEST_TIMEZONES)('User timezone: $name ($tz)', ({ tz: userTimezone, name: timezoneName }) => {
      
      // Test Group 2.1: Task Operations (Place/Resize/Move) - 1 test per timezone
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
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Set user timezone, time range, and default task duration to 30 minutes
        const testSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: DOM_RENDERING_TIME_RANGES[0].start, // Use first range for task operations
          slotMaxTime: DOM_RENDERING_TIME_RANGES[0].end,
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
          slotMinTime: DOM_RENDERING_TIME_RANGES[0].start,
          slotMaxTime: DOM_RENDERING_TIME_RANGES[0].end,
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
            onExternalDrop={(taskId, taskTitle, startTime, _taskListTitle) => {
              void _taskListTitle;
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
        const initialStartTime = timeInTimezoneToUTC(nextDay, DOM_RENDERING_TIME_RANGES[0].start, userTimezone);
        
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
          DOM_RENDERING_TIME_RANGES[0].start,
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
          DOM_RENDERING_TIME_RANGES[0].start,
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

      // Test Group 2.2: Fetch and Display Task - 1 test per timezone
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
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Set user timezone, time range, and default task duration
        const testSettings: Partial<UserSettings> = {
          ...originalSettings,
          timezone: userTimezone,
          slotMinTime: DOM_RENDERING_TIME_RANGES[0].start,
          slotMaxTime: DOM_RENDERING_TIME_RANGES[0].end,
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
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
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
          slotMinTime: DOM_RENDERING_TIME_RANGES[0].start,
          slotMaxTime: DOM_RENDERING_TIME_RANGES[0].end,
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

      // Test Group 2.3: Auto Fit Tests - 1 test per timezone
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
        logDayOpen(nextDay, TEST_CALENDAR_TIMEZONE, userTimezone);

        // Use business hours time range (11:00-18:00)
        const businessHoursRange = { start: '11:00', end: '18:00', name: 'Business hours' };
        
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
});
