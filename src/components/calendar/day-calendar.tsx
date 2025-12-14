'use client';

import { useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventInput, EventContentArg } from '@fullcalendar/core';
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
  settings: {
    defaultTaskDuration: number;
    taskColor: string;
    workingHours: WorkingHours[];
    slotMinTime: string;
    slotMaxTime: string;
  };
}

export function DayCalendar({
  date,
  events,
  placements,
  onPlacementDrop,
  onExternalDrop,
  onPlacementClick,
  settings,
}: DayCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);

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

  return (
    <div
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
      />
    </div>
  );
}
