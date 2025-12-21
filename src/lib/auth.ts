import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { GOOGLE_SCOPES } from './constants';
import { getTestSessionFromRequest } from './test-utils/test-session-helper';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

interface ExtendedToken {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
  [key: string]: unknown;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: `openid email profile ${GOOGLE_SCOPES.join(' ')}`,
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      const extToken = token as ExtendedToken;
      const expiresAt = extToken.expiresAt;
      if (typeof expiresAt === 'number' && Date.now() < expiresAt * 1000) {
        return token;
      }

      return refreshAccessToken(token as ExtendedToken);
    },
    async session({ session, token }) {
      const extToken = token as ExtendedToken;
      session.accessToken = extToken.accessToken as string | undefined;
      session.error = extToken.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

async function refreshAccessToken(token: ExtendedToken): Promise<ExtendedToken> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken!,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw tokens;
    }

    return {
      ...token,
      accessToken: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? token.refreshToken,
    };
  } catch {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}
