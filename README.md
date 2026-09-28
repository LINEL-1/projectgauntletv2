# Project Gauntlet

A self-contained Next.js 14 App Router frontend for Project Gauntlet, a weekly, five-agent CrewAI investment committee managing a simulated CAD portfolio.

## Setup

1. Install dependencies with `npm install`.
2. Add a valid CrewAI API key to `.env.local`:

```env
CREWAI_API_KEY=...
CREWAI_BASE_URL=https://app.crewai.com/api/v1
CREWAI_FLOW_ID=037d05be-3d8e-4a76-a91c-6a-8d8e2f69
```

3. Run `npm run dev` and open `http://localhost:3000`.

The API key stays server-side. The browser talks to the same-origin `/api/flow/state`, `/api/flow/kickoff`, and `/api/flow/runs/[runId]` proxy routes. A first-time flow with no session history opens the setup screen; later runs open the weekly check-in room.

## Production

Run `npm run build` to validate the Vercel deployment build. Add the three environment variables to the Vercel project settings before deploying.
