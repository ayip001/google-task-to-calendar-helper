import { google } from 'googleapis';
import { GoogleTask, GoogleTaskList } from '@/types';

export function createTasksClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.tasks({ version: 'v1', auth });
}

export async function getTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const tasks = createTasksClient(accessToken);
  const response = await tasks.tasklists.list();

  return (response.data.items || []).map((item) => ({
    id: item.id!,
    title: item.title!,
  }));
}

export async function getAllTasks(accessToken: string): Promise<GoogleTask[]> {
  const taskLists = await getTaskLists(accessToken);
  const allTasks: GoogleTask[] = [];

  for (const list of taskLists) {
    const listTasks = await getTasksFromList(accessToken, list.id, list.title);
    allTasks.push(...listTasks);
  }

  return _markContainerTasks(allTasks);
}

export async function getTasksFromList(
  accessToken: string,
  listId: string,
  listTitle: string
): Promise<GoogleTask[]> {
  const tasks = createTasksClient(accessToken);

  const response = await tasks.tasks.list({
    tasklist: listId,
    showCompleted: false,
    showHidden: false,
    maxResults: 100,
  });

  return (response.data.items || []).map((item) => ({
    id: item.id!,
    title: item.title || 'Untitled Task',
    notes: item.notes || undefined,
    status: item.status as 'needsAction' | 'completed',
    due: item.due || undefined,
    parent: item.parent || undefined,
    position: item.position || undefined,
    starred: item.title?.startsWith('⭐') || false,
    listId,
    listTitle,
  }));
}

function _markContainerTasks(tasks: GoogleTask[]): GoogleTask[] {
  const parentIds = new Set(tasks.filter((t) => t.parent).map((t) => t.parent!));

  return tasks.map((task) => ({
    ...task,
    hasSubtasks: parentIds.has(task.id),
  }));
}
