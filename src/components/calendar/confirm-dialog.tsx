'use client';

import { TaskPlacement } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placements: TaskPlacement[];
  onConfirm: () => void;
  saving: boolean;
  taskColor: string;
  calendarTimezone?: string;
  timeFormat: '12h' | '24h';
}

// Format time in calendar timezone with user's preferred format
function formatTimeInCalendarTimezone(
  isoString: string,
  calendarTimezone: string | undefined,
  timeFormat: '12h' | '24h'
): string {
  const date = new Date(isoString);
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  };

  if (calendarTimezone) {
    options.timeZone = calendarTimezone;
  }

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function ConfirmDialog({
  open,
  onOpenChange,
  placements,
  onConfirm,
  saving,
  taskColor,
  calendarTimezone,
  timeFormat,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Calendar</DialogTitle>
          <DialogDescription>
            The following {placements.length} task(s) will be added to your Google Calendar:
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-60 mt-4">
          <ul className="space-y-3">
            {placements.map((placement) => (
              <li key={placement.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: taskColor }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{placement.taskTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeInCalendarTimezone(placement.startTime, calendarTimezone, timeFormat)} - {placement.duration} min
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving...' : 'Confirm & Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
