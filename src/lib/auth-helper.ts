import { auth } from './auth';
import { getTestSessionFromRequest } from './test-utils/test-session-helper';

export interface AuthSession {
  accessToken?: string;
  user?: {
    email?: string | null;
    name?: string | null;
  };
  error?: string;
}

export async function getAuthSession(request?: Request): Promise<AuthSession | null> {
  // First, check if we have a test session (for unit tests)
  const testSession = await getTestSessionFromRequest(request);
  if (testSession) {
    return {
      accessToken: testSession.accessToken,
      user: {
        email: testSession.userEmail,
      },
    };
  }

  // Otherwise, use the real NextAuth session
  try {
    const session = await auth();
    return session;
  } catch (error) {
    console.error('Error getting auth session:', error);
    return null;
  }
}
