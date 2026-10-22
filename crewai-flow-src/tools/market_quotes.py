import json
from datetime import date

import yfinance as yf
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

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



def quotes_json(tickers: str) -> str:
    return json.dumps(fetch_quotes([t for t in tickers.replace(";", ",").split(",") if t.strip()]))


class QuotesInput(BaseModel):
    tickers: str = Field(..., description="Comma-separated stock tickers, e.g. 'META,NVDA,MSFT'")


class MarketQuotesTool(BaseTool):
    name: str = "get_market_quotes"
    description: str = (
        "Get the latest REAL closing prices (USD and CAD), the as-of date, 1-week % change and the USD/CAD rate "
        "for comma-separated tickers. This is the ONLY allowed source of prices and FX rates."
    )
    args_schema: type[BaseModel] = QuotesInput

    def _run(self, tickers: str) -> str:
        return quotes_json(tickers)
