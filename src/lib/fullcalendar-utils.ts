import type { CalendarApi } from '@fullcalendar/core';

export interface RenderedSlot {
  label: string;
  time: Date;
  element: HTMLElement;
}

export interface RenderedTimeRange {
  firstLabel: string;
  lastLabel: string;
  firstTime: Date;
  lastTime: Date;
}

function parseSlotLabelText(element: HTMLElement): string {
  const text = element.textContent || '';
  const trimmed = text.trim();
  
  // If the label contains multiple times (dual timezone display), separate them with |
  // Look for patterns like "14:0013:00" or "14:00\n13:00" or "14:00 13:00"
  const timePattern = /\d{1,2}:\d{2}/g;
  const times = trimmed.match(timePattern);
  
  if (times && times.length > 1) {
    return times.join(' | ');
  }
  
  return trimmed;
}

function extractTimeFromSlotElement(element: HTMLElement): Date | null {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const timeMatch = ariaLabel.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const isPM = timeMatch[3]?.toUpperCase() === 'PM';
      let hour24 = hours;
      if (isPM && hours !== 12) hour24 = hours + 12;
      if (!isPM && hours === 12) hour24 = 0;

      const today = new Date();
      const slotDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hour24,
        minutes
      );
      return slotDate;
    }
  }

  const dataTime = element.getAttribute('data-time');
  if (dataTime) {
    const date = new Date(dataTime);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function getAllRenderedSlotLabels(
  containerElement: HTMLElement
): RenderedSlot[] {
  const slots: RenderedSlot[] = [];

  // Find the timegrid body first, then search within it
  const timegridBody = containerElement.querySelector('.fc-timegrid-body');
  const timegridCols = containerElement.querySelectorAll('.fc-timegrid-col');
  const searchRoot = timegridBody || containerElement;

  // Try multiple selectors to find slot labels
  // FullCalendar v6 uses different structure - check thead for labels
  const thead = containerElement.querySelector('thead');
  const selectors = [
    'thead .fc-timegrid-slot-label',
    'thead td.fc-timegrid-slot-label',
    '.fc-timegrid-slot-label',
    '.fc-timegrid-slot-label .fc-timegrid-slot-label-cushion',
    'td.fc-timegrid-slot-label',
    '.fc-timegrid-slot-lane',
    '.fc-timegrid-col .fc-timegrid-slot-label',
  ];

  let slotLabelElements: NodeListOf<Element> | null = null;
  for (const selector of selectors) {
    slotLabelElements = searchRoot.querySelectorAll(selector);
    if (slotLabelElements.length > 0) {
      break;
    }
  }

  if (!slotLabelElements || slotLabelElements.length === 0) {
    return slots;
  }

  slotLabelElements.forEach((element, index) => {
    const htmlElement = element as HTMLElement;
    const label = parseSlotLabelText(htmlElement);
    
    // Try to extract time from various sources
    let time = extractTimeFromSlotElement(htmlElement);
    
    // If we couldn't extract time, try to parse from label text
    if (!time && label) {
      const timeMatch = label.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const today = new Date();
        time = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          hours,
          minutes
        );
      }
    }

    // If still no time, use index-based estimation (fallback)
    if (!time) {
      const today = new Date();
      // Estimate based on index (assuming 15-minute intervals starting from 00:00)
      const estimatedMinutes = index * 15;
      time = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        Math.floor(estimatedMinutes / 60),
        estimatedMinutes % 60
      );
    }

    if (label && time) {
      slots.push({
        label,
        time,
        element: htmlElement,
      });
    }
  });

  return slots.sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function getRenderedTimeRange(
  containerElement: HTMLElement
): RenderedTimeRange | null {
  const slots = getAllRenderedSlotLabels(containerElement);

  if (slots.length === 0) {
    return null;
  }

  const first = slots[0];
  const last = slots[slots.length - 1];

  return {
    firstLabel: first.label,
    lastLabel: last.label,
    firstTime: first.time,
    lastTime: last.time,
  };
}

export function getSlotLabelForTime(
  targetDate: Date,
  containerElement: HTMLElement,
  calendarApi?: CalendarApi
): string | null {
  const slots = getAllRenderedSlotLabels(containerElement);

  if (slots.length === 0) {
    return null;
  }

  const targetTime = targetDate.getTime();
  const targetHour = targetDate.getHours();
  const targetMinute = targetDate.getMinutes();

  // First, try exact match
  for (const slot of slots) {
    const slotHour = slot.time.getHours();
    const slotMinute = slot.time.getMinutes();

    if (slotHour === targetHour && slotMinute === targetMinute) {
      return slot.label;
    }
  }

  // If no exact match, the slot that should contain this time starts at the target time
  // (since tasks snap to 15-minute intervals, a task at 21:15 is in the slot starting at 21:15)
  // Try to find a slot that matches the target time exactly (it should exist since tasks snap to slots)
  // If not found, return null and let the caller calculate it
  return null;
}

export function getRenderedSlotForTime(
  targetDate: Date,
  containerElement: HTMLElement
): HTMLElement | null {
  const slots = getAllRenderedSlotLabels(containerElement);

  const targetHour = targetDate.getHours();
  const targetMinute = targetDate.getMinutes();

  for (const slot of slots) {
    const slotHour = slot.time.getHours();
    const slotMinute = slot.time.getMinutes();

    if (slotHour === targetHour && slotMinute === targetMinute) {
      return slot.element;
    }
  }

  return null;
}


export function getEventSlotLabel(
  eventElement: HTMLElement,
  containerElement: HTMLElement
): string | null {
  const eventRect = eventElement.getBoundingClientRect();
  const eventTop = eventRect.top + eventRect.height / 2;

  const slotElements = containerElement.querySelectorAll(
    '.fc-timegrid-slot-label, .fc-timegrid-slot-lane'
  );

  for (const slotElement of slotElements) {
    const slotRect = slotElement.getBoundingClientRect();
    if (
      eventTop >= slotRect.top &&
      eventTop <= slotRect.bottom
    ) {
      return parseSlotLabelText(slotElement as HTMLElement);
    }
  }

  return null;
}

