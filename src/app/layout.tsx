import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Google Task to Calendar Helper',
  description: 'Schedule your Google Tasks onto your Calendar with ease',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
