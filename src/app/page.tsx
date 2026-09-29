"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Position = {
  ticker: string;
  shares: number;
  cost_basis: number;
  current_price: number;
  current_price_cad?: number;
  unrealised_pnl: number;
  unrealised_pnl_cad?: number;
};
type LedgerSnapshot = { cash: number; total_value: number };
type HistoryItem = {
  week: number;
  minutes: string;
  final_decision: string;
  ledger_snapshot: LedgerSnapshot;
};
type Trade = {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD" | string;
  shares: number;
  approx_cad_value: number;
  rationale: string;
};
type WeekOutputs = {
  analyst?: string;
  research?: string;
  risk?: string;
  pm?: string;
  cio?: string;
  minutes?: string;
};
type FlowState = {
  initialized?: boolean;
  current_week: number;
  starting_capital: number;
  start_date: string;
  end_date: string;
  investment_mandate: string;
  checkin_weekday_1: string;
  checkin_weekday_2: string;
  ledger: {
    cash: number;
    total_value: number;
    realised_pnl: number;
    fx_rate_used?: number;
    positions: Position[];
  };
  session_history: HistoryItem[];
  this_week_outputs?: WeekOutputs;
  approved_trades?: Trade[];
};
type Agent = { key: string; name: string; model: string; tone: string; startSeconds: number };

const agents: Agent[] = [
  { key: "analyst_data_intake", name: "Analyst", model: "Gemini 3.5 Flash Lite · Google", tone: "blue", startSeconds: 0 },
  { key: "research_lead_update", name: "Research Lead", model: "Gemini 3.5 Flash Lite · Google", tone: "violet", startSeconds: 60 },
  { key: "risk_officer_review", name: "Risk Officer", model: "Mistral Medium 3.5 · Mistral", tone: "red", startSeconds: 120 },
  { key: "pm_proposal", name: "Portfolio Manager", model: "Qwen 3.8-27B · Cerebras", tone: "amber", startSeconds: 180 },
  { key: "cio_committee_debate", name: "CIO", model: "GPT-5.4 · OpenAI", tone: "green", startSeconds: 240 },
  { key: "record_minutes_and_ledger", name: "Committee Secretary", model: "Nemotron Ultra · Cerebras", tone: "slate", startSeconds: 300 },
];
const stateStorageKey = "project-gauntlet-state-v1";
const money = (value: number, currency = "CAD") => new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
function hasKickoffConfig(state: FlowState) {
  return [state.start_date, state.end_date, state.investment_mandate, state.checkin_weekday_1, state.checkin_weekday_2]
    .every((value) => typeof value === "string" && value.trim().length > 0)
    && Number.isFinite(state.starting_capital)
    && state.starting_capital > 0;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function parseSnapshot(result: unknown): FlowState | null {
  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      const fenced = result.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) {
        try { parsed = JSON.parse(fenced[1]); } catch { return null; }
      } else return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as Record<string, unknown>;
  const snapshot = (payload.state_snapshot || payload.snapshot || payload) as Partial<FlowState>;
  if (!snapshot.ledger || !Array.isArray(snapshot.session_history)) return null;
  return snapshot as FlowState;
}

function stateAfterRun(previous: FlowState, result: unknown): FlowState {
  const snapshot = parseSnapshot(result);
  if (snapshot) return { ...previous, ...snapshot };

  const minutes = typeof result === "string" ? result : JSON.stringify(result ?? "");
  const week = previous.current_week;
  const summary = minutes.split(/\n/).map((line) => line.trim()).find(Boolean) || "Committee session completed. See the official minutes.";
  return {
    ...previous,
    current_week: week + 1,
    session_history: [
      ...previous.session_history,
      {
        week,
        minutes,
        final_decision: summary.slice(0, 240),
        ledger_snapshot: { cash: previous.ledger.cash, total_value: previous.ledger.total_value },
      },
    ],
  };
}

