import { headers } from 'next/headers';
import { getTestSession } from './test-auth';

export interface TestSessionContext {
  accessToken: string;
  userEmail: string;
}

export async function getTestSessionFromRequest(request?: Request): Promise<TestSessionContext | null> {
  let testToken: string | null = null;
  let testEmail: string | null = null;

  // Try to get from request headers first (if request is provided)
  if (request) {
    testToken = request.headers.get('x-test-access-token');
    testEmail = request.headers.get('x-test-user-email');
  }

  // If not found, try Next.js headers() (for server components/API routes)
  if (!testToken) {
    try {
      const headersList = await headers();
      testToken = headersList.get('x-test-access-token');
      testEmail = headersList.get('x-test-user-email');
    } catch {
      // headers() might not be available in all contexts
    }
  }

  if (testToken && testEmail) {
    return {
      accessToken: testToken,
      userEmail: testEmail,
    };
  }

  // Fallback: try to read from file (for direct API calls in tests)
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const session = await getTestSession();
    if (session) {
      return {
        accessToken: session.accessToken,
        userEmail: session.user.email || '',
      };
    }
  }

  return null;
}
