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

## How to Use

1. Sign in with your Google account
2. Select a day from the calendar
3. Drag tasks onto time slots, or click **Auto-fit** to fill your schedule
4. Click **Save** to add them to your Google Calendar

---

## Screenshots

| Month View | Day View |
|------------|----------|
| *Calendar picker with event dots* | *Drag tasks onto time slots* |

---

## Self-Hosting

<details>
<summary>Developer setup instructions</summary>

### Prerequisites

- Node.js 18+
- Google Cloud project with Calendar and Tasks APIs enabled
- Upstash Redis database

### Environment Variables

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
REDIS_URL=redis://default:token@endpoint.upstash.io:6379
```

### Run Locally

```bash
npm install
npm run dev
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

</details>

---

## License

GPL-3.0