function outputsFromState(state: FlowState, fallback: unknown): Record<string, string> {
  const week = state.this_week_outputs;
  const asText = (value: unknown) => typeof value === "string" ? value : "";
  const outputs: Record<string, string> = {
    analyst_data_intake: asText(week?.analyst),
    research_lead_update: asText(week?.research),
    risk_officer_review: asText(week?.risk),
    pm_proposal: asText(week?.pm),
    cio_committee_debate: asText(week?.cio),
    record_minutes_and_ledger: asText(week?.minutes),
  };
  const fallbackText = typeof fallback === "string" ? fallback : JSON.stringify(fallback ?? "");
  for (const key of Object.keys(outputs)) {
    if (!outputs[key]) outputs[key] = fallbackText || "No output was returned for this agent.";
  }
  return outputs;
}

function CountValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const start = previous.current;
    const delta = value - start;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setDisplay(start + delta * Math.min(frame / 18, 1));
      if (frame >= 18) {
        previous.current = value;
        window.clearInterval(id);
      }
    }, 25);
    return () => window.clearInterval(id);
  }, [value]);
  return <>{money(display)}</>;
}

function SetupScreen({ onComplete }: { onComplete: (state: FlowState, runId: string) => void }) {
  const [form, setForm] = useState({
    start_date: "2026-09-08",
    end_date: "2027-02-23",
    starting_capital: "1000",
    investment_mandate: "Long-only S&P 500 equities with disciplined risk controls.",
    checkin_weekday_1: "Monday",
    checkin_weekday_2: "Thursday",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const startingCapital = Number(form.starting_capital);
    if (!Number.isFinite(startingCapital) || startingCapital <= 0) {
      setError("Enter a starting capital greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const preflight = await fetch("/api/flow/inputs");
      const preflightData = await preflight.json();
      if (!preflight.ok) throw new Error(`Deployment check failed: ${preflightData.error || `GET /inputs returned HTTP ${preflight.status}`}`);

      const response = await fetch("/api/flow/kickoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, starting_capital: startingCapital, human_input: "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kickoff failed.");

      onComplete({
        initialized: true,
        current_week: 1,
        starting_capital: startingCapital,
        start_date: form.start_date,
        end_date: form.end_date,
        investment_mandate: form.investment_mandate,
        checkin_weekday_1: form.checkin_weekday_1,
        checkin_weekday_2: form.checkin_weekday_2,
        ledger: { cash: startingCapital, total_value: startingCapital, realised_pnl: 0, positions: [] },
        session_history: [],
      }, data.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to initialize the committee.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup-shell">
      <div className="setup-mark">PG<span>/</span>01</div>
      <div className="setup-copy">
        <p className="eyebrow">Project Gauntlet · investment committee</p>
        <h1>Give the committee<br /><em>a mandate.</em></h1>
        <p>Five specialist agents will debate every week and manage your simulated CAD portfolio. Set the rules once, then let the room work.</p>
      </div>
      <form className="setup-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Start date<input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required /></label>
          <label>End date<input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} required /></label>
        </div>
        <label>Starting capital<input type="number" min="1" value={form.starting_capital} onChange={(event) => setForm({ ...form, starting_capital: event.target.value })} required /></label>
        <label>Investment mandate<textarea rows={4} value={form.investment_mandate} onChange={(event) => setForm({ ...form, investment_mandate: event.target.value })} required /></label>
        <div className="form-grid">
          <label>Check-in day one<select value={form.checkin_weekday_1} onChange={(event) => setForm({ ...form, checkin_weekday_1: event.target.value })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => <option key={day}>{day}</option>)}</select></label>
          <label>Check-in day two<select value={form.checkin_weekday_2} onChange={(event) => setForm({ ...form, checkin_weekday_2: event.target.value })}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day) => <option key={day}>{day}</option>)}</select></label>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Starting first session..." : "Initialize and start session"}<Icon>↗</Icon></button>
      </form>
    </main>
  );
}

