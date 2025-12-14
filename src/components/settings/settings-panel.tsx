'use client';

import { useState } from 'react';
import { UserSettings, GoogleCalendar, WorkingHours } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Settings, Plus, X } from 'lucide-react';
import { GOOGLE_CALENDAR_COLORS } from '@/lib/constants';

interface SettingsPanelProps {
  settings: UserSettings;
  calendars: GoogleCalendar[];
  onSave: (updates: Partial<UserSettings>) => Promise<void>;
}

export function SettingsPanel({ settings, calendars, onSave }: SettingsPanelProps) {
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

  // Generate hour options for time range dropdowns
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`;
    return { value: `${hour}:00`, label };
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
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
                value={localSettings.slotMinTime}
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
                value={localSettings.slotMaxTime}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, slotMaxTime: value })
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
            </div>
            <p className="text-xs text-muted-foreground">
              Visible time range on the calendar
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Working Hours</Label>
              <Button variant="ghost" size="sm" onClick={addWorkingHoursRange}>
                <Plus className="h-4 w-4 mr-1" />
                Add Range
              </Button>
            </div>
            {localSettings.workingHours.map((hours, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="time"
                  value={hours.start}
                  onChange={(e) => updateWorkingHours(index, 'start', e.target.value)}
                  className="w-auto"
                />
                <span>to</span>
                <Input
                  type="time"
                  value={hours.end}
                  onChange={(e) => updateWorkingHours(index, 'end', e.target.value)}
                  className="w-auto"
                />
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
