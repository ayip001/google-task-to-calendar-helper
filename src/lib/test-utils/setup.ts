import { expect, afterEach, vi } from 'vitest';

// Mock environment variables
process.env.NEXT_PUBLIC_DEBUG = 'true';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { email: 'test@example.com' },
      accessToken: 'mock-access-token',
    },
    status: 'authenticated',
  }),
  signOut: vi.fn(),
}));
