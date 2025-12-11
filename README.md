# Google Task to Calendar Helper

A Next.js web dashboard that integrates with Google Calendar and Tasks APIs to help users schedule tasks onto their calendar. Drag tasks onto calendar slots or use the auto-fit algorithm to populate your calendar around existing meetings.

## Features

- **Google OAuth Authentication**: Secure login with Google Calendar and Tasks API scopes
- **Month View**: Navigate and select days from a calendar view
- **Day View**: Split-panel interface with calendar and task list
- **Drag & Drop**: Drag tasks from the task panel onto 15-minute time slots
- **Auto-fit Algorithm**: Automatically schedule tasks based on priority and available time
- **Settings**: Customize task duration, colors, working hours, and more
- **Save to Calendar**: Bulk save scheduled tasks as Google Calendar events

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Calendar**: FullCalendar
- **Authentication**: next-auth with Google OAuth
- **Database**: Vercel KV (Redis)
- **APIs**: Google Calendar API, Google Tasks API

## Setup

### Prerequisites

1. Node.js 18+
2. A Google Cloud Platform project with Calendar and Tasks APIs enabled
3. OAuth 2.0 credentials configured

### Environment Variables

Create a `.env.local` file based on `.env.example`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Vercel KV (Redis)
KV_URL=your-kv-url
KV_REST_API_URL=your-kv-rest-url
KV_REST_API_TOKEN=your-kv-token
KV_REST_API_READ_ONLY_TOKEN=your-kv-read-token
```

### Google Cloud Setup

1. Create a new project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Calendar API** and **Google Tasks API**
3. Configure the OAuth consent screen
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.vercel.app/api/auth/callback/google` (production)

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth route
│   │   ├── autofit/             # Auto-fit algorithm endpoint
│   │   ├── calendar/            # Calendar events CRUD
│   │   ├── placements/          # Temporary placements CRUD
│   │   ├── settings/            # User settings CRUD
│   │   └── tasks/               # Google Tasks API
│   ├── day/[date]/              # Day view page
│   ├── login/                   # Login page
│   └── page.tsx                 # Month view (home)
├── components/
│   ├── calendar/                # Calendar components
│   ├── settings/                # Settings panel
│   ├── tasks/                   # Task panel
│   └── ui/                      # shadcn/ui components
├── hooks/
│   └── use-data.ts              # Data fetching hooks
├── lib/
│   ├── google/                  # Google API clients
│   ├── kv/                      # Vercel KV operations
│   ├── auth.ts                  # NextAuth configuration
│   ├── autofit.ts               # Auto-fit algorithm
│   └── constants.ts             # App constants
└── types/
    └── index.ts                 # TypeScript types
```

## Data Models

### User Settings (stored in Vercel KV)
```json
{
  "defaultTaskDuration": 30,
  "taskColor": "#4285F4",
  "workingHours": [
    { "start": "11:00", "end": "12:15" },
    { "start": "13:00", "end": "18:00" }
  ],
  "minTimeBetweenTasks": 15,
  "ignoreContainerTasks": true,
  "selectedCalendarId": "primary"
}
```

### Temporary Placements (stored in Vercel KV with 24hr TTL)
```json
[
  {
    "id": "unique-id",
    "taskId": "google-task-id",
    "taskTitle": "Task name",
    "startTime": "2024-01-15T10:00:00Z",
    "duration": 30,
    "color": "#4285F4"
  }
]
```

## Deploy to Vercel

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add all environment variables
4. Deploy

## License

GPL-3.0 License - see LICENSE file for details