function AgentCard({ agent, text, index, visible, active }: { agent: Agent; text?: string; index: number; visible: boolean; active: boolean }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!text) { setShown(""); return; }
    let cursor = 0;
    const id = window.setInterval(() => {
      cursor += Math.max(1, Math.ceil(text.length / 55));
      setShown(text.slice(0, cursor));
      if (cursor >= text.length) window.clearInterval(id);
    }, 38);
    return () => window.clearInterval(id);
  }, [text]);
  if (!visible) return null;
  return (
    <article className={`agent-card ${agent.tone} ${text ? "done" : active ? "pending" : "queued"}`} style={{ animationDelay: `${index * 90}ms` }}>
      <div className="agent-top">
        <div className="agent-number">0{index + 1}</div>
        <div><h4>{agent.name}</h4><span className="model-badge">{agent.model}</span></div>
        <span className="agent-status">{text ? "✓" : active ? <span className="spinner" /> : "·"}</span>
      </div>
      {text && <p className="agent-output">{shown}<span className="cursor" /></p>}
    </article>
  );
}

function parseTrades(text: string): Trade[] {
  const parsed: Trade[] = [];
  const regex = /(Buy|Sell)\s+([\d.]+)\s+shares?\s+of\s+([A-Z]{1,5})|(Initiate)\s+([A-Z]{1,5})\s*[—-]\s*([\d.]+)\s+shares?|(Reduce)\s+([A-Z]{1,5})\s+to\s+([\d.]+)\s+shares?|\b(Hold)\s+([A-Z]{1,5})/gi;
  for (const match of Array.from(text.matchAll(regex))) {
    const action = (match[1] || match[4] || match[7] || match[10] || "").toUpperCase();
    const ticker = (match[3] || match[5] || match[8] || match[11] || "").toUpperCase();
    const shares = Number(match[2] || match[6] || match[9] || 0);
    if (ticker) parsed.push({ ticker, action: action === "INITIATE" ? "BUY" : action === "REDUCE" ? "SELL" : action, shares, approx_cad_value: 0, rationale: "See the CIO output for rationale." });
  }
  return parsed;
}

