'use client';

import { useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventDropArg, EventInput, DateSelectArg } from '@fullcalendar/core';
import { GoogleCalendarEvent, TaskPlacement } from '@/types';
import { TIME_SLOT_INTERVAL } from '@/lib/constants';

interface DayCalendarProps {
  date: string;
  events: GoogleCalendarEvent[];
  placements: TaskPlacement[];
  onPlacementDrop: (placementId: string, newStartTime: string) => void;
  onExternalDrop: (taskId: string, taskTitle: string, startTime: string) => void;
  onPlacementClick: (placementId: string) => void;
  settings: {
    defaultTaskDuration: number;
    taskColor: string;
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
      backgroundColor: placement.color,
      borderColor: placement.color,
      editable: true,
      classNames: ['temp-placement'],
      extendedProps: {
        type: 'placement',
        placementId: placement.id,
      },
    })),
  ];

  const handleEventDrop = (info: EventDropArg) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId && info.event.start) {
      onPlacementDrop(placementId, info.event.start.toISOString());
    }
  };

  const handleEventClick = (info: { event: { extendedProps?: { type?: string; placementId?: string } } }) => {
    const placementId = info.event.extendedProps?.placementId;
    if (placementId) {
      onPlacementClick(placementId);
    }
  };

  const handleSelect = (info: DateSelectArg) => {
    const calendarApi = calendarRef.current?.getApi();
    if (calendarApi) {
      calendarApi.unselect();
    }
  };

  const handleDrop = (info: { date: Date; draggedEl: HTMLElement }) => {
    const taskId = info.draggedEl.dataset.taskId;
    const taskTitle = info.draggedEl.dataset.taskTitle;

    if (taskId && taskTitle) {
      onExternalDrop(taskId, taskTitle, info.date.toISOString());
    }
  };

  return (
    <div className="h-full">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="timeGridDay"
        initialDate={date}
        headerToolbar={false}
        allDaySlot={false}
        slotDuration={`00:${TIME_SLOT_INTERVAL}:00`}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        height="100%"
        events={calendarEvents}
        editable={true}
        selectable={true}
        selectMirror={true}
        droppable={true}
        eventDrop={handleEventDrop}
        eventClick={handleEventClick}
        select={handleSelect}
        drop={handleDrop}
        eventOverlap={false}
        slotEventOverlap={false}
        snapDuration={`00:${TIME_SLOT_INTERVAL}:00`}
        nowIndicator={true}
      />
    </div>
  );
}
