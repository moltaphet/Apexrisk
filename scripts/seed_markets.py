"""The ApexRisk collateral catalog: ten assets with baseline risk postures.

Single source of truth for `deploy.py` and `interact_live.py`. The frontend's
`frontend/src/catalog.ts` mirrors these numbers, and a test
(tests/direct/test_seed_markets.py) fails if the two drift or if any baseline
would be clamped by the contract's invariants.

Telemetry: two independent exchanges' keyless public ticker JSON, so the
contract's dual-source cross-check is real.
  * primary   -- Coinbase Exchange ticker (price, bid/ask, 24h volume; ~0.2 KB)
  * secondary -- Kraken ticker (ask/bid/last, volume, 24h high/low; ~0.3 KB),
                 registered with `interact_live.py --seed --with-secondary`

Why these and not Binance / CoinGecko: measured from inside Studio Next itself
(a probe contract run as consensus transactions),
  api.binance.com    -> HTTP 451 "Service unavailable from a restricted location"
  www.coingecko.com  -> HTTP 403 (bot protection)
  Coinbase, Kraken, Binance.US -> HTTP 200, with both web.get and web.render.
The original catalog used api.binance.com, so every evaluation reverted with
[TRANSIENT] telemetry unreachable: WEBPAGE_LOAD_FAILED. Reachability is a property
of the validators' network, not of a developer machine, so re-measure before
switching sources.
"""

from typing import NamedTuple

COINBASE = "https://api.exchange.coinbase.com/products"
KRAKEN = "https://api.kraken.com/0/public/Ticker"


class Seed(NamedTuple):
    name: str
    coinbase: str  # Coinbase product id, e.g. ETH-USD
    kraken: str  # Kraken pair, e.g. XBTUSD
    ltv: int  # bps
    liq: int  # bps
    rate: int  # bps

    @property
    def telemetry_url(self) -> str:
        return f"{COINBASE}/{self.coinbase}/ticker"

    @property
    def secondary_url(self) -> str:
        return f"{KRAKEN}?pair={self.kraken}"


SEED_MARKETS: dict[str, Seed] = {
    "ETH": Seed("Ethereum", "ETH-USD", "ETHUSD", 8000, 8500, 350),
    "BTC": Seed("Bitcoin", "BTC-USD", "XBTUSD", 8000, 8500, 300),
    "SOL": Seed("Solana", "SOL-USD", "SOLUSD", 7000, 7600, 450),
    "AVAX": Seed("Avalanche", "AVAX-USD", "AVAXUSD", 6500, 7200, 500),
    "LINK": Seed("Chainlink", "LINK-USD", "LINKUSD", 7000, 7500, 400),
    "ARB": Seed("Arbitrum", "ARB-USD", "ARBUSD", 6000, 6800, 550),
    "OP": Seed("Optimism", "OP-USD", "OPUSD", 6000, 6800, 550),
    "NEAR": Seed("NEAR Protocol", "NEAR-USD", "NEARUSD", 6000, 6700, 600),
    "SUI": Seed("Sui", "SUI-USD", "SUIUSD", 5500, 6400, 650),
    "BNB": Seed("BNB", "BNB-USD", "BNBUSD", 7500, 8000, 400),
}
