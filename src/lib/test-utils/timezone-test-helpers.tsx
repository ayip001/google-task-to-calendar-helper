import { render, waitFor } from '@testing-library/react';
import { DayCalendar } from '@/components/calendar/day-calendar';
import { UserSettings, GoogleCalendarEvent } from '@/types';
import { getRenderedTimeRange } from '@/lib/fullcalendar-utils';
import { logCalendarLoad, createTimezoneContext } from '@/lib/debug-logger';
import { DEFAULT_SETTINGS } from '@/lib/constants';

export interface TimeRangeTestResult {
  expectedFirstLabel: string;
  actualFirstLabel: string;
  expectedLastLabel: string;
  actualLastLabel: string;
  mismatchDetected: boolean;
  mismatchMessage?: string;
}

/**
 * Renders DayCalendar and verifies the time range displayed in the DOM
 * Returns the verification result without throwing (caller decides whether to fail)
 */
export async function verifyCalendarTimeRange(
  date: string,
  events: GoogleCalendarEvent[],
  settings: UserSettings,
  calendarTimezone: string,
  expectedTimeRange: { start: string; end: string }
): Promise<TimeRangeTestResult> {
  // Render the DayCalendar component
  const { container } = render(
    <DayCalendar
      date={date}
      events={events}
      placements={[]}
      onPlacementDrop={() => {}}
      onPlacementResize={() => {}}
      onExternalDrop={() => {}}
      onPlacementClick={() => {}}
      settings={settings}
      calendarTimezone={calendarTimezone}
    />
  );

  // Wait for FullCalendar to render
  // Full day ranges need more time to render all slots
  const isFullDay = expectedTimeRange.start === '00:00' && expectedTimeRange.end === '23:00';
  const timeout = isFullDay ? 20000 : 10000; // Further increased timeouts to ensure completion
  const additionalWait = isFullDay ? 4000 : 2000; // More time for slots to render
  
  try {
    // Wait for calendar container - use longer timeout for concurrent execution
    await waitFor(() => {
      const calendarContainer = container.querySelector('.day-calendar-container');
      if (!calendarContainer) {
        throw new Error('Calendar container not found');
      }
    }, { timeout, interval: 100 }); // Check more frequently

    // Give FullCalendar time to render slots (especially important for full day ranges)
    await new Promise(resolve => setTimeout(resolve, additionalWait));

    // Retry slot detection with more attempts - sometimes slots need a bit more time
    let retries = 5; // Increased retries
    let slotsFound = false;
    while (retries > 0 && !slotsFound) {
      const calendarContainer = container.querySelector('.day-calendar-container') as HTMLElement;
      if (calendarContainer) {
        const slots = calendarContainer.querySelectorAll('.fc-timegrid-slot-label, thead .fc-timegrid-slot-label, .fc-timegrid-slot-lane');
        if (slots.length > 0) {
          slotsFound = true;
          break;
        }
      }
      if (!slotsFound) {
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Longer wait between retries
      }
    }
    
    // If slots still not found after retries, return error result but don't throw
    if (!slotsFound) {
      return {
        expectedFirstLabel: expectedTimeRange.start,
        actualFirstLabel: '(expected, not detected)',
        expectedLastLabel: expectedTimeRange.end === '23:00' ? '22:30' : expectedTimeRange.end,
        actualLastLabel: '(expected, not detected)',
        mismatchDetected: true,
        mismatchMessage: 'FullCalendar slots not found after retries - calendar may not have fully rendered',
      };
    }
  } catch (error: any) {
    // If calendar doesn't render in time, return a result indicating failure
    // This allows the test to complete and report the issue
    return {
      expectedFirstLabel: expectedTimeRange.start,
      actualFirstLabel: '(expected, not detected)',
      expectedLastLabel: expectedTimeRange.end === '23:00' ? '22:30' : expectedTimeRange.end,
      actualLastLabel: '(expected, not detected)',
      mismatchDetected: true,
      mismatchMessage: `FullCalendar failed to render within timeout: ${error?.message || String(error)}`,
    };
  }

  // Get the rendered time range from DOM
  const calendarContainer = container.querySelector('.day-calendar-container') as HTMLElement;
  if (!calendarContainer) {
    return {
      expectedFirstLabel: expectedTimeRange.start,
      actualFirstLabel: '(expected, not detected)',
      expectedLastLabel: expectedTimeRange.end === '23:00' ? '22:30' : expectedTimeRange.end,
      actualLastLabel: '(expected, not detected)',
      mismatchDetected: true,
      mismatchMessage: 'Calendar container not found in DOM after wait',
    };
  }

  const renderedRange = getRenderedTimeRange(calendarContainer);
  
  if (!renderedRange) {
    return {
      expectedFirstLabel: expectedTimeRange.start,
      actualFirstLabel: '(expected, not detected)',
      expectedLastLabel: expectedTimeRange.end === '23:00' ? '22:30' : expectedTimeRange.end,
      actualLastLabel: '(expected, not detected)',
      mismatchDetected: true,
      mismatchMessage: 'Could not detect rendered time range from FullCalendar DOM - no slots found',
    };
  }

  // Log calendar load for debugging
  const [year, month, day] = date.split('-').map(Number);
  const [minHour, minMin] = expectedTimeRange.start.split(':').map(Number);
  const [maxHour, maxMin] = expectedTimeRange.end.split(':').map(Number);
  
  const firstSlot = new Date(year, month - 1, day, minHour, minMin);
  const lastSlot = new Date(year, month - 1, day, maxHour, maxMin);
  
  const timezones = createTimezoneContext(calendarTimezone, settings.timezone);
  
  logCalendarLoad(
    expectedTimeRange,
    settings.workingHours,
    firstSlot,
    lastSlot,
    {
      firstRenderedLabel: renderedRange.firstLabel,
      lastRenderedLabel: renderedRange.lastLabel,
      firstRenderedTime: renderedRange.firstTime,
      lastRenderedTime: renderedRange.lastTime,
    },
    timezones
  );

  // Extract actual rendered labels (handle dual timezone display)
  const actualFirstLabel = renderedRange.firstLabel.split(' | ')[0];
  const actualLastLabel = renderedRange.lastLabel.split(' | ')[0];
  
  // Calculate expected last label (FullCalendar shows 30-minute slots)
  // For range 00:00-01:00, we expect to see 00:00 and 00:30 as the last visible slot
  const [startHour, startMin] = expectedTimeRange.start.split(':').map(Number);
  const [endHour, endMin] = expectedTimeRange.end.split(':').map(Number);
  
  // Calculate the last slot: end time minus 30 minutes (since FullCalendar shows slots every 30 min)
  let expectedLastHour = endHour;
  let expectedLastMin = endMin - 30;
  if (expectedLastMin < 0) {
    expectedLastHour -= 1;
    expectedLastMin += 60;
  }
  
  const expectedFirstLabel = expectedTimeRange.start;
  const expectedLastLabel = `${String(expectedLastHour).padStart(2, '0')}:${String(expectedLastMin).padStart(2, '0')}`;

  // Check for mismatch
  const firstMismatch = actualFirstLabel !== expectedFirstLabel;
  const lastMismatch = actualLastLabel !== expectedLastLabel;
  const mismatchDetected = firstMismatch || lastMismatch;

  let mismatchMessage: string | undefined;
  if (mismatchDetected) {
    const parts: string[] = [];
    if (firstMismatch) {
      parts.push(`first slot: expected "${expectedFirstLabel}" but got "${actualFirstLabel}"`);
    }
    if (lastMismatch) {
      parts.push(`last slot: expected "${expectedLastLabel}" but got "${actualLastLabel}"`);
    }
    mismatchMessage = `Timezone rendering mismatch: ${parts.join(', ')}. This indicates a timezone conversion bug where FullCalendar is not correctly interpreting the time range.`;
  }

  return {
    expectedFirstLabel,
    actualFirstLabel,
    expectedLastLabel,
    actualLastLabel,
    mismatchDetected,
    mismatchMessage,
  };
}
