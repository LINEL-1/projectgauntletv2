import json
from datetime import date

import yfinance as yf
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

STARTING_CAPITAL_CAD = 1000.0
MAX_POSITION_FRACTION = 0.40


def fetch_usd_cad() -> float | None:
    hist = yf.Ticker("CAD=X").history(period="5d")["Close"].dropna()
    return float(hist.iloc[-1]) if not hist.empty else None


def fetch_quotes(tickers: list[str]) -> dict:
    """Last close in USD and CAD per ticker, plus the USD/CAD rate. Missing data is reported, never guessed."""
    fx = fetch_usd_cad()
    out: dict = {"usd_cad": fx, "as_of_run": str(date.today()), "quotes": {}}
    for raw in sorted({t.upper().strip() for t in tickers if t and t.strip()}):
        try:
            hist = yf.Ticker(raw).history(period="1mo")["Close"].dropna()
            if hist.empty:
                out["quotes"][raw] = {"error": "no data"}
                continue
            usd = float(hist.iloc[-1])
            week_ago = float(hist.iloc[-6]) if len(hist) >= 6 else float(hist.iloc[0])
            out["quotes"][raw] = {
                "price_usd": round(usd, 2),
                "price_cad": round(usd * fx, 2) if fx else None,
                "as_of": str(hist.index[-1].date()),
                "week_change_pct": round((usd / week_ago - 1) * 100, 2),
            }
        except Exception as exc:  # network / unknown ticker
            out["quotes"][raw] = {"error": str(exc)}
    return out



def _num(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def apply_trades(ledger: dict | None, trades: list[dict]) -> dict:
    """Apply approved trades to the ledger using live prices. All arithmetic happens here."""
    ledger = ledger or {}
    positions = {
        p["ticker"].upper(): {"shares": _num(p.get("shares")), "cost_basis": _num(p.get("cost_basis"))}
        for p in (ledger.get("positions") or [])
        if p.get("ticker")
    }
    cash = _num(ledger.get("cash"), STARTING_CAPITAL_CAD) if ledger else STARTING_CAPITAL_CAD
    realised = _num(ledger.get("realised_pnl"))
    tickers = set(positions) | {str(t.get("ticker", "")).upper() for t in trades}
    q = fetch_quotes(sorted(tickers))
    fx = q["usd_cad"]
    notes: list[str] = []

    def price_cad(t):
        quote = q["quotes"].get(t) or {}
        return quote.get("price_cad")

    def portfolio_value():
        return cash + sum(p["shares"] * (price_cad(t) or p["cost_basis"]) for t, p in positions.items())

    for trade in trades:
        t = str(trade.get("ticker", "")).upper()
        action = str(trade.get("action", "")).upper()
        if not t or action == "HOLD":
            continue
        px = price_cad(t)
        if not px:
            notes.append(f"{action} {t} dropped: no live price available")
            continue
        if action in ("BUY", "INITIATE"):
            shares = _num(trade.get("shares"))
            if shares <= 0 and _num(trade.get("approx_cad_value")) > 0:
                shares = _num(trade.get("approx_cad_value")) / px
            shares = round(shares, 4)
            cost = shares * px
            total = portfolio_value()
            held = positions.get(t, {"shares": 0.0, "cost_basis": 0.0})
            if shares <= 0 or cost > cash + 0.01:
                notes.append(f"{action} {t} dropped: cost {cost:.2f} CAD exceeds cash {cash:.2f} CAD")
                continue
            if (held["shares"] * px + cost) > MAX_POSITION_FRACTION * total + 0.5:
                notes.append(f"{action} {t} dropped: position would exceed 40% of portfolio")
                continue
            new_shares = held["shares"] + shares
            held["cost_basis"] = (held["shares"] * held["cost_basis"] + cost) / new_shares
            held["shares"] = round(new_shares, 4)
            positions[t] = held
            cash -= cost
        elif action in ("SELL", "REDUCE"):
            held = positions.get(t)
            if not held:
                notes.append(f"{action} {t} dropped: no position held")
                continue
            shares = min(_num(trade.get("shares")), held["shares"])
            if shares <= 0 and _num(trade.get("approx_cad_value")) > 0:
                shares = min(_num(trade.get("approx_cad_value")) / px, held["shares"])
            shares = round(shares, 4)
            realised += shares * (px - held["cost_basis"])
            cash += shares * px
            held["shares"] = round(held["shares"] - shares, 4)
            if held["shares"] <= 0:
                del positions[t]

    out_positions = []
    for t, p in sorted(positions.items()):
        quote = q["quotes"].get(t) or {}
        px = quote.get("price_cad") or p["cost_basis"]
        out_positions.append({
            "ticker": t,
            "shares": p["shares"],
            "cost_basis": round(p["cost_basis"], 2),
            "price_usd": quote.get("price_usd"),
            "price_cad": px,
            "current_price": quote.get("price_usd"),
            "current_price_cad": px,
            "unrealised_pnl": round(p["shares"] * (px - p["cost_basis"]), 2),
            "unrealised_pnl_cad": round(p["shares"] * (px - p["cost_basis"]), 2),
            "as_of": quote.get("as_of"),
        })
    total_value = cash + sum(p["shares"] * p["price_cad"] for p in out_positions)
    return {
        "cash": round(cash, 2),
        "positions": out_positions,
        "total_value": round(total_value, 2),
        "realised_pnl": round(realised, 2),
        "usd_cad": fx,
        "fx_rate_used": fx,
        "as_of": str(date.today()),
        "notes": notes,
    }



class LedgerInput(BaseModel):
    ledger_json: str = Field(..., description="Current ledger as JSON: {cash, positions:[{ticker, shares, cost_basis}], realised_pnl}. Use '{}' if empty.")
    trades_json: str = Field(..., description="Approved trades as a JSON array: [{ticker, action (BUY/INITIATE/SELL/REDUCE/HOLD), shares, approx_cad_value}]. Use '[]' if none.")


class ApplyTradesTool(BaseTool):
    name: str = "apply_trades_to_ledger"
    description: str = (
        "Applies approved trades to the portfolio ledger using live market prices and returns the updated ledger JSON. "
        "All arithmetic (shares, cash, cost basis, P&L, total value) is computed in code. Enforces cash limit and 40% cap."
    )
    args_schema: type[BaseModel] = LedgerInput

    def _run(self, ledger_json: str, trades_json: str) -> str:
        try:
            ledger = json.loads(ledger_json or "{}")
            trades = json.loads(trades_json or "[]")
        except json.JSONDecodeError as exc:
            return json.dumps({"error": f"invalid JSON input: {exc}"})
        return json.dumps(apply_trades(ledger, trades))
