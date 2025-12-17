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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  useTasks,
  useCalendarEvents,
  useCalendars,
  useSettings,
  usePlacements,
  useAutoFit,
  filterTasks,
} from '@/hooks/use-data';
import { TaskPlacement, TaskFilter, GoogleTask } from '@/types';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Wand2,
  Save,
  Trash2,
  Menu,
  CalendarDays,
  ListTodo,
} from 'lucide-react';

export default function DayPage() {
  const params = useParams();
  const dateParam = params.date as string;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [filter, setFilter] = useState<TaskFilter>({});
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'calendar' | 'tasks'>('calendar');

  const { tasks, taskLists, loading: tasksLoading } = useTasks();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { calendars, refetch: refetchCalendars } = useCalendars();
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

  // Handle adding a single task via + button (mobile)
  const handleAddTask = async (task: GoogleTask) => {
    try {
      // Try to auto-fit this single task
      const result = await runAutoFit(dateParam, [task]);

      if (result.placements.length > 0) {
        // Task was placed in working hours
        setPlacements(result.allPlacements);
        toast.success(`Added "${task.title}" to calendar`);
        setMobileView('calendar'); // Switch to calendar view to show result
      } else {
        // No working hours slot available, try to find any available slot
        // Calculate all busy times from events and existing placements
        const busySlots: { start: Date; end: Date }[] = [];

        // Add existing events as busy
        events.forEach((event) => {
          if (event.start.dateTime && event.end.dateTime) {
            busySlots.push({
              start: new Date(event.start.dateTime),
              end: new Date(event.end.dateTime),
            });
          }
        });

        // Add existing placements as busy
        placements.forEach((p) => {
          busySlots.push({
            start: new Date(p.startTime),
            end: new Date(new Date(p.startTime).getTime() + p.duration * 60 * 1000),
          });
        });

        // Sort busy slots by start time
        busySlots.sort((a, b) => a.start.getTime() - b.start.getTime());

        // Find first available slot in calendar range
        const slotMinTime = settings.slotMinTime || '06:00';
        const slotMaxTime = settings.slotMaxTime || '22:00';
        const [minH, minM] = slotMinTime.split(':').map(Number);
        const [maxH, maxM] = slotMaxTime.split(':').map(Number);

        const [year, month, day] = dateParam.split('-').map(Number);
        const calendarStart = new Date(year, month - 1, day, minH, minM);
        const calendarEnd = new Date(year, month - 1, day, maxH, maxM);
        const taskDuration = settings.defaultTaskDuration * 60 * 1000;

        let foundSlot: Date | null = null;
        let currentTime = new Date(Math.max(calendarStart.getTime(), Date.now()));

        // Round up to next 15-minute slot
        const minutes = currentTime.getMinutes();
        const remainder = minutes % 15;
        if (remainder > 0) {
          currentTime.setMinutes(minutes + (15 - remainder));
          currentTime.setSeconds(0);
          currentTime.setMilliseconds(0);
        }

        while (currentTime.getTime() + taskDuration <= calendarEnd.getTime()) {
          const slotEnd = new Date(currentTime.getTime() + taskDuration);

          // Check if this slot overlaps with any busy slot
          const hasConflict = busySlots.some((busy) => {
            return currentTime < busy.end && slotEnd > busy.start;
          });

          if (!hasConflict) {
            foundSlot = currentTime;
            break;
          }

          // Move to next 15-minute slot
          currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000);
        }

        if (foundSlot) {
          const newPlacement: TaskPlacement = {
            id: `${task.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            taskId: task.id,
            taskTitle: task.title,
            listTitle: task.listTitle,
            startTime: foundSlot.toISOString(),
            duration: settings.defaultTaskDuration,
          };

          await addPlacement(newPlacement);
          toast.success(`Added "${task.title}" to calendar`);
          setMobileView('calendar');
        } else {
          toast.error('No available time slots on this day');
        }
      }
    } catch {
      toast.error('Failed to add task');
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
        <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
          {/* Mobile: Back button and date */}
          <div className="flex items-center gap-2 md:gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="md:hidden">
              <Calendar className="h-5 w-5" />
            </Button>
            <Button variant="ghost" onClick={() => router.push('/')} className="gap-2 hidden md:flex">
              <Calendar className="h-5 w-5" />
              <span className="text-sm">Back to Calendar</span>
            </Button>

            <div className="flex items-center gap-1 md:gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateDay('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-sm md:text-lg font-semibold min-w-[120px] md:min-w-[180px] text-center">
                <span className="md:hidden">{format(parsedDate, 'MMM d')}</span>
                <span className="hidden md:inline">{format(parsedDate, 'EEEE, MMMM d, yyyy')}</span>
              </h1>
              <Button variant="ghost" size="icon" onClick={() => navigateDay('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Desktop: Action buttons */}
          <div className="hidden md:flex items-center gap-2">
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
              onRefetchCalendars={refetchCalendars}
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

          {/* Mobile: Burger menu */}
          <div className="flex md:hidden items-center gap-2">
            {placements.length > 0 && (
              <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
                <Save className="h-4 w-4 mr-1" />
                {placements.length}
              </Button>
            )}

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-4 px-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleAutoFit();
                      setMobileMenuOpen(false);
                    }}
                    disabled={autoFitLoading || filteredTasks.length === 0}
                    className="justify-start w-full"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-fit all tasks
                  </Button>

                  {placements.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        clearPlacements();
                        setMobileMenuOpen(false);
                      }}
                      className="justify-start w-full text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear placements
                    </Button>
                  )}

                  <div className="border-t my-2 -mx-4" />

                  <SettingsPanel
                    settings={settings}
                    calendars={calendars}
                    onSave={updateSettings}
                    showLabel={true}
                    onRefetchCalendars={refetchCalendars}
                  />

                  <Button
                    variant="ghost"
                    onClick={() => {
                      signOut();
                      setMobileMenuOpen(false);
                    }}
                    className="justify-start w-full"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Mobile: Tab switcher */}
      <div className="md:hidden border-b flex">
        <button
          onClick={() => setMobileView('calendar')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
            mobileView === 'calendar'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Calendar
        </button>
        <button
          onClick={() => setMobileView('tasks')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
            mobileView === 'tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          }`}
        >
          <ListTodo className="h-4 w-4" />
          Tasks
        </button>
      </div>

      {/* Desktop: Split view */}
      <main className="flex-1 hidden md:flex overflow-hidden">
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

      {/* Mobile: Tab content - same layout as desktop */}
      <main className="flex-1 md:hidden flex overflow-hidden">
        {mobileView === 'calendar' ? (
          <div className="flex-1 p-4 overflow-hidden">
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
        ) : (
          <div className="flex-1 overflow-hidden">
            <TaskPanel
              taskLists={taskLists}
              placements={placements}
              loading={tasksLoading}
              filter={filter}
              onFilterChange={setFilter}
              filteredTasks={filteredTasks}
              onAddTask={handleAddTask}
              isMobile={true}
            />
          </div>
        )}
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
