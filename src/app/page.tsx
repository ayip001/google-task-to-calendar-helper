'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { format, isBefore, startOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar as CalendarIcon, LogOut, User } from 'lucide-react';
import { GoogleCalendarEvent } from '@/types';
import { useSettings } from '@/hooks/use-data';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [hoveredEvents, setHoveredEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch events when hovering over a date
  useEffect(() => {
    if (!hoveredDate || !settings.selectedCalendarId) {
      setHoveredEvents([]);
      return;
    }

    const fetchEvents = async () => {
      setLoadingEvents(true);
      try {
        const dateStr = format(hoveredDate, 'yyyy-MM-dd');
        const response = await fetch(
          `/api/calendar?date=${dateStr}&calendarId=${encodeURIComponent(settings.selectedCalendarId)}`
        );
        if (response.ok) {
          const data = await response.json();
          // Filter out events that were created by this utility (they have specific patterns)
          const filteredEvents = data.events.filter((event: GoogleCalendarEvent) => {
            // Keep only events that don't look like task placements
            // Task placements typically don't have descriptions or have specific patterns
            return !event.description?.includes('Created by Task to Calendar');
          });
          setHoveredEvents(filteredEvents);
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setLoadingEvents(false);
      }
    };

    const timeoutId = setTimeout(fetchEvents, 150); // Debounce
    return () => clearTimeout(timeoutId);
  }, [hoveredDate, settings.selectedCalendarId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      const formattedDate = format(date, 'yyyy-MM-dd');
      router.push(`/day/${formattedDate}`);
    }
  };

  const today = startOfDay(new Date());
  const isDateDisabled = (date: Date) => isBefore(date, today);

  // Get color for event (map Google's colorId to actual colors)
  const getEventColor = (colorId?: string) => {
    const colors: Record<string, string> = {
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
    return colors[colorId || ''] || '#4285f4';
  };

  const displayEvents = hoveredEvents.slice(0, 3);
  const hasMoreEvents = hoveredEvents.length > 3;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-semibold">Task to Calendar</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{session.user?.name || session.user?.email}</span>
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
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col items-center">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold">Select a Day</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Click on a day to view and schedule tasks
          </p>
        </div>

        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          disabled={isDateDisabled}
          onDayMouseEnter={(date) => setHoveredDate(date)}
          onDayMouseLeave={() => setHoveredDate(null)}
          className="rounded-lg border [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
        />

        {/* Event preview section */}
        <div className="mt-6 w-full max-w-sm min-h-[120px]">
          {hoveredDate && (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-center">
                {hoveredDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </div>

              {loadingEvents ? (
                <div className="text-sm text-muted-foreground text-center">Loading...</div>
              ) : displayEvents.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {displayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="bg-muted relative rounded-md p-2 pl-6 text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full"
                      style={{ '--event-color': getEventColor(event.colorId) } as React.CSSProperties}
                    >
                      <style>{`
                        [style*="--event-color"]::after {
                          background-color: var(--event-color);
                        }
                      `}</style>
                      <div className="font-medium truncate">{event.summary}</div>
                      <div className="text-muted-foreground text-xs">
                        {event.start.dateTime
                          ? format(new Date(event.start.dateTime), 'h:mm a')
                          : 'All day'}
                        {event.end.dateTime && (
                          <> – {format(new Date(event.end.dateTime), 'h:mm a')}</>
                        )}
                      </div>
                    </div>
                  ))}
                  {hasMoreEvents && (
                    <div className="text-xs text-muted-foreground text-center">
                      and {hoveredEvents.length - 3} more...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center">
                  No events scheduled
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
