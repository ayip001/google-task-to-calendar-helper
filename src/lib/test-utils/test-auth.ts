import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface TestSession {
  accessToken: string;
  user: {
    email?: string | null;
    name?: string | null;
  };
  savedAt: string;
}

const SESSION_FILE = '.test-session.json';

export async function getTestSession(): Promise<TestSession | null> {
  try {
    const projectRoot = process.cwd();
    const filePath = join(projectRoot, SESSION_FILE);

    if (!existsSync(filePath)) {
      console.warn(`\n⚠️  Test session file not found at ${filePath}`);
      console.warn('Please visit http://localhost:3000/test-auth to authenticate and save your session\n');
      return null;
    }

    const content = await readFile(filePath, 'utf-8');
    const session = JSON.parse(content) as TestSession;

    if (!session.accessToken) {
      console.warn('Test session file exists but has no access token');
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error reading test session:', error);
    return null;
  }
}

export function createAuthenticatedFetch(session: TestSession): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    
    // Add test token header that API routes can check
    headers.set('x-test-access-token', session.accessToken);
    headers.set('x-test-user-email', session.user.email || '');
    
    return fetch(input, {
      ...init,
      headers,
    });
  };
}