function Deliberation({ state, onClose, onComplete, initialRunId }: { state: FlowState; onClose: () => void; onComplete: (state: FlowState) => void; initialRunId?: string }) {
  const [stage, setStage] = useState<"input" | "running" | "complete" | "failed">(initialRunId ? "running" : "input");
  const [human, setHuman] = useState("");
  const [mandate, setMandate] = useState("");
  const [runId, setRunId] = useState(initialRunId || "");
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const outputsRef = useRef<Record<string, string>>({});
  const [error, setError] = useState("");
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(initialRunId ? Date.now() : null);
  const [elapsed, setElapsed] = useState(0);

  const kickoff = async () => {
    setStage("running");
    setError("");
    setStartedAt(Date.now());
    try {
      const inputsResponse = await fetch("/api/flow/inputs");
      const inputsData = await inputsResponse.json();
      if (!inputsResponse.ok) {
        throw new Error(`Deployment check failed: ${inputsData.error || `GET /inputs returned HTTP ${inputsResponse.status}`}`);
      }
      if (Array.isArray(inputsData.inputs)) {
        const required = ["start_date", "end_date", "starting_capital", "investment_mandate", "checkin_weekday_1", "checkin_weekday_2"];
        const missing = required.filter((name) => !inputsData.inputs.includes(name));
        if (missing.length) throw new Error(`This deployment is missing expected inputs: ${missing.join(", ")}.`);
      }

      const response = await fetch("/api/flow/kickoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: state.start_date,
          end_date: state.end_date,
          starting_capital: state.starting_capital,
          investment_mandate: mandate || state.investment_mandate,
          checkin_weekday_1: state.checkin_weekday_1,
          checkin_weekday_2: state.checkin_weekday_2,
          human_input: human,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kickoff failed.");
      setRunId(data.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kickoff failed.");
      setStage("failed");
    }
  };

  useEffect(() => {
    if (stage !== "running" || startedAt === null) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [stage, startedAt]);

  useEffect(() => {
    if (stage !== "running" || !runId) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/flow/runs/${encodeURIComponent(runId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to poll the committee run.");
        if (data.status === "failed") {
          setError(data.error || data.result || "The committee run failed.");
          setStage("failed");
          return;
        }
        if (data.status !== "completed") return;

        const nextState = stateAfterRun(state, data.result);
        const nextOutputs = outputsFromState(nextState, data.result);
        outputsRef.current = nextOutputs;
        setOutputs(nextOutputs);
        onComplete(nextState);
        setStage("complete");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Polling failed.");
        setStage("failed");
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(id);
  }, [stage, runId, onComplete, state]);

  const latest = state.session_history[state.session_history.length - 1];
  const cio = outputs.cio_committee_debate || state.this_week_outputs?.cio || "";
  const tradeInstructions = state.approved_trades || parseTrades(cio || outputs.record_minutes_and_ledger || "");
  const secretary = outputs.record_minutes_and_ledger || state.this_week_outputs?.minutes || latest?.minutes || "";

  return (
    <div className="modal-backdrop">
      <aside className="checkin-panel">
        <div className="panel-head">
          <div><p className="eyebrow">Week {state.current_week} committee room</p><h2>{stage === "input" ? "Open the floor" : stage === "complete" ? "Session complete" : "Live deliberation"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {stage === "input" && (
          <div className="input-stage">
            <p className="panel-intro">Bring a view to the room. The agents will treat it as context, not instruction.</p>
            <label>Your view this week <span>optional</span><textarea rows={5} placeholder="e.g. 'I think NVDA has run too far — consider trimming' or 'Add AAPL to the watchlist'" value={human} onChange={(event) => setHuman(event.target.value)} />{human && <small>Your input will be passed to the Portfolio Manager and CIO as additional context.</small>}</label>
            <label>Override mandate note <span>optional</span><textarea rows={3} placeholder="Only for this session" value={mandate} onChange={(event) => setMandate(event.target.value)} /></label>
            <button className="primary-button full" onClick={kickoff}>Start committee session<Icon>↗</Icon></button>
          </div>
        )}
        {stage === "running" && (
          <div className="live-stage">
            <div className="run-meta"><span className="live-dot" />Agents are reviewing the book<span className="poll-note">Live · refreshes every 5 sec</span></div>
            <div className="agent-timeline">
              {agents.map((agent, index) => <AgentCard key={agent.key} agent={agent} text={outputs[agent.key]} index={index} visible={elapsed >= agent.startSeconds} active={elapsed >= agent.startSeconds} />)}
            </div>
            <p className="estimated-note">Agent timing is an estimate. CrewAI returns the committee outputs when the run completes.</p>
          </div>
        )}
        {(stage === "complete" || stage === "failed") && stage === "complete" && (
          <div className="live-stage">
            <div className="run-meta"><span className="live-dot" />Decision recorded<span className="poll-note">Week {latest?.week ?? state.current_week}</span></div>
            <div className="agent-timeline">
              {agents.map((agent, index) => <AgentCard key={agent.key} agent={agent} text={outputs[agent.key]} index={index} visible active={false} />)}
            </div>
            <div className="decision-wrap">
              <div className="section-heading"><div><p className="eyebrow">CIO instruction set</p><h3>Final decision</h3></div><button className="text-button" onClick={() => setMinutesOpen(true)}>View full minutes ↗</button></div>
              {tradeInstructions.length > 0 ? (
                <div className="trade-chips">
                  {tradeInstructions.map((trade, index) => (
                    <details className={`trade-chip ${trade.action.toLowerCase()}`} key={`${trade.ticker}-${index}`}>
                      <summary><b>{trade.action}</b><strong>{trade.ticker}</strong>{trade.shares > 0 && <span>{trade.shares} shares</span>}<small>≈ {money(trade.approx_cad_value)}</small></summary>
                      <p>{trade.rationale}</p>
                    </details>
                  ))}
                </div>
              ) : <p className="empty-note">No approved trades were returned for this session.</p>}
              <div className="complete-banner"><span>✓</span><div><strong>Session complete</strong><p>Updated portfolio value: {money(state.ledger.total_value)}</p></div><button className="primary-button" onClick={onClose}>Return to dashboard</button></div>
            </div>
          </div>
        )}
        {stage === "failed" && <div className="failure-stage"><div className="error-banner"><strong>Run failed</strong><br />{error}</div><button className="primary-button" onClick={() => { setStage("input"); setRunId(""); setError(""); }}>Retry session</button></div>}
        {minutesOpen && <div className="minutes-overlay"><div className="minutes-sheet"><button className="icon-button" onClick={() => setMinutesOpen(false)}>×</button><p className="eyebrow">Official minutes</p><pre>{secretary || cio}</pre></div></div>}
      </aside>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<FlowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem | null>(null);
  const [light, setLight] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(stateStorageKey);
      if (saved) setState(JSON.parse(saved) as FlowState);
    } catch {
      setError("Saved portfolio data could not be read. Set up the committee again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const [initialRunId, setInitialRunId] = useState("");
  const saveState = (nextState: FlowState, runId?: string) => {
    window.localStorage.setItem(stateStorageKey, JSON.stringify(nextState));
    setState(nextState);
    if (runId) {
      setInitialRunId(runId);
      setCheckinOpen(true);
    }
  };
  const change = useMemo(() => state ? ((state.ledger.total_value - state.starting_capital) / state.starting_capital) * 100 : 0, [state]);

  if (loading) return <div className="loading-screen"><div className="loading-mark">PG<span>/</span>01</div><div className="loading-line" /></div>;
  if (!state || !hasKickoffConfig(state)) return <SetupScreen onComplete={saveState} />;

  const latest = state.session_history[state.session_history.length - 1];
  const progress = Math.min(Math.max(((state.ledger.total_value - 1000) / 150) * 100, 0), 100);
  const positionsValue = state.ledger.positions.reduce((sum, position) => sum + position.shares * (position.current_price_cad ?? position.current_price), 0);
  const pnl = state.ledger.positions.reduce((sum, position) => sum + (position.unrealised_pnl_cad ?? position.unrealised_pnl), 0);

  return (
    <div className={light ? "app-shell light" : "app-shell"}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">PG<span>/</span>01</span><span className="brand-title">Project Gauntlet <b>Investment Committee</b></span></div>
        <div className="top-actions"><span className="status-label"><i className={change >= 0 ? "status-dot good" : "status-dot warn"} />{change >= 0 ? "On pace" : "Needs attention"}</span><span className="week-pill">Week {state.current_week} <span>of 24</span></span><button className="theme-toggle" onClick={() => setLight(!light)} aria-label="Toggle theme">{light ? "☾" : "☼"}</button></div>
      </header>
      <main className="dashboard">
        <div className="hero-row"><div><p className="eyebrow">Project Gauntlet · Weekly review <span className="live-dot" /></p><h1>The room is <em>watching.</em></h1><p className="hero-sub">CAD account · S&amp;P 500 mandate · {state.checkin_weekday_1} / {state.checkin_weekday_2}</p></div><button className="primary-button kickoff" onClick={() => setCheckinOpen(true)}><span className="button-pulse" />Start check-in<Icon>↗</Icon></button></div>
        {error && <div className="error-banner subtle">{error}</div>}
        <section className="metrics-grid">
          <div className="metric-card featured"><span className="metric-label">Total portfolio value<i>CAD</i></span><strong><CountValue value={state.ledger.total_value} /></strong><div className="metric-foot"><span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "↗" : "↘"} {pct(change)}</span><span>vs. {money(state.starting_capital)}</span></div></div>
          <div className="metric-card"><span className="metric-label">Cash on hand<i>CAD</i></span><strong>{money(state.ledger.cash)}</strong><div className="metric-foot"><span className="muted">{state.ledger.positions.length} active positions</span></div></div>
          <div className="metric-card"><span className="metric-label">Unrealised P&amp;L<i>CAD</i></span><strong className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{money(pnl)}</strong><div className="metric-foot"><span className={pnl >= 0 ? "positive" : "negative"}>{pct((pnl / Math.max(positionsValue, 1)) * 100)}</span><span>across book</span></div></div>
          <div className="metric-card target-card"><span className="metric-label">Target progress<i>CAD 1,150</i></span><strong>{Math.round(progress)}<small>%</small></strong><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="metric-foot"><span>{money(state.ledger.total_value)}</span><span>target {money(1150)}</span></div></div>
        </section>
        <div className="content-grid">
          <section className="panel positions-panel">
            <div className="section-heading"><div><p className="eyebrow">Portfolio ledger</p><h2>Current positions</h2></div><span className="as-of">CAD values · USD quote shown</span></div>
            <div className="table-wrap"><table><thead><tr><th>Ticker</th><th>Shares</th><th>Cost basis<small>CAD / share</small></th><th>Current price<small>USD</small></th><th>Position value<small>CAD</small></th><th>Unrealised P&amp;L<small>CAD</small></th><th>Return</th></tr></thead><tbody>
              {state.ledger.positions.map((position) => {
                const positionValueCad = position.shares * (position.current_price_cad ?? position.current_price);
                const positionPnlCad = position.unrealised_pnl_cad ?? position.unrealised_pnl;
                return <tr key={position.ticker}><td><strong className="ticker">{position.ticker}</strong></td><td>{position.shares.toFixed(2)}</td><td>{money(position.cost_basis)}</td><td>{money(position.current_price, "USD")}</td><td>{money(positionValueCad)}</td><td className={positionPnlCad >= 0 ? "positive" : "negative"}>{positionPnlCad >= 0 ? "+" : ""}{money(positionPnlCad)}</td><td className={positionPnlCad >= 0 ? "positive" : "negative"}>{pct((positionPnlCad / Math.max(position.cost_basis * position.shares, 1)) * 100)}</td></tr>;
              })}
            </tbody></table>{state.ledger.fx_rate_used && <p className="fx-note">Ledger FX used: 1 USD = {state.ledger.fx_rate_used.toFixed(2)} CAD</p>}</div>
          </section>
          <aside className="side-column">
            <section className="panel decision-panel"><div className="section-heading"><div><p className="eyebrow">Latest outcome</p><h2>Last decision</h2></div>{latest && <span className="decision-week">W{latest.week}</span>}</div><p>{latest?.final_decision || "The first committee review is ready to begin."}</p>{latest && <button className="text-button" onClick={() => setHistory(latest)}>Read session minutes ↗</button>}</section>
            <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">Archive</p><h2>Session history</h2></div><span className="count-badge">{state.session_history.length}</span></div><div className="history-list">{state.session_history.length ? [...state.session_history].reverse().map((item) => <button className="history-item" key={item.week} onClick={() => setHistory(item)}><span className="history-week">W{String(item.week).padStart(2, "0")}</span><span><strong>{money(item.ledger_snapshot.total_value)}</strong><small>{item.final_decision}</small></span><span>↗</span></button>) : <p className="empty-note">No sessions recorded yet.</p>}</div></section>
          </aside>
        </div>
      </main>
      {checkinOpen && <Deliberation state={state} onClose={() => { setCheckinOpen(false); setInitialRunId(""); }} onComplete={saveState} initialRunId={initialRunId || undefined} />}
      {history && <div className="drawer-backdrop" onClick={() => setHistory(null)}><aside className="history-drawer" onClick={(event) => event.stopPropagation()}><button className="icon-button" onClick={() => setHistory(null)}>×</button><p className="eyebrow">Week {history.week} / official record</p><h2>Session minutes</h2><div className="drawer-rule" /><pre>{history.minutes}</pre></aside></div>}
    </div>
  );
}
