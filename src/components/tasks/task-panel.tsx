'use client';

import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import { GoogleTask, GoogleTaskList, TaskFilter, TaskPlacement } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Calendar, GripVertical, Check } from 'lucide-react';
import { format } from 'date-fns';

interface TaskPanelProps {
  taskLists: GoogleTaskList[];
  placements: TaskPlacement[];
  loading: boolean;
  filter: TaskFilter;
  onFilterChange: Dispatch<SetStateAction<TaskFilter>>;
  filteredTasks: GoogleTask[];
}

export function TaskPanel({
  taskLists,
  placements,
  loading,
  filter,
  onFilterChange,
  filteredTasks,
}: TaskPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placedTaskIds = new Set(placements.map((p) => p.taskId));

  const setFilter = onFilterChange;

  // Initialize FullCalendar Draggable for external drag and drop
  useEffect(() => {
    if (containerRef.current) {
      const draggable = new Draggable(containerRef.current, {
        itemSelector: '[data-task-id]',
        eventData: (eventEl) => {
          return {
            title: eventEl.dataset.taskTitle || 'Task',
            duration: '00:30', // Default duration, actual duration set by settings on drop
          };
        },
      });

      return () => {
        draggable.destroy();
      };
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-9"
            value={filter.searchText || ''}
            onChange={(e) => setFilter({ ...filter, searchText: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="list-filter">List</Label>
            <Select
              value={filter.listId || 'all'}
              onValueChange={(value) => setFilter({ ...filter, listId: value === 'all' ? undefined : value })}
            >
              <SelectTrigger id="list-filter">
                <SelectValue placeholder="All lists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lists</SelectItem>
                {taskLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due-filter">Due date</Label>
            <Select
              value={filter.hasDueDate === undefined ? 'all' : filter.hasDueDate ? 'has' : 'none'}
              onValueChange={(value) =>
                setFilter({
                  ...filter,
                  hasDueDate: value === 'all' ? undefined : value === 'has',
                })
              }
            >
              <SelectTrigger id="due-filter">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="has">Has due date</SelectItem>
                <SelectItem value="none">No due date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="hideContainer"
            checked={filter.hideContainerTasks || false}
            onCheckedChange={(checked) =>
              setFilter({ ...filter, hideContainerTasks: checked ? true : undefined })
            }
          />
          <Label htmlFor="hideContainer" className="text-sm cursor-pointer">
            Hide containers
          </Label>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div ref={containerRef} className="p-4 space-y-2">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No tasks found</div>
          ) : (
            filteredTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isPlaced={placedTaskIds.has(task.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface TaskItemProps {
  task: GoogleTask;
  isPlaced: boolean;
}

function TaskItem({ task, isPlaced }: TaskItemProps) {
  return (
    <div
      data-task-id={task.id}
      data-task-title={task.title}
      data-task-list-title={task.listTitle}
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors fc-event"
    >
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{task.title}</span>
          {isPlaced && (
            <Badge variant="secondary" className="flex-shrink-0">
              <Check className="h-3 w-3 mr-1" />
              Placed
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{task.listTitle}</span>
          {task.due && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due), 'MMM d')}
              </span>
            </>
          )}
          {task.hasSubtasks && (
            <>
              <span>•</span>
              <span>Has subtasks</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
