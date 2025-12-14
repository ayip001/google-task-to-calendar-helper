import { UserSettings } from '@/types';

export const DEFAULT_TASK_DURATION = 30;
export const DEFAULT_TASK_COLOR = '#4285F4';
export const DEFAULT_MIN_TIME_BETWEEN_TASKS = 15;
export const TIME_SLOT_INTERVAL = 15;
export const PLACEMENT_TTL_SECONDS = 24 * 60 * 60;

export const DEFAULT_WORKING_HOURS = [
  { start: '11:00', end: '12:15' },
  { start: '13:00', end: '18:00' },
];

export const DEFAULT_SETTINGS: UserSettings = {
  defaultTaskDuration: DEFAULT_TASK_DURATION,
  taskColor: DEFAULT_TASK_COLOR,
  workingHours: DEFAULT_WORKING_HOURS,
  minTimeBetweenTasks: DEFAULT_MIN_TIME_BETWEEN_TASKS,
  ignoreContainerTasks: true,
  selectedCalendarId: 'primary',
  slotMinTime: '06:00',
  slotMaxTime: '22:00',
};

export const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  '1': '#a4bdfc',
  '2': '#7ae7bf',
  '3': '#dbadff',
  '4': '#ff887c',
  '5': '#fbd75b',
  '6': '#ffb878',
  '7': '#46d6db',
  '8': '#e1e1e1',
  '9': '#5484ed',
  '10': '#51b749',
  '11': '#dc2127',
};

export const KV_KEYS = {
  settings: (userId: string) => `settings:${userId}`,
  placements: (userId: string, date: string) => `temp:${userId}:${date}`,
};

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
];
