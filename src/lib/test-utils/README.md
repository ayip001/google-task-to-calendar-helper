# Test Authentication Setup

This directory contains utilities for running unit tests that require Google API authentication.

## Setup

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Visit the test authentication page:**
   Open `http://localhost:3000/test-auth` in your browser

3. **Sign in with Google:**
   - Click "Sign in with Google"
   - Complete the OAuth flow
   - Once authenticated, click "Save Session for Tests"
   - The session will be saved to `.test-session.json` in your project root

4. **Run tests:**
   ```bash
   npm test
   ```

## How It Works

- The test authentication page (`/test-auth`) allows you to authenticate with Google and save your session
- The session is saved to `.test-session.json` (which is gitignored)
- Test helpers automatically read this file and use the saved access token
- API routes check for test tokens in request headers and use them instead of NextAuth sessions when present

## Session Persistence

The saved session persists until:
- You manually delete `.test-session.json`
- The access token expires (typically after 1 hour)
- You save a new session

If your session expires, simply visit `/test-auth` again and save a new session.

## Security Note

The `.test-session.json` file contains your Google access token. It is:
- Gitignored (not committed to version control)
- Only used in test environments
- Should be kept secure on your local machine
