'use client';

import { useSession, signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function TestAuthPage() {
  const { data: session, status } = useSession();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Check if session is already saved (but always allow re-saving to refresh token)
    if (typeof window !== 'undefined') {
      const savedSession = localStorage.getItem('test-session');
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (parsed.accessToken && parsed.expiresAt && parsed.expiresAt > Date.now()) {
            setSaved(true);
          } else {
            // Token expired, allow re-saving
            setSaved(false);
          }
        } catch {
          // Invalid saved session, allow re-saving
          setSaved(false);
        }
      } else {
        setSaved(false);
      }
    }
  }, [session]);

  const handleSaveSession = async () => {
    if (!session?.accessToken) {
      toast.error('No active session to save');
      return;
    }

    setSaving(true);
    try {
      // Save session to localStorage for client-side access
      const sessionData = {
        accessToken: session.accessToken,
        user: session.user,
        expiresAt: Date.now() + 3600000, // Assume 1 hour expiry
      };
      localStorage.setItem('test-session', JSON.stringify(sessionData));

      // Also save to a file via API for server-side tests
      const response = await fetch('/api/test-auth/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: session.accessToken,
          user: session.user,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save session');
      }

      setSaved(true);
      toast.success('Session saved successfully! You can now run tests.');
    } catch (error) {
      toast.error('Failed to save session');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Test Authentication</CardTitle>
            <CardDescription>
              Sign in with Google to authenticate for unit tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => signIn('google')}
              className="w-full"
              size="lg"
            >
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Test Authentication</CardTitle>
          <CardDescription>
            Save your session for unit tests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {session?.accessToken ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="text-sm">
                {session?.accessToken ? 'Authenticated' : 'Not authenticated'}
              </span>
            </div>
            {session?.user?.email && (
              <p className="text-sm text-muted-foreground">
                Logged in as: {session.user.email}
              </p>
            )}
            {saved && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Session saved! You can now run tests.</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleSaveSession}
            disabled={!session?.accessToken || saving}
            className="w-full"
            size="lg"
            variant={saved ? "outline" : "default"}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Save className="mr-2 h-4 w-4" />
                Re-save Session (Refresh Token)
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Session for Tests
              </>
            )}
          </Button>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              The session will be saved to <code className="px-1 py-0.5 bg-muted rounded">.test-session.json</code> in your project root.
              This file is gitignored and will be used by unit tests.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
