'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventInput, EventContentArg, SlotLabelContentArg } from '@fullcalendar/core';
import { GoogleCalendarEvent, TaskPlacement, WorkingHours } from '@/types';
import { TIME_SLOT_INTERVAL } from '@/lib/constants';
import { X } from 'lucide-react';

interface DayCalendarProps {
  date: string;
  events: GoogleCalendarEvent[];
  placements: TaskPlacement[];
  onPlacementDrop: (placementId: string, newStartTime: string) => void;
  onExternalDrop: (taskId: string, taskTitle: string, startTime: string, taskListTitle?: string) => void;
  onPlacementClick: (placementId: string) => void;
  onPastTimeDrop?: () => void;
  settings: {
    defaultTaskDuration: number;
    taskColor: string;
    workingHours: WorkingHours[];
    slotMinTime: string;
    slotMaxTime: string;
    timeFormat: '12h' | '24h';
    timezone?: string;
  };
  calendarTimezone?: string;
}

// Helper to format time in a specific timezone and calculate day offset relative to selected timezone
function formatTimeInTimezone(
  date: Date,
  timezone: string,
  selectedTimezone: string,
  format: '12h' | '24h'
): { time: string; dayOffset: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12h',
  });

  // Get the full date in both timezones to properly calculate day offset
  // Using en-CA locale gives YYYY-MM-DD format which is easy to compare
  const targetDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const selectedDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: selectedTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const targetDateStr = targetDateFormatter.format(date);
  const selectedDateStr = selectedDateFormatter.format(date);

  // Parse dates and calculate difference in days
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const selectedDate = new Date(selectedDateStr + 'T00:00:00');
  const dayOffset = Math.round((targetDate.getTime() - selectedDate.getTime()) / (24 * 60 * 60 * 1000));

  return {
    time: formatter.format(date),
    dayOffset,
  };
}

