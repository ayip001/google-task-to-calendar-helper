'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { toast } from 'sonner';

import { DayCalendar } from '@/components/calendar/day-calendar';
import { TaskPanel } from '@/components/tasks/task-panel';
import { SettingsPanel } from '@/components/settings/settings-panel';
import { ConfirmDialog } from '@/components/calendar/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useTasks,
  useCalendarEvents,
  useCalendars,
  useSettings,
  usePlacements,
  useAutoFit,
  filterTasks,
} from '@/hooks/use-data';
import { TaskPlacement, TaskFilter } from '@/types';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Wand2,
  Save,
  Trash2,
} from 'lucide-react';

export default function DayPage() {
  const params = useParams();
  const dateParam = params.date as string;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [filter, setFilter] = useState<TaskFilter>({});
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { tasks, taskLists, loading: tasksLoading } = useTasks();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { calendars } = useCalendars();
  const {
    events,
    refetch: refetchEvents,
  } = useCalendarEvents(dateParam, settings.selectedCalendarId);
  const {
    placements,
    addPlacement,
    updatePlacement,
    removePlacement,
    clearPlacements,
    setPlacements,
  } = usePlacements(dateParam);
  const { runAutoFit, loading: autoFitLoading } = useAutoFit();

  // Sync hideContainerTasks with settings
  useEffect(() => {
    setFilter((prev) => ({ ...prev, hideContainerTasks: settings.ignoreContainerTasks }));
  }, [settings.ignoreContainerTasks]);

  // Compute filtered tasks from filter state
  const filteredTasks = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const parsedDate = parseISO(dateParam);
  const isValidDate = isValid(parsedDate);

  if (!isValidDate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Date</h1>
          <Button onClick={() => router.push('/')}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (status === 'loading' || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(parsedDate);
    newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
    router.push(`/day/${format(newDate, 'yyyy-MM-dd')}`);
  };

  const handlePlacementDrop = async (placementId: string, newStartTime: string) => {
    try {
      await updatePlacement(placementId, { startTime: newStartTime });
    } catch {
      toast.error('Failed to update placement');
    }
  };

  const handleExternalDrop = async (taskId: string, taskTitle: string, startTime: string, listTitle?: string) => {
    try {
      const newPlacement: TaskPlacement = {
        id: `${taskId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId,
        taskTitle,
        listTitle,
        startTime,
        duration: settings.defaultTaskDuration,
      };

      await addPlacement(newPlacement);
      toast.success(`Added "${taskTitle}" to calendar`);
    } catch {
      toast.error('Failed to add placement');
    }
  };

  const handlePlacementClick = async (placementId: string) => {
    try {
      await removePlacement(placementId);
      toast.success('Placement removed');
    } catch {
      toast.error('Failed to remove placement');
    }
  };

  const handleAutoFit = async () => {
    if (filteredTasks.length === 0) {
      toast.error('No tasks to auto-fit. Apply filters first.');
      return;
    }

    try {
      const result = await runAutoFit(dateParam, filteredTasks);
      setPlacements(result.allPlacements);
      toast.success(result.message);
    } catch {
      toast.error('Failed to run auto-fit');
    }
  };

  const handleSaveToCalendar = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: settings.selectedCalendarId,
          placements,
          taskColor: settings.taskColor,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save events');
      }

      const result = await response.json();

      await clearPlacements();
      await refetchEvents();

      setConfirmDialogOpen(false);
      toast.success(`Successfully saved ${result.savedCount} event(s) to calendar`);

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} event(s) failed to save`);
      }
    } catch {
      toast.error('Failed to save events to calendar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/')} className="gap-2">
              <Calendar className="h-5 w-5" />
              <span className="text-sm">Back to Calendar</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateDay('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-semibold min-w-[180px] text-center">
                {format(parsedDate, 'EEEE, MMMM d, yyyy')}
              </h1>
              <Button variant="ghost" size="icon" onClick={() => navigateDay('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleAutoFit}
              disabled={autoFitLoading || filteredTasks.length === 0}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Auto-fit
            </Button>

            {placements.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => clearPlacements()}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>

                <Button onClick={() => setConfirmDialogOpen(true)}>
                  <Save className="h-4 w-4 mr-2" />
                  Save ({placements.length})
                </Button>
              </>
            )}

            <SettingsPanel
              settings={settings}
              calendars={calendars}
              onSave={updateSettings}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 border-r p-4 overflow-hidden">
          <DayCalendar
            date={dateParam}
            events={events}
            placements={placements}
            onPlacementDrop={handlePlacementDrop}
            onExternalDrop={handleExternalDrop}
            onPlacementClick={handlePlacementClick}
            onPastTimeDrop={() => toast.error('Cannot place tasks in the past')}
            settings={settings}
          />
        </div>

        <div className="w-96 flex-shrink-0 overflow-hidden">
          <TaskPanel
            taskLists={taskLists}
            placements={placements}
            loading={tasksLoading}
            filter={filter}
            onFilterChange={setFilter}
            filteredTasks={filteredTasks}
          />
        </div>
      </main>

      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        placements={placements}
        onConfirm={handleSaveToCalendar}
        saving={saving}
        taskColor={settings.taskColor}
      />
    </div>
  );
}
