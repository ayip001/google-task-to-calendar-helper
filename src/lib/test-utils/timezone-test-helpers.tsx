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
  await waitFor(() => {
    const calendarContainer = container.querySelector('.day-calendar-container');
    if (!calendarContainer) {
      throw new Error('Calendar container not found');
    }
  }, { timeout: 5000 });

  // Give FullCalendar additional time to fully render slots and events
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Get the rendered time range from DOM
  const calendarContainer = container.querySelector('.day-calendar-container') as HTMLElement;
  if (!calendarContainer) {
    throw new Error('Calendar container not found in DOM');
  }

  const renderedRange = getRenderedTimeRange(calendarContainer);
  
  if (!renderedRange) {
    throw new Error('Could not detect rendered time range from FullCalendar DOM');
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
