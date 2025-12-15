export { auth as proxy } from '@/lib/auth';

export const config = {
  matcher: [
    '/day/:path*',
    '/api/tasks/:path*',
    '/api/calendar/:path*',
    '/api/settings/:path*',
    '/api/placements/:path*',
    '/api/autofit/:path*',
  ],
};
