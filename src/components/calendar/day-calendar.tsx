'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

// Extract city name from IANA timezone string
function getCityFromTimezone(tz: string): string {
  const parts = tz.split('/');
  const city = parts[parts.length - 1];
  return city.replace(/_/g, ' ');
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

  // Get the day in both timezones to calculate offset
  // The offset is relative to the selected timezone (the "base" day)
  const targetDayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    day: 'numeric',
  });
  const selectedDayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: selectedTimezone,
    day: 'numeric',
  });

  const targetDay = parseInt(targetDayFormatter.format(date), 10);
  const selectedDay = parseInt(selectedDayFormatter.format(date), 10);
  const dayOffset = targetDay - selectedDay;

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

  // Generate column heading text
  const columnHeadingData = useMemo(() => {
    if (!hasDifferentTimezones) {
      return { single: true, text: 'Time' };
    }
    const yourCity = getCityFromTimezone(selectedTimezone!);
    const calCity = getCityFromTimezone(calendarTimezone!);
    return { single: false, yourCity, calCity };
  }, [hasDifferentTimezones, selectedTimezone, calendarTimezone]);

  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(date);
    }
  }, [date]);

  // Inject column heading into FullCalendar's time axis header
  useEffect(() => {
    if (!containerRef.current) return;

    // Find the time axis header cell (top-left corner of the calendar)
    const axisHeader = containerRef.current.querySelector('.fc-timegrid-axis');
    if (!axisHeader) return;

    // Clear existing content and add our heading
    axisHeader.innerHTML = '';

    const headingDiv = document.createElement('div');
    headingDiv.className = 'flex flex-col text-[10px] leading-tight p-1';

    if (columnHeadingData.single) {
      headingDiv.innerHTML = `<span class="font-medium">${columnHeadingData.text}</span>`;
    } else {
      headingDiv.innerHTML = `
        <span class="font-medium">${columnHeadingData.yourCity}</span>
        <span class="text-muted-foreground">${columnHeadingData.calCity}</span>
      `;
    }

    axisHeader.appendChild(headingDiv);
  }, [columnHeadingData]);

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
      const [year, month, day] = date.split('-').map(Number);
      const viewDate = new Date(year, month - 1, day);

      // Only show boundary indicator if viewing today
      if (
        now.getFullYear() !== viewDate.getFullYear() ||
        now.getMonth() !== viewDate.getMonth() ||
        now.getDate() !== viewDate.getDate()
      ) {
        setNowIndicatorPosition(null);
        return;
      }

      const [minHour, minMin] = settings.slotMinTime.split(':').map(Number);
      const [maxHour, maxMin] = settings.slotMaxTime.split(':').map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
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
  }, [date, settings.slotMinTime, settings.slotMaxTime]);

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

  // Check if a time is in the past
  const isTimeInPast = (time: Date): boolean => {
    return time < new Date();
  };

  const handleEventDrop = (info: EventDropArg) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId && info.event.start) {
      // Prevent dropping placements on past times
      if (isTimeInPast(info.event.start)) {
        info.revert();
        onPastTimeDrop?.();
        return;
      }
      onPlacementDrop(placementId, info.event.start.toISOString());
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
      onExternalDrop(taskId, taskTitle, info.event.start.toISOString(), taskListTitle);
    }
  };

  // Convert working hours to FullCalendar businessHours format
  const businessHours = settings.workingHours.map((hours) => ({
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
    startTime: hours.start,
    endTime: hours.end,
  }));

  // Use fallback values if settings are missing (e.g., from old saved settings)
  const slotMinTime = settings.slotMinTime || '06:00';
  const slotMaxTime = settings.slotMaxTime || '22:00';

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

    const calDayIndicator = calTz.dayOffset !== 0
      ? <span className="text-[9px] text-muted-foreground ml-0.5">{calTz.dayOffset > 0 ? '-1' : '+1'}</span>
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