export function DayCalendar({
  date,
  events,
  placements,
  onPlacementDrop,
  onExternalDrop,
  onPlacementClick,
  onPastTimeDrop,
  settings,
  calendarTimezone,
}: DayCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if we need to show dual timezones
  const selectedTimezone = settings.timezone;
  const hasDifferentTimezones = selectedTimezone && calendarTimezone && selectedTimezone !== calendarTimezone;

  // The timezone to use for FullCalendar - selected timezone takes priority, then calendar timezone
  const displayTimezone = selectedTimezone || calendarTimezone;

  // Convert time from display timezone to browser local time
  // FullCalendar interprets slotMinTime/slotMaxTime in browser local time,
  // but we want them in the display timezone
  const convertToLocalTime = useCallback((timeStr: string): string => {
    if (!displayTimezone) return timeStr;

    const [hours, minutes] = timeStr.split(':').map(Number);

    // Get current offset between browser local time and display timezone
    const now = new Date();
    const localFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
    });
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: displayTimezone,
      hour: 'numeric',
      hour12: false,
    });

    const localHour = parseInt(localFormatter.format(now), 10);
    const tzHour = parseInt(tzFormatter.format(now), 10);

    // Offset in hours (local - tz), i.e., what to add to TZ time to get local time
    let offsetHours = localHour - tzHour;

    // Normalize to -12 to +12 range
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;

    // Apply offset to convert from display timezone to browser local
    let newHours = hours + offsetHours;

    // Handle wraparound
    if (newHours < 0) newHours += 24;
    if (newHours >= 24) newHours -= 24;

    return `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, [displayTimezone]);

  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(date);
    }
  }, [date]);

  // Set CSS variable on document root for drag ghost color
  useEffect(() => {
    document.documentElement.style.setProperty('--task-color', settings.taskColor);
    return () => {
      document.documentElement.style.removeProperty('--task-color');
    };
  }, [settings.taskColor]);

  // Determine if current time is outside visible range (for boundary indicator)
  const [nowIndicatorPosition, setNowIndicatorPosition] = useState<'top' | 'bottom' | null>(null);

  useEffect(() => {
    const checkNowPosition = () => {
      const now = new Date();

      // Get current time in the display timezone
      const tzToUse = displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const nowInTz = new Intl.DateTimeFormat('en-US', {
        timeZone: tzToUse,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);

      const tzYear = parseInt(nowInTz.find(p => p.type === 'year')?.value || '0', 10);
      const tzMonth = parseInt(nowInTz.find(p => p.type === 'month')?.value || '0', 10);
      const tzDay = parseInt(nowInTz.find(p => p.type === 'day')?.value || '0', 10);
      const tzHour = parseInt(nowInTz.find(p => p.type === 'hour')?.value || '0', 10);
      const tzMinute = parseInt(nowInTz.find(p => p.type === 'minute')?.value || '0', 10);

      const [year, month, day] = date.split('-').map(Number);

      // Only show boundary indicator if viewing today (in the display timezone)
      if (tzYear !== year || tzMonth !== month || tzDay !== day) {
        setNowIndicatorPosition(null);
        return;
      }

      const [minHour, minMin] = settings.slotMinTime.split(':').map(Number);
      const [maxHour, maxMin] = settings.slotMaxTime.split(':').map(Number);
      const currentMinutes = tzHour * 60 + tzMinute;
      const minMinutes = minHour * 60 + minMin;
      const maxMinutes = maxHour * 60 + maxMin;

      if (currentMinutes < minMinutes) {
        setNowIndicatorPosition('top');
      } else if (currentMinutes >= maxMinutes) {
        setNowIndicatorPosition('bottom');
      } else {
        setNowIndicatorPosition(null);
      }
    };

    checkNowPosition();
    const interval = setInterval(checkNowPosition, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [date, settings.slotMinTime, settings.slotMaxTime, displayTimezone]);

  // Inject boundary indicator into FullCalendar's scroll container
  useEffect(() => {
    if (!containerRef.current || !nowIndicatorPosition) return;

    // Find the time grid body inside FullCalendar
    const timeGridBody = containerRef.current.querySelector('.fc-timegrid-body');
    if (!timeGridBody) return;

    // Create the indicator element
    const indicator = document.createElement('div');
    indicator.className = 'fc-boundary-now-indicator';
    indicator.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      pointer-events: none;
      z-index: 10;
      ${nowIndicatorPosition === 'top' ? 'top: 0;' : 'bottom: 0;'}
    `;
    indicator.innerHTML = `
      <div style="width: 12px; height: 12px; border-radius: 50%; background-color: #ea4335; margin-left: -6px;"></div>
      <div style="flex: 1; height: 3px; background-color: #ea4335;"></div>
    `;

    // Ensure timeGridBody has relative positioning
    (timeGridBody as HTMLElement).style.position = 'relative';
    timeGridBody.appendChild(indicator);

    return () => {
      indicator.remove();
    };
  }, [nowIndicatorPosition]);

  const calendarEvents: EventInput[] = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      backgroundColor: '#9ca3af',
      borderColor: '#9ca3af',
      editable: false,
      extendedProps: {
        type: 'google-event',
      },
    })),
    ...placements.map((placement) => ({
      id: `placement-${placement.id}`,
      title: placement.taskTitle,
      start: placement.startTime,
      end: new Date(new Date(placement.startTime).getTime() + placement.duration * 60 * 1000).toISOString(),
      backgroundColor: settings.taskColor,
      borderColor: settings.taskColor,
      editable: true,
      classNames: ['temp-placement'],
      extendedProps: {
        type: 'placement',
        placementId: placement.id,
        listTitle: placement.listTitle,
      },
    })),
  ];

  const renderEventContent = (eventInfo: EventContentArg) => {
    const isPlacement = eventInfo.event.extendedProps?.type === 'placement';
    const listTitle = eventInfo.event.extendedProps?.listTitle;
    const placementId = eventInfo.event.extendedProps?.placementId;

    if (isPlacement) {
      return (
        <div className="flex flex-col h-full w-full overflow-hidden p-1">
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs truncate">{eventInfo.event.title}</div>
              {listTitle && (
                <div className="text-[10px] opacity-75 truncate">{listTitle}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (placementId) {
                  onPlacementClick(placementId);
                }
              }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-black/20 transition-colors"
              title="Remove placement"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      );
    }

    // Default rendering for Google Calendar events
    return (
      <div className="p-1 overflow-hidden">
        <div className="font-medium text-xs truncate">{eventInfo.event.title}</div>
      </div>
    );
  };

  // Convert FullCalendar's pseudo-UTC Date to actual UTC ISO string
  // When FullCalendar has a named timezone, Date objects store wall-clock time
  // in their UTC fields, not actual UTC. We need to convert properly.
  const fcDateToActualUTC = useCallback((fcDate: Date): string => {
    if (!displayTimezone) {
      return fcDate.toISOString();
    }

    // FullCalendar stores wall-clock time in UTC fields when timezone is set
    // Extract the wall-clock components
    const year = fcDate.getUTCFullYear();
    const month = fcDate.getUTCMonth();
    const day = fcDate.getUTCDate();
    const hours = fcDate.getUTCHours();
    const minutes = fcDate.getUTCMinutes();

    // Create a date string in the display timezone
    // Format: YYYY-MM-DDTHH:mm:ss
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // Get the offset for this timezone at this date
    const tempDate = new Date(dateStr + 'Z'); // Treat as UTC temporarily
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: displayTimezone,
      hour: 'numeric',
      hour12: false,
    });
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: 'numeric',
      hour12: false,
    });

    const tzHour = parseInt(tzFormatter.format(tempDate), 10);
    const utcHour = parseInt(utcFormatter.format(tempDate), 10);

    // Offset in hours (TZ - UTC), i.e., what to subtract from TZ time to get UTC
    let offsetHours = tzHour - utcHour;
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;

    // Create the actual UTC date by subtracting the offset
    const actualUtcDate = new Date(Date.UTC(year, month, day, hours - offsetHours, minutes));
    return actualUtcDate.toISOString();
  }, [displayTimezone]);

  // Check if a time is in the past (using actual UTC)
  const isTimeInPast = useCallback((fcDate: Date): boolean => {
    const actualUtc = fcDateToActualUTC(fcDate);
    return new Date(actualUtc) < new Date();
  }, [fcDateToActualUTC]);

  const handleEventDrop = (info: EventDropArg) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId && info.event.start) {
      // Prevent dropping placements on past times
      if (isTimeInPast(info.event.start)) {
        info.revert();
        onPastTimeDrop?.();
        return;
      }
      onPlacementDrop(placementId, fcDateToActualUTC(info.event.start));
    }
  };

  // Handle external drops from task panel - this fires after FullCalendar validates the drop
  const handleEventReceive = (info: { event: { start: Date | null; remove: () => void }; draggedEl: HTMLElement }) => {
    const taskId = info.draggedEl.dataset.taskId;
    const taskTitle = info.draggedEl.dataset.taskTitle;
    const taskListTitle = info.draggedEl.dataset.taskListTitle;

    if (taskId && taskTitle && info.event.start) {
      // Prevent dropping on past times
      if (isTimeInPast(info.event.start)) {
        info.event.remove();
        onPastTimeDrop?.();
        return;
      }
      // Remove the temporary event that FullCalendar created
      info.event.remove();
      // Create our own placement through the callback
      onExternalDrop(taskId, taskTitle, fcDateToActualUTC(info.event.start), taskListTitle);
    }
  };

  // Convert working hours to FullCalendar businessHours format
  // FullCalendar interprets these in browser local time, so we convert from display timezone
  const businessHours = settings.workingHours.map((hours) => ({
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
    startTime: convertToLocalTime(hours.start),
    endTime: convertToLocalTime(hours.end),
  }));

  // Use fallback values if settings are missing (e.g., from old saved settings)
  // FullCalendar interprets these in browser local time, so we convert from display timezone
  const slotMinTime = convertToLocalTime(settings.slotMinTime || '06:00');
  const slotMaxTime = convertToLocalTime(settings.slotMaxTime || '22:00');

  // Custom slot label content for dual timezone display
  const renderSlotLabel = useCallback((arg: SlotLabelContentArg) => {
    const slotDate = arg.date;

    if (!hasDifferentTimezones || !selectedTimezone || !calendarTimezone) {
      // Single timezone - just use default formatting
      const timeStr = settings.timeFormat === '12h'
        ? slotDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : slotDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      return <span className="text-xs">{timeStr}</span>;
    }

    // Dual timezone display
    // Your TZ (selected) is the base - shown above, bold
    // Calendar TZ shown below, muted, with +1/-1 if different day
    const selTz = formatTimeInTimezone(slotDate, selectedTimezone, selectedTimezone, settings.timeFormat);
    const calTz = formatTimeInTimezone(slotDate, calendarTimezone, selectedTimezone, settings.timeFormat);

    // Show actual day offset (handles extreme timezone differences like +2 or -2)
    const calDayIndicator = calTz.dayOffset !== 0
      ? <span className="text-[9px] text-muted-foreground ml-0.5">{calTz.dayOffset > 0 ? `+${calTz.dayOffset}` : calTz.dayOffset}</span>
      : null;

    return (
      <div className="flex flex-col text-[10px] leading-tight -my-1">
        <span className="font-medium">{selTz.time}</span>
        <span className="text-muted-foreground flex items-center">
          {calTz.time}
          {calDayIndicator}
        </span>
      </div>
    );
  }, [hasDifferentTimezones, calendarTimezone, selectedTimezone, settings.timeFormat]);

  return (
    <div
      ref={containerRef}
      className="h-full day-calendar-container"
      style={{ '--task-color': settings.taskColor } as React.CSSProperties}
    >
      <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          initialDate={date}
          timeZone={displayTimezone || 'local'}
          headerToolbar={false}
          allDaySlot={false}
          slotDuration={`00:${TIME_SLOT_INTERVAL}:00`}
          slotMinTime={`${slotMinTime}:00`}
          slotMaxTime={`${slotMaxTime}:00`}
          height="100%"
          events={calendarEvents}
          editable={true}
          selectable={false}
          droppable={true}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          eventReceive={handleEventReceive}
          eventOverlap={false}
          slotEventOverlap={false}
          snapDuration={`00:${TIME_SLOT_INTERVAL}:00`}
          nowIndicator={true}
          businessHours={businessHours}
          slotLaneClassNames="fc-slot-lane"
          slotLabelContent={renderSlotLabel}
        />
    </div>
  );
}
