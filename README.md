# Google Task to Calendar Helper

**Turn your Google Tasks into scheduled calendar events in seconds.**

Stop manually copying tasks to your calendar. This web app lets you drag-and-drop tasks onto time slots or auto-fill your day around existing meetings.

---

## Features

**Drag & Drop Scheduling**
Drag tasks from your task lists directly onto 15-minute calendar slots.

**Smart Auto-Fit**
One click fills your available time with tasks, respecting your working hours and existing meetings.

**Month Overview with Event Dots**
See at a glance which days have events. Hover to preview what's scheduled.

**Customizable Working Hours**
Define multiple time blocks when you're available to work.

**Bulk Save to Calendar**
Preview your scheduled tasks, then save them all to Google Calendar at once.

---

## Screenshots

| Month View | Day View |
|------------|----------|
| *Calendar picker with event dots* | *Drag tasks onto time slots* |

---

## Getting Started

### 1. Create Google Cloud Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable **Google Calendar API** and **Google Tasks API**
4. Create OAuth 2.0 credentials (Web application)
5. Add redirect URI: `http://localhost:3000/api/auth/callback/google`

### 2. Set Up Environment

```bash
cp .env.example .env.local
```

Fill in your credentials:
```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
REDIS_URL=redis://default:token@endpoint.upstash.io:6379
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy

**Vercel (Recommended)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Import your GitHub repo
2. Add environment variables
3. Deploy

Don't forget to update your Google OAuth redirect URI for production.

---

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS + shadcn/ui
- FullCalendar
- Upstash Redis
- Google Calendar & Tasks APIs

---

## License

GPL-3.0
