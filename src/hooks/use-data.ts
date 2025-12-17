'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GoogleTask,
  GoogleTaskList,
  GoogleCalendarEvent,
  GoogleCalendar,
  UserSettings,
  TaskPlacement,
  TaskFilter,
  AutoFitResult,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';

export function useTasks() {
  const [tasks, setTasks] = useState<GoogleTask[]>([]);
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [tasksRes, listsRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/tasks?type=lists'),
      ]);

      if (!tasksRes.ok || !listsRes.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const [tasksData, listsData] = await Promise.all([tasksRes.json(), listsRes.json()]);

      setTasks(tasksData);
      setTaskLists(listsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, taskLists, loading, error, refetch: fetchTasks };
}

export function useCalendarEvents(date: string, calendarId: string = 'primary') {
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!date) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/calendar?type=events&date=${date}&calendarId=${encodeURIComponent(calendarId)}`
      );

      if (!res.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      const data = await res.json();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [date, calendarId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}

export function useCalendars() {
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar?type=calendars');
      if (res.ok) {
        const data = await res.json();
        setCalendars(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  return { calendars, loading, refetch: fetchCalendars };
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      return data;
    }

    throw new Error('Failed to update settings');
  };

  return { settings, loading, updateSettings, refetch: fetchSettings };
}

export function usePlacements(date: string) {
  const [placements, setPlacements] = useState<TaskPlacement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlacements = useCallback(async () => {
    if (!date) return;

    try {
      const res = await fetch(`/api/placements?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setPlacements(data);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchPlacements();
  }, [fetchPlacements]);

  const addPlacement = async (placement: TaskPlacement) => {
    const res = await fetch('/api/placements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, placement }),
    });

    if (res.ok) {
      const data = await res.json();
      setPlacements(data);
      return data;
    }

    throw new Error('Failed to add placement');
  };

  const updatePlacement = async (placementId: string, updates: Partial<TaskPlacement>) => {
    const res = await fetch('/api/placements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, placementId, updates }),
    });

    if (res.ok) {
      const data = await res.json();
      setPlacements(data);
      return data;
    }

    throw new Error('Failed to update placement');
  };

  const removePlacement = async (placementId: string) => {
    const res = await fetch(`/api/placements?date=${date}&placementId=${placementId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      const data = await res.json();
      setPlacements(data);
      return data;
    }

    throw new Error('Failed to remove placement');
  };

  const clearPlacements = async () => {
    const res = await fetch(`/api/placements?date=${date}&clearAll=true`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setPlacements([]);
    }
  };

  const setBulkPlacements = async (newPlacements: TaskPlacement[]) => {
    const res = await fetch('/api/placements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, placements: newPlacements }),
    });

    if (res.ok) {
      setPlacements(newPlacements);
      return newPlacements;
    }

    throw new Error('Failed to set placements');
  };

  return {
    placements,
    loading,
    addPlacement,
    updatePlacement,
    removePlacement,
    clearPlacements,
    setBulkPlacements,
    refetch: fetchPlacements,
    setPlacements,
  };
}

export function useAutoFit() {
  const [loading, setLoading] = useState(false);

  const runAutoFit = async (
    date: string,
    tasks: GoogleTask[]
  ): Promise<AutoFitResult & { allPlacements: TaskPlacement[] }> => {
    setLoading(true);

    try {
      // Pass timezone offset in minutes (e.g., -480 for UTC+8)
      const timezoneOffset = new Date().getTimezoneOffset();

      const res = await fetch('/api/autofit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, tasks, timezoneOffset }),
      });

      if (!res.ok) {
        throw new Error('Failed to run auto-fit');
      }

      return await res.json();
    } finally {
      setLoading(false);
    }
  };

  return { runAutoFit, loading };
}

export function filterTasks(tasks: GoogleTask[], filter: TaskFilter): GoogleTask[] {
  return tasks.filter((task) => {
    if (filter.listId && task.listId !== filter.listId) {
      return false;
    }

    if (filter.hasDueDate !== undefined) {
      const hasDue = !!task.due;
      if (filter.hasDueDate !== hasDue) {
        return false;
      }
    }

    if (filter.hideContainerTasks && task.hasSubtasks) {
      return false;
    }

    if (filter.searchText) {
      const search = filter.searchText.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(search);
      const notesMatch = task.notes?.toLowerCase().includes(search) || false;
      if (!titleMatch && !notesMatch) {
        return false;
      }
    }

    return true;
  });
}
