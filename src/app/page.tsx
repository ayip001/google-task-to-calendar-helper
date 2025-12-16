'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { format, isBefore, startOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User } from 'lucide-react';
import Image from 'next/image';
import { GoogleCalendarEvent } from '@/types';
import { useSettings } from '@/hooks/use-data';
import { isUtilityCreatedEvent } from '@/lib/constants';

// Cache key for localStorage
const getMonthCacheKey = (calendarId: string, year: number, month: number) =>
  `events-cache:${calendarId}:${year}:${month}`;

// Cache structure stored in localStorage
interface MonthEventsCache {
  events: GoogleCalendarEvent[];
  fetchedAt: number;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date());
  const [monthEvents, setMonthEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const { settings } = useSettings();
  const fetchingRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch events for the displayed month
  const fetchMonthEvents = useCallback(async (year: number, month: number) => {
    if (!settings.selectedCalendarId) return;

    const cacheKey = getMonthCacheKey(settings.selectedCalendarId, year, month);

    // Prevent duplicate fetches
    if (fetchingRef.current === cacheKey) return;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsedCache: MonthEventsCache = JSON.parse(cached);
        // Use cache if less than 5 minutes old
        if (Date.now() - parsedCache.fetchedAt < 5 * 60 * 1000) {
          setMonthEvents(parsedCache.events);
          return;
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    fetchingRef.current = cacheKey;
    setLoadingMonth(true);

    try {
      const response = await fetch(
        `/api/calendar?type=events&year=${year}&month=${month}&calendarId=${encodeURIComponent(settings.selectedCalendarId)}`
      );
      if (response.ok) {
        const data = await response.json();
        // Filter out events created by this utility using invisible marker
        const filteredEvents = (data.events as GoogleCalendarEvent[]).filter(
          (event) => !isUtilityCreatedEvent(event.summary)
        );
        setMonthEvents(filteredEvents);

        // Cache in localStorage
        try {
          const cacheData: MonthEventsCache = {
            events: filteredEvents,
            fetchedAt: Date.now(),
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch {
          // Ignore localStorage errors (quota exceeded, etc.)
        }
      }
    } catch (error) {
      console.error('Failed to fetch month events:', error);
    } finally {
      setLoadingMonth(false);
      fetchingRef.current = null;
    }
  }, [settings.selectedCalendarId]);

  // Fetch events when month changes or on initial load
  useEffect(() => {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    fetchMonthEvents(year, month);
  }, [displayedMonth, fetchMonthEvents]);

  // Get events for the hovered date from cached month events
  const getEventsForDate = useCallback((date: Date): GoogleCalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return monthEvents.filter((event) => {
      const eventDate = event.start.dateTime
        ? format(new Date(event.start.dateTime), 'yyyy-MM-dd')
        : event.start.date;
      return eventDate === dateStr;
    });
  }, [monthEvents]);

  const hoveredEvents = hoveredDate ? getEventsForDate(hoveredDate) : [];

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
            <Image 
              src="/tasks2cal logo.svg" 
              alt="Tasks2Cal Logo" 
              width={48} 
              height={24}
              className="h-6 w-12"
            />
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
          month={displayedMonth}
          onMonthChange={setDisplayedMonth}
          onSelect={handleDateSelect}
          disabled={isDateDisabled}
          onDayMouseEnter={(date) => setHoveredDate(date)}
          onDayMouseLeave={() => setHoveredDate(null)}
          getDayEvents={getEventsForDate}
          className="rounded-lg border [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
        />

        {/* Event preview section */}
        <div className="mt-6 w-full max-w-sm min-h-[120px]">
          {loadingMonth && !monthEvents.length ? (
            <div className="text-sm text-muted-foreground text-center">Loading events...</div>
          ) : hoveredDate ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-center">
                {hoveredDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </div>

              {displayEvents.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {displayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="bg-muted relative rounded-md p-2 pl-6 text-sm"
                    >
                      <div
                        className="absolute inset-y-2 left-2 w-1 rounded-full"
                        style={{ backgroundColor: getEventColor(event.colorId) }}
                      />
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
          ) : null}
        </div>
      </main>
    </div>
  );
}
