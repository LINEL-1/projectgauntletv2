# Investment Committee Simulator

A self-contained Next.js 14 frontend for a weekly AI investment committee managing a simulated CAD portfolio through a CrewAI Studio flow.

## Features

- Dark-first responsive dashboard with portfolio value, cash, P&L, target progress, positions, mandate, and history.
- First-run setup that initializes dates, capital, mandate, and check-in weekdays.
- Weekly human check-in with optional investor context and per-session mandate override.
- Live five-agent deliberation timeline, polling every five seconds with typewriter output animation.
- CIO trade instruction parsing for BUY, SELL, HOLD, Initiate, and Reduce language.
- Committee Secretary minutes, session history slide-over, theme toggle, failure banner, and retry-friendly flow.
- Server-side API proxy keeps the CrewAI API key out of the browser. No database or authentication layer is used.

## Local setup

1. Install Node.js 18.17+.
2. Copy `.env.example` to `.env.local`.
3. Set the CrewAI credentials:

```env
CREWAI_API_KEY=...
CREWAI_BASE_URL=https://app.crewai.com/api/v1
CREWAI_FLOW_ID=037d05be-3d8e-4a76-a91c-6a-8d8e2f69
```

4. Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## CrewAI API contract

The browser calls the local routes `/api/state`, `/api/kickoff`, and `/api/run/:runId`. Those routes proxy to the configured CrewAI flow with a bearer token. State is read from `GET /flows/:flowId/state`; kickoff uses `POST /flows/:flowId/kickoff`; and run polling uses `GET /flows/:flowId/runs/:runId`.

The UI expects the output keys `analyst_data_intake`, `research_lead_update`, `risk_officer_review`, `pm_proposal`, `cio_committee_debate`, and `record_minutes_and_ledger`. Each output may be a string or an object containing `.raw`.

## Vercel

Import the repository as a Next.js project. Add the three environment variables in the Vercel project settings; no other configuration is required. The standard build command is `npm run build`.

## Notes

Portfolio figures are rendered from the flow state. Position value uses shares multiplied by the provided current price, while CAD formatting is applied consistently for display. The app intentionally does not include authentication, persistence, benchmark charts, export, or retrospective mode.
