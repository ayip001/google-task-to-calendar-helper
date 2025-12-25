'use client';

import { useRef, useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import type { EventDropArg, EventInput, EventContentArg, SlotLabelContentArg } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { GoogleCalendarEvent, TaskPlacement, UserSettings } from '@/types';
import { TIME_SLOT_INTERVAL } from '@/lib/constants';
import {
  formatTimeForDisplay,
  normalizeIanaTimeZone,
  parseTimeLabelToHHMM,
  utcISOStringFromInstant,
  wallTimeOnDateToUtc,
} from '@/lib/timezone';
import { logTimezoneDebug, onTimezoneDebugRefresh } from '@/lib/debug-timezone';
import { X } from 'lucide-react';

interface DayCalendarProps {
  date: string;
  events: GoogleCalendarEvent[];
  placements: TaskPlacement[];
  onPlacementDrop: (placementId: string, newStartTime: string) => void;
  onExternalDrop: (taskId: string, taskTitle: string, startTime: string, taskListTitle?: string) => void;
  onPlacementClick: (placementId: string) => void;
  onPastTimeDrop?: () => void;
  settings: UserSettings;
  selectedTimeZone: string;
  calendarTimeZone?: string;
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
  selectedTimeZone,
  calendarTimeZone,
}: DayCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const effectiveSelectedTimeZone = normalizeIanaTimeZone(selectedTimeZone);

    const checkNowPosition = () => {
      const nowInSelectedZone = DateTime.now().setZone(effectiveSelectedTimeZone);

      // Only show boundary indicator if viewing today
      if (nowInSelectedZone.toISODate() !== date) {
        setNowIndicatorPosition(null);
        return;
      }

      const [minHour, minMin] = settings.slotMinTime.split(':').map(Number);
      const [maxHour, maxMin] = settings.slotMaxTime.split(':').map(Number);
      const currentMinutes = nowInSelectedZone.hour * 60 + nowInSelectedZone.minute;
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
  }, [date, selectedTimeZone, settings.slotMinTime, settings.slotMaxTime]);

  useEffect(() => {
    if (!containerRef.current) return;
    logTimezoneDebug({
      container: containerRef.current,
      dateISO: date,
      selectedTimeZone,
      calendarTimeZone,
      slotMinTime: settings.slotMinTime,
      slotMaxTime: settings.slotMaxTime,
      timeFormat: settings.timeFormat,
    });
  }, [date, selectedTimeZone, calendarTimeZone, settings.slotMinTime, settings.slotMaxTime, settings.timeFormat]);

  useEffect(() => {
    return onTimezoneDebugRefresh(() => {
      if (!containerRef.current) return;
      logTimezoneDebug({
        container: containerRef.current,
        dateISO: date,
        selectedTimeZone,
        calendarTimeZone,
        slotMinTime: settings.slotMinTime,
        slotMaxTime: settings.slotMaxTime,
        timeFormat: settings.timeFormat,
      });
    });
  }, [date, selectedTimeZone, calendarTimeZone, settings.slotMinTime, settings.slotMaxTime, settings.timeFormat]);

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
      end: new Date(Date.parse(placement.startTime) + placement.duration * 60 * 1000).toISOString(),
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
      onPlacementDrop(placementId, utcISOStringFromInstant(info.event.start));
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
      onExternalDrop(taskId, taskTitle, utcISOStringFromInstant(info.event.start), taskListTitle);
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

  const renderSlotLabelContent = (arg: SlotLabelContentArg) => {
    const effectiveSelectedTimeZone = normalizeIanaTimeZone(selectedTimeZone);
    const hhmm = parseTimeLabelToHHMM(arg.text, settings.timeFormat);
    if (!hhmm) {
      // Fallback to FullCalendar-provided text if parsing ever fails.
      return <span>{arg.text}</span>;
    }

    const slotUtc = wallTimeOnDateToUtc(date, hhmm, effectiveSelectedTimeZone);
    const primary = DateTime.fromJSDate(slotUtc).setZone(effectiveSelectedTimeZone);
    const primaryLabel = formatTimeForDisplay(primary, settings.timeFormat);

    const effectiveCalendarTimeZone = normalizeIanaTimeZone(calendarTimeZone);
    const hasSecondary = Boolean(calendarTimeZone) && effectiveCalendarTimeZone !== effectiveSelectedTimeZone;
    if (!hasSecondary) {
      return <span>{primaryLabel}</span>;
    }

    const secondary = DateTime.fromJSDate(slotUtc).setZone(effectiveCalendarTimeZone);
    const secondaryLabel = formatTimeForDisplay(secondary, settings.timeFormat);

    const primaryDate = primary.toISODate();
    const secondaryDate = secondary.toISODate();
    const dayIndicator =
      !primaryDate || !secondaryDate || primaryDate === secondaryDate
        ? ''
        : secondaryDate < primaryDate
          ? ' -1'
          : ' +1';

    return (
      <div className="flex flex-col leading-tight">
        <span>{primaryLabel}</span>
        <span className="text-[10px] text-muted-foreground">
          {secondaryLabel}
          {dayIndicator}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="h-full day-calendar-container"
      style={{ '--task-color': settings.taskColor } as React.CSSProperties}
    >
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
        initialView="timeGridDay"
        initialDate={date}
        headerToolbar={false}
        allDaySlot={false}
        timeZone={normalizeIanaTimeZone(selectedTimeZone)}
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
        slotLabelContent={renderSlotLabelContent}
      />
    </div>
  );
}
