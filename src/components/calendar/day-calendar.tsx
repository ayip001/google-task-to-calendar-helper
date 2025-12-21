'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventInput, EventContentArg, SlotLabelContentArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { GoogleCalendarEvent, TaskPlacement, WorkingHours } from '@/types';
import { TIME_SLOT_INTERVAL } from '@/lib/constants';
import { X } from 'lucide-react';
import {
  logDayOpen,
  logCalendarLoad,
  logTaskDrag,
  logTaskResize,
  logTaskPlacement,
  createTimezoneContext,
} from '@/lib/debug-logger';
import {
  getRenderedTimeRange,
  getSlotLabelForTime,
  getEventSlotLabel,
} from '@/lib/fullcalendar-utils';

interface DayCalendarProps {
  date: string;
  events: GoogleCalendarEvent[];
  placements: TaskPlacement[];
  onPlacementDrop: (placementId: string, newStartTime: string) => void;
  onPlacementResize: (placementId: string, newDuration: number) => void;
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
  onPlacementResize,
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
  // If none provided, fall back to UTC to avoid relying on browser timezone
  const displayTimezone = selectedTimezone || calendarTimezone || 'UTC';

  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(date);
    }

    logDayOpen(date, calendarTimezone, settings.timezone);
  }, [date, calendarTimezone, settings.timezone]);

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
      // Skip if no display timezone is set
      if (!displayTimezone) {
        setNowIndicatorPosition(null);
        return;
      }

      const now = new Date();

      // Get current time in the display timezone
      const nowInTz = new Intl.DateTimeFormat('en-US', {
        timeZone: displayTimezone,
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

  // Check if a time is in the past
  const isTimeInPast = useCallback((fcDate: Date): boolean => {
    return fcDate < new Date();
  }, []);

  const handleEventDrop = (info: EventDropArg) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId && info.event.start) {
      // Prevent dropping placements on past times
      if (isTimeInPast(info.event.start)) {
        info.revert();
        onPastTimeDrop?.();
        return;
      }

      const oldStartTime = info.oldEvent.start?.toISOString() || '';
      const newStartTime = info.event.start.toISOString();
      
      // Find the placement to get task title and duration
      const placement = placements.find(p => p.id === placementId);
      const taskTitle = placement?.taskTitle || info.event.title || 'Unknown Task';
      const duration = placement?.duration || (info.event.end && info.event.start 
        ? Math.round((new Date(info.event.end).getTime() - new Date(info.event.start).getTime()) / (60 * 1000))
        : 0);

      if (containerRef.current) {
        const timezones = createTimezoneContext(calendarTimezone, settings.timezone);
        let targetSlotLabel = getSlotLabelForTime(
          info.event.start,
          containerRef.current,
          calendarRef.current?.getApi()
        );
        
        // If slot label not found, calculate it from the time using the same format as renderSlotLabel
        if (!targetSlotLabel) {
          const slotDate = info.event.start;
          if (hasDifferentTimezones && selectedTimezone && calendarTimezone) {
            const selTz = formatTimeInTimezone(slotDate, selectedTimezone, selectedTimezone, settings.timeFormat);
            const calTz = formatTimeInTimezone(slotDate, calendarTimezone, selectedTimezone, settings.timeFormat);
            targetSlotLabel = `${selTz.time} | ${calTz.time}`;
          } else {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: displayTimezone || 'UTC',
              hour: 'numeric',
              minute: '2-digit',
              hour12: settings.timeFormat === '12h',
            });
            const timeStr = formatter.format(slotDate);
            targetSlotLabel = timeStr;
          }
        }

        logTaskDrag(
          taskTitle,
          targetSlotLabel,
          oldStartTime,
          newStartTime,
          duration,
          timezones
        );
      }

      onPlacementDrop(placementId, newStartTime);
    }
  };

  // Handle resize of placements to change duration
  const handleEventResize = (info: EventResizeDoneArg) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId && info.event.start && info.event.end) {
      // Calculate new duration in minutes
      const durationMs = info.event.end.getTime() - info.event.start.getTime();
      const durationMinutes = Math.round(durationMs / (60 * 1000));
      
      // Find the placement to get task title and old duration
      const placement = placements.find(p => p.id === placementId);
      const taskTitle = placement?.taskTitle || info.event.title || 'Unknown Task';
      const oldDuration = placement?.duration || durationMinutes;

      const timezones = createTimezoneContext(calendarTimezone, settings.timezone);
      logTaskResize(
        taskTitle,
        oldDuration,
        durationMinutes,
        timezones
      );

      onPlacementResize(placementId, durationMinutes);
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

      const startTime = info.event.start.toISOString();
      const duration = settings.defaultTaskDuration;

      if (containerRef.current) {
        const timezones = createTimezoneContext(calendarTimezone, settings.timezone);
        let targetSlotLabel = getSlotLabelForTime(
          info.event.start,
          containerRef.current,
          calendarRef.current?.getApi()
        );
        
        // If slot label not found, calculate it from the time using the same format as renderSlotLabel
        if (!targetSlotLabel) {
          const slotDate = info.event.start;
          if (hasDifferentTimezones && selectedTimezone && calendarTimezone) {
            const selTz = formatTimeInTimezone(slotDate, selectedTimezone, selectedTimezone, settings.timeFormat);
            const calTz = formatTimeInTimezone(slotDate, calendarTimezone, selectedTimezone, settings.timeFormat);
            targetSlotLabel = `${selTz.time} | ${calTz.time}`;
          } else {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: displayTimezone || 'UTC',
              hour: 'numeric',
              minute: '2-digit',
              hour12: settings.timeFormat === '12h',
            });
            const timeStr = formatter.format(slotDate);
            targetSlotLabel = timeStr;
          }
        }

        const [minHour, minMin] = settings.slotMinTime.split(':').map(Number);
        const [maxHour, maxMin] = settings.slotMaxTime.split(':').map(Number);
        const dropHour = info.event.start.getHours();
        const dropMinute = info.event.start.getMinutes();
        const dropMinutes = dropHour * 60 + dropMinute;
        const minMinutes = minHour * 60 + minMin;
        const maxMinutes = maxHour * 60 + maxMin;
        const isOutOfRange = dropMinutes < minMinutes || dropMinutes >= maxMinutes;

        logTaskPlacement(
          taskId,
          taskTitle,
          targetSlotLabel,
          startTime,
          duration,
          timezones,
          isOutOfRange,
          taskListTitle
        );
      }

      // Remove the temporary event that FullCalendar created
      info.event.remove();
      // Create our own placement through the callback
      onExternalDrop(taskId, taskTitle, startTime, taskListTitle);
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
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: displayTimezone || 'UTC',
        hour: 'numeric',
        minute: '2-digit',
        hour12: settings.timeFormat === '12h',
      });
      const timeStr = formatter.format(slotDate);
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
  }, [hasDifferentTimezones, calendarTimezone, selectedTimezone, settings.timeFormat, displayTimezone]);

  // Log calendar load when dates are set
  useEffect(() => {
    if (!containerRef.current || !calendarRef.current) return;

    const handleDatesSet = () => {
      // Use a longer timeout to ensure events are rendered
      setTimeout(() => {
        if (!containerRef.current || !calendarRef.current) return;

        const timezones = createTimezoneContext(calendarTimezone, settings.timezone);

        const [year, month, day] = date.split('-').map(Number);
        const [minHour, minMin] = settings.slotMinTime.split(':').map(Number);
        const [maxHour, maxMin] = settings.slotMaxTime.split(':').map(Number);

        const firstSlot = new Date(year, month - 1, day, minHour, minMin);
        const lastSlot = new Date(year, month - 1, day, maxHour, maxMin);

        const expectedRange = {
          start: settings.slotMinTime,
          end: settings.slotMaxTime,
        };

        const renderedRange = getRenderedTimeRange(containerRef.current);
        
        let renderedTimeRange;

        if (renderedRange) {
          renderedTimeRange = {
            firstRenderedLabel: renderedRange.firstLabel,
            lastRenderedLabel: renderedRange.lastLabel,
            firstRenderedTime: renderedRange.firstTime,
            lastRenderedTime: renderedRange.lastTime,
          };
        } else {
          // Could not detect rendered slots - calendar likely failed to render
          renderedTimeRange = {
            firstRenderedLabel: `${settings.slotMinTime} (expected, not detected)`,
            lastRenderedLabel: `${settings.slotMaxTime} (expected, not detected)`,
            firstRenderedTime: firstSlot,
            lastRenderedTime: lastSlot,
          };
        }

        // Get rendered events from FullCalendar API (ordered by rendered position)
        const calendarApi = calendarRef.current.getApi();
        const fullCalendarEvents = calendarApi.getEvents();
        
        // Filter to only Google Calendar events (not placements)
        const googleEvents = fullCalendarEvents.filter((fcEvent) => {
          const extendedProps = fcEvent.extendedProps;
          return extendedProps?.type === 'google-event' || (!extendedProps?.type && fcEvent.id?.startsWith('event-'));
        });
        
        // Sort by start time to match rendered order
        googleEvents.sort((a, b) => {
          const aStart = a.start ? a.start.getTime() : 0;
          const bStart = b.start ? b.start.getTime() : 0;
          return aStart - bStart;
        });
        
        const formattedRenderedEvents = googleEvents.map((fcEvent, displayIndex) => {
          // Extract original event ID from FullCalendar event ID (format: "event-{id}")
          const fcEventId = fcEvent.id;
          if (!fcEventId || !fcEventId.startsWith('event-')) {
            return null;
          }
          
          const originalEventId = fcEventId.replace('event-', '');
          const eventIndex = events.findIndex(e => e.id === originalEventId);
          
          if (eventIndex < 0 || !fcEvent.start || !fcEvent.end) {
            return null;
          }
          
          const event = events[eventIndex];
          
          if (!event.start.dateTime || !event.end.dateTime) {
            return null;
          }
          
          // Get time from DOM slot label where event is positioned
          let timeDisplay = '';
          
          if (containerRef.current) {
            const eventElement = containerRef.current.querySelector(`[data-event-id="${fcEventId}"], .fc-event[class*="${fcEventId}"]`) as HTMLElement;
            if (eventElement && fcEvent.start) {
              const slotLabel = getEventSlotLabel(eventElement, containerRef.current);
              if (slotLabel) {
                // Parse the slot label (may have dual timezone like "22:00 | 21:00")
                const times = slotLabel.split(' | ');
                if (times.length > 1 && timezones.userSelected !== timezones.calendar) {
                  const userTime = times[0].trim();
                  const calendarTime = times[1].trim();
                  
                  // Calculate day offset for calendar time
                  const startDate = new Date(fcEvent.start);
                  const userDateStr = new Intl.DateTimeFormat('en-CA', {
                    timeZone: timezones.userSelected,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(startDate);
                  const calendarDateStr = new Intl.DateTimeFormat('en-CA', {
                    timeZone: timezones.calendar,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(startDate);
                  
                  const userDate = new Date(`${userDateStr}T00:00:00`);
                  const calendarDate = new Date(`${calendarDateStr}T00:00:00`);
                  const dayOffset = Math.round((calendarDate.getTime() - userDate.getTime()) / (24 * 60 * 60 * 1000));
                  
                  if (dayOffset !== 0) {
                    const offsetStr = dayOffset > 0 ? `+${dayOffset}` : `${dayOffset}`;
                    timeDisplay = `${userTime} | ${calendarTime} (${offsetStr})`;
                  } else {
                    timeDisplay = `${userTime} | ${calendarTime}`;
                  }
                } else {
                  timeDisplay = times[0] || slotLabel;
                }
              }
            }
          }
          
          // Fallback: calculate time from event dates if DOM lookup fails
          if (!timeDisplay && fcEvent.start) {
            const startDate = new Date(fcEvent.start);
            const startTimeStr = startDate.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: timezones.userSelected,
            });
            
            if (timezones.userSelected !== timezones.calendar) {
              const calendarTimeStr = startDate.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: timezones.calendar,
              });
              
              // Calculate day offset
              const userDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezones.userSelected,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(startDate);
              const calendarDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezones.calendar,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(startDate);
              
              const userDate = new Date(`${userDateStr}T00:00:00`);
              const calendarDate = new Date(`${calendarDateStr}T00:00:00`);
              const dayOffset = Math.round((calendarDate.getTime() - userDate.getTime()) / (24 * 60 * 60 * 1000));
              
              if (dayOffset !== 0) {
                const offsetStr = dayOffset > 0 ? `+${dayOffset}` : `${dayOffset}`;
                timeDisplay = `${startTimeStr} | ${calendarTimeStr} (${offsetStr})`;
              } else {
                timeDisplay = `${startTimeStr} | ${calendarTimeStr}`;
              }
            } else {
              timeDisplay = startTimeStr;
            }
          }
          
          // Calculate duration in minutes
          const startDate = new Date(event.start.dateTime);
          const endDate = new Date(event.end.dateTime);
          const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / (60 * 1000));
          
          // Find original index in events array for numbering
          const originalIndex = eventIndex + 1;
          
          return {
            index: originalIndex,
            displayIndex: displayIndex + 1,
            time: timeDisplay || 'N/A',
            duration: durationMinutes,
            name: event.summary,
          };
        }).filter((e): e is { index: number; displayIndex: number; time: string; duration: number; name: string } => e !== null);

        logCalendarLoad(
          expectedRange,
          settings.workingHours,
          firstSlot,
          lastSlot,
          renderedTimeRange,
          timezones,
          formattedRenderedEvents
        );
      }, 500); // Increased timeout to allow events to render
    };

    const calendarApi = calendarRef.current.getApi();
    calendarApi.on('datesSet', handleDatesSet);

    handleDatesSet();

    return () => {
      calendarApi.off('datesSet', handleDatesSet);
    };
  }, [date, settings.slotMinTime, settings.slotMaxTime, settings.workingHours, calendarTimezone, settings.timezone, events]);

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
          timeZone={displayTimezone}
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
          eventResize={handleEventResize}
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
