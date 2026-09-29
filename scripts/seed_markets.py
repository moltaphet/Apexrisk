"""The ApexRisk collateral catalog: ten assets with baseline risk postures.

Single source of truth for `deploy.py` and `interact_live.py`. The frontend's
`frontend/src/catalog.ts` mirrors these numbers, and a test
(tests/direct/test_seed_markets.py) fails if the two drift or if any baseline
would be clamped by the contract's invariants.

Telemetry: keyless public Binance REST endpoints.
  * primary   -- 24h ticker: price, 24h change / high / low, volume (a compact
                 volatility + liquidity read, ~0.5 KB)
  * secondary -- top-of-book depth (limit=20, ~1.3 KB), an independent second view
                 of liquidity; registered with `interact_live.py --seed --with-depth`

CoinGecko coin pages and its keyless API were the first choice but answer
HTTP 403 (bot protection) to non-browser clients, so they cannot be relied on for
unattended validator scraping. Binance may still refuse some regions (HTTP 451);
in that case the committee gets an error body, returns nothing usable, and the
evaluation reverts with state untouched.
"""

from typing import NamedTuple

BINANCE = "https://api.binance.com/api/v3"


class Seed(NamedTuple):
    name: str
    pair: str  # Binance spot symbol, e.g. ETHUSDT
    ltv: int  # bps
    liq: int  # bps
    rate: int  # bps

    @property
    def telemetry_url(self) -> str:
        return f"{BINANCE}/ticker/24hr?symbol={self.pair}"

    @property
    def depth_url(self) -> str:
        return f"{BINANCE}/depth?symbol={self.pair}&limit=20"


SEED_MARKETS: dict[str, Seed] = {
    "ETH": Seed("Ethereum", "ETHUSDT", 8000, 8500, 350),
    "BTC": Seed("Bitcoin", "BTCUSDT", 8000, 8500, 300),
    "SOL": Seed("Solana", "SOLUSDT", 7000, 7600, 450),
    "AVAX": Seed("Avalanche", "AVAXUSDT", 6500, 7200, 500),
    "LINK": Seed("Chainlink", "LINKUSDT", 7000, 7500, 400),
    "ARB": Seed("Arbitrum", "ARBUSDT", 6000, 6800, 550),
    "OP": Seed("Optimism", "OPUSDT", 6000, 6800, 550),
    "NEAR": Seed("NEAR Protocol", "NEARUSDT", 6000, 6700, 600),
    "SUI": Seed("Sui", "SUIUSDT", 5500, 6400, 650),
    "BNB": Seed("BNB", "BNBUSDT", 7500, 8000, 400),
}
