'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { getAllTimezones, getTimezone, Timezone } from 'countries-and-timezones';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TimezoneOption {
  value: string; // IANA string e.g., "America/New_York"
  label: string; // Display label e.g., "(GMT -05:00) New York"
  offset: number; // For sorting
}

// Get the current UTC offset for a timezone (accounts for DST)
function getCurrentOffset(tzName: string): { offset: number; offsetStr: string } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');

    if (offsetPart) {
      const match = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2], 10);
        const minutes = parseInt(match[3] || '0', 10);
        const totalMinutes = sign * (hours * 60 + minutes);
        const offsetStr = `${sign >= 0 ? '+' : '-'}${String(Math.abs(hours)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        return { offset: totalMinutes, offsetStr };
      }
    }
  } catch {
    // Fall back to library data
  }

  // Fallback to library's UTC offset
  const tz = getTimezone(tzName);
  if (tz) {
    return { offset: tz.utcOffset, offsetStr: tz.utcOffsetStr };
  }
  return { offset: 0, offsetStr: '+00:00' };
}

// Format city name from IANA string
function formatCityName(tzName: string): string {
  const parts = tzName.split('/');
  const city = parts[parts.length - 1];
  return city.replace(/_/g, ' ');
}

// Build timezone options list
function getTimezoneOptions(): TimezoneOption[] {
  const allTimezones = getAllTimezones();
  const options: TimezoneOption[] = [];

  for (const [name, tz] of Object.entries(allTimezones) as [string, Timezone][]) {
    // Skip aliases
    if (tz.aliasOf) continue;

    // Only include timezones with continent/city format
    if (!name.includes('/')) continue;

    // Skip subcities (e.g., America/Indiana/Indianapolis)
    const parts = name.split('/');
    if (parts.length > 2) continue;

    // Skip some non-city zones
    if (name.startsWith('Etc/')) continue;

    const { offset, offsetStr } = getCurrentOffset(name);
    const cityName = formatCityName(name);

    options.push({
      value: name,
      label: `(GMT ${offsetStr}) ${cityName}`,
      offset,
    });
  }

  // Sort by offset, then alphabetically by city name
  options.sort((a, b) => {
    if (a.offset !== b.offset) return a.offset - b.offset;
    return a.label.localeCompare(b.label);
  });

  return options;
}

interface TimezonePickerProps {
  value?: string;
  onChange: (timezone: string) => void;
  className?: string;
}

export function TimezonePicker({ value, onChange, className }: TimezonePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [hasInteracted, setHasInteracted] = React.useState(false);

  // Memoize options since they're computed from library data
  const options = React.useMemo(() => getTimezoneOptions(), []);

  // Get browser's timezone
  const browserTimezone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  }, []);

  // Auto-set to browser timezone when user focuses on combobox (if no value saved)
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !hasInteracted && !value) {
      setHasInteracted(true);
      // Auto-set to browser timezone on first focus if no value
      if (browserTimezone && options.some((o) => o.value === browserTimezone)) {
        onChange(browserTimezone);
      }
    }
  };

  const selectedOption = options.find((o) => o.value === value);
  const displayValue = selectedOption?.label || 'Select timezone...';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 overflow-hidden" align="start">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
