'use client';

import { useState, useMemo } from 'react';
import { UserSettings, GoogleCalendar } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Plus, X, AlertTriangle } from 'lucide-react';

interface SettingsPanelProps {
  settings: UserSettings;
  calendars: GoogleCalendar[];
  onSave: (updates: Partial<UserSettings>) => Promise<void>;
  showLabel?: boolean;
}

// Convert HH:MM to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Format time based on 12h/24h preference
function formatTime(time: string, format: '12h' | '24h'): string {
  const [hours, minutes] = time.split(':').map(Number);
  if (format === '24h') {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function SettingsPanel({ settings, calendars, onSave, showLabel = false }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localSettings);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const updateWorkingHours = (index: number, field: 'start' | 'end', value: string) => {
    const newWorkingHours = [...localSettings.workingHours];
    newWorkingHours[index] = { ...newWorkingHours[index], [field]: value };

    // If changing start time, ensure end time is still valid (after start)
    if (field === 'start') {
      const startMinutes = timeToMinutes(value);
      const endMinutes = timeToMinutes(newWorkingHours[index].end);
      if (endMinutes <= startMinutes) {
        // Set end to 1 hour after start, or 23:45 if that would exceed midnight
        const newEndMinutes = Math.min(startMinutes + 60, 23 * 60 + 45);
        const newEndHours = Math.floor(newEndMinutes / 60);
        const newEndMins = newEndMinutes % 60;
        newWorkingHours[index].end = `${newEndHours.toString().padStart(2, '0')}:${newEndMins.toString().padStart(2, '0')}`;
      }
    }

    setLocalSettings({ ...localSettings, workingHours: newWorkingHours });
  };

  const addWorkingHoursRange = () => {
    setLocalSettings({
      ...localSettings,
      workingHours: [...localSettings.workingHours, { start: '09:00', end: '17:00' }],
    });
  };

  const removeWorkingHoursRange = (index: number) => {
    const newWorkingHours = localSettings.workingHours.filter((_, i) => i !== index);
    setLocalSettings({ ...localSettings, workingHours: newWorkingHours });
  };

  const colorOptions = [
    { value: '#4285f4', label: 'Blue (Default)' },
    { value: '#a4bdfc', label: 'Lavender' },
    { value: '#7ae7bf', label: 'Sage' },
    { value: '#dbadff', label: 'Grape' },
    { value: '#ff887c', label: 'Flamingo' },
    { value: '#fbd75b', label: 'Banana' },
    { value: '#ffb878', label: 'Tangerine' },
    { value: '#46d6db', label: 'Peacock' },
    { value: '#5484ed', label: 'Blueberry' },
    { value: '#51b749', label: 'Basil' },
    { value: '#dc2127', label: 'Tomato' },
  ];

  // Generate hour options for calendar range "from" dropdown
  const hourOptions = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const value = `${i.toString().padStart(2, '0')}:00`;
      return { value, label: formatTime(value, localSettings.timeFormat) };
    });
  }, [localSettings.timeFormat]);

  // Generate hour options for calendar range "to" dropdown (only hours after minTime + 1 hour)
  const hourOptionsAfterMin = useMemo(() => {
    const minMinutes = timeToMinutes(localSettings.slotMinTime);
    const minHourForMax = Math.floor(minMinutes / 60) + 1; // At least 1 hour after
    return Array.from({ length: 24 - minHourForMax }, (_, i) => {
      const hour = minHourForMax + i;
      const value = `${hour.toString().padStart(2, '0')}:00`;
      return { value, label: formatTime(value, localSettings.timeFormat) };
    });
  }, [localSettings.timeFormat, localSettings.slotMinTime]);

  // Generate 15-minute interval options for working hours
  const timeOptions = useMemo(() => {
    return Array.from({ length: 24 * 4 }, (_, i) => {
      const hours = Math.floor(i / 4);
      const minutes = (i % 4) * 15;
      const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      return { value, label: formatTime(value, localSettings.timeFormat) };
    });
  }, [localSettings.timeFormat]);

  // Get filtered "to" options for a specific working hours entry (only times after start)
  const getEndTimeOptions = (startTime: string) => {
    const startMinutes = timeToMinutes(startTime);
    return timeOptions.filter((option) => timeToMinutes(option.value) > startMinutes);
  };

  // Check if calendar range is valid (at least 1 hour)
  const calendarRangeValid = useMemo(() => {
    const minMinutes = timeToMinutes(localSettings.slotMinTime);
    const maxMinutes = timeToMinutes(localSettings.slotMaxTime);
    return maxMinutes - minMinutes >= 60;
  }, [localSettings.slotMinTime, localSettings.slotMaxTime]);

  // Check which working hours are outside calendar range
  const workingHoursWarnings = useMemo(() => {
    const calendarMin = timeToMinutes(localSettings.slotMinTime);
    const calendarMax = timeToMinutes(localSettings.slotMaxTime);

    return localSettings.workingHours.map((hours, index) => {
      const start = timeToMinutes(hours.start);
      const end = timeToMinutes(hours.end);

      if (start < calendarMin || end > calendarMax) {
        return `Range ${index + 1} (${formatTime(hours.start, localSettings.timeFormat)} - ${formatTime(hours.end, localSettings.timeFormat)}) is outside calendar view`;
      }
      return null;
    }).filter(Boolean);
  }, [localSettings.workingHours, localSettings.slotMinTime, localSettings.slotMaxTime, localSettings.timeFormat]);

  // Handle calendar range change with validation
  const handleSlotMinTimeChange = (value: string) => {
    const newMin = timeToMinutes(value);
    const currentMax = timeToMinutes(localSettings.slotMaxTime);

    // Ensure at least 1 hour gap
    if (currentMax - newMin < 60) {
      // Adjust max time to be 1 hour after new min
      const newMaxHour = Math.min(23, Math.floor(newMin / 60) + 1);
      setLocalSettings({
        ...localSettings,
        slotMinTime: value,
        slotMaxTime: `${newMaxHour.toString().padStart(2, '0')}:00`,
      });
    } else {
      setLocalSettings({ ...localSettings, slotMinTime: value });
    }
  };

  const handleSlotMaxTimeChange = (value: string) => {
    const currentMin = timeToMinutes(localSettings.slotMinTime);
    const newMax = timeToMinutes(value);

    // Ensure at least 1 hour gap
    if (newMax - currentMin < 60) {
      // Adjust min time to be 1 hour before new max
      const newMinHour = Math.max(0, Math.floor(newMax / 60) - 1);
      setLocalSettings({
        ...localSettings,
        slotMinTime: `${newMinHour.toString().padStart(2, '0')}:00`,
        slotMaxTime: value,
      });
    } else {
      setLocalSettings({ ...localSettings, slotMaxTime: value });
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={showLabel ? "ghost" : "outline"} size={showLabel ? "default" : "icon"} className={showLabel ? "justify-start w-full" : ""}>
          <Settings className="h-4 w-4" />
          {showLabel && <span className="ml-2">Settings</span>}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Configure your task scheduling preferences</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6 px-6">
          <div className="space-y-2">
            <Label>Default Task Duration: {localSettings.defaultTaskDuration} minutes</Label>
            <Slider
              value={[localSettings.defaultTaskDuration]}
              onValueChange={([value]) =>
                setLocalSettings({ ...localSettings, defaultTaskDuration: value })
              }
              min={15}
              max={120}
              step={15}
            />
          </div>

          <div className="space-y-2">
            <Label>Minimum Gap Between Tasks: {localSettings.minTimeBetweenTasks} minutes</Label>
            <Slider
              value={[localSettings.minTimeBetweenTasks]}
              onValueChange={([value]) =>
                setLocalSettings({ ...localSettings, minTimeBetweenTasks: value })
              }
              min={0}
              max={60}
              step={5}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeFormat">Time Format</Label>
            <Select
              value={localSettings.timeFormat}
              onValueChange={(value: '12h' | '24h') =>
                setLocalSettings({ ...localSettings, timeFormat: value })
              }
            >
              <SelectTrigger id="timeFormat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                <SelectItem value="24h">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="taskColor">Task Color</Label>
            <Select
              value={localSettings.taskColor}
              onValueChange={(value) => setLocalSettings({ ...localSettings, taskColor: value })}
            >
              <SelectTrigger id="taskColor">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: localSettings.taskColor }}
                    />
                    <span>
                      {colorOptions.find((c) => c.value === localSettings.taskColor)?.label ||
                        'Custom'}
                    </span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: color.value }}
                      />
                      <span>{color.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calendar">Calendar for Events</Label>
            <Select
              value={localSettings.selectedCalendarId}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, selectedCalendarId: value })
              }
            >
              <SelectTrigger id="calendar">
                <SelectValue placeholder="Select a calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={calendar.id}>
                    {calendar.summary} {calendar.primary && '(Primary)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Calendar Day Range</Label>
            <div className="flex items-center gap-2">
              <Select
                value={localSettings.slotMinTime || '06:00'}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, slotMinTime: value })
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>to</span>
              <Select
                value={localSettings.slotMaxTime || '22:00'}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, slotMaxTime: value })
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hourOptionsAfterMin.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Visible time range on the calendar (minimum 1 hour)
            </p>
            {workingHoursWarnings.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-600 mt-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Working hours outside calendar range:</p>
                  <ul className="list-disc list-inside">
                    {workingHoursWarnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Working Hours</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-fit tasks will only fill in working hours.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={addWorkingHoursRange}>
                <Plus className="h-4 w-4 mr-1" />
                Add Range
              </Button>
            </div>
            {localSettings.workingHours.map((hours, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={hours.start}
                  onValueChange={(value) => updateWorkingHours(index, 'start', value)}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>to</span>
                <Select
                  value={hours.end}
                  onValueChange={(value) => updateWorkingHours(index, 'end', value)}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getEndTimeOptions(hours.start).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {localSettings.workingHours.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeWorkingHoursRange(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="ignoreContainer"
              checked={localSettings.ignoreContainerTasks}
              onCheckedChange={(checked) =>
                setLocalSettings({ ...localSettings, ignoreContainerTasks: checked === true })
              }
            />
            <Label htmlFor="ignoreContainer" className="cursor-pointer">
              Ignore container tasks in auto-fit
            </Label>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
