export interface WorkingHours {
  start: string;
  end: string;
}

export interface UserSettings {
  defaultTaskDuration: number;
  taskColor: string;
  workingHours: WorkingHours[];
  minTimeBetweenTasks: number;
  ignoreContainerTasks: boolean;
  selectedCalendarId: string;
}

export interface TaskPlacement {
  id: string;
  taskId: string;
  taskTitle: string;
  listTitle?: string;
  startTime: string;
  duration: number;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  parent?: string;
  position?: string;
  listId: string;
  listTitle: string;
  hasSubtasks?: boolean;
  isPlaced?: boolean;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  colorId?: string;
  isTemporary?: boolean;
  taskPlacementId?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface TaskFilter {
  listId?: string;
  hasDueDate?: boolean;
  searchText?: string;
  hideContainerTasks?: boolean;
}

export interface AutoFitResult {
  placements: TaskPlacement[];
  unplacedTasks: GoogleTask[];
  message: string;
}

export interface SaveResult {
  success: boolean;
  savedCount: number;
  errors: string[];
}
