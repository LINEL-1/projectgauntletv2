# Project Gauntlet

A self-contained Next.js 14 App Router frontend for Project Gauntlet, a weekly, five-agent CrewAI investment committee managing a simulated CAD portfolio.

## Setup

1. Install dependencies with `npm install`.
2. Add a valid CrewAI API key to `.env.local`:

```env
CREWAI_API_KEY=...
CREWAI_BASE_URL=https://project-gauntlet-037d05be-3d8e-4a76-a91c-6a-8d8e2f69.crewai.com
CREWAI_FLOW_ID=037d05be-3d8e-4a76-a91c-6a-8d8e2f69
```

3. Run `npm run dev` and open `http://localhost:3000`.

The API key stays server-side. Kickoffs use CrewAI's flat `/kickoff` input contract and polling uses `/status/{kickoff_id}`. Portfolio state is saved in browser local storage; after each run the app uses a structured state snapshot from the final result when available. CrewAI's deployment API does not provide a `/state` endpoint, so reliable ledger/history updates require the backend to include a `state_snapshot` in the final result.

## Production

Run `npm run build` to validate the Vercel deployment build. Add the three environment variables to the Vercel project settings before deploying.
