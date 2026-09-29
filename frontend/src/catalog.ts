// The ten-asset collateral catalog. Mirrors scripts/seed_markets.py, which is the
// source of truth for what `interact_live.py --seed` registers on-chain.
// tests/direct/test_seed_markets.py parses this file and fails if the numbers
// drift, so keep one entry per line in exactly this shape.
//
// ltv / liq / rate are the baseline basis points; telemetryUrl is the public,
// keyless Binance 24h-ticker endpoint the validators read.

export interface CatalogEntry {
  symbol: string;
  name: string;
  ltv: number;
  liq: number;
  rate: number;
  telemetryUrl: string;
}

export const MARKET_CATALOG: readonly CatalogEntry[] = [
  { symbol: "ETH", name: "Ethereum", ltv: 8000, liq: 8500, rate: 350, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT" },
  { symbol: "BTC", name: "Bitcoin", ltv: 8000, liq: 8500, rate: 300, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT" },
  { symbol: "SOL", name: "Solana", ltv: 7000, liq: 7600, rate: 450, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT" },
  { symbol: "AVAX", name: "Avalanche", ltv: 6500, liq: 7200, rate: 500, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=AVAXUSDT" },
  { symbol: "LINK", name: "Chainlink", ltv: 7000, liq: 7500, rate: 400, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=LINKUSDT" },
  { symbol: "ARB", name: "Arbitrum", ltv: 6000, liq: 6800, rate: 550, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=ARBUSDT" },
  { symbol: "OP", name: "Optimism", ltv: 6000, liq: 6800, rate: 550, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=OPUSDT" },
  { symbol: "NEAR", name: "NEAR Protocol", ltv: 6000, liq: 6700, rate: 600, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=NEARUSDT" },
  { symbol: "SUI", name: "Sui", ltv: 5500, liq: 6400, rate: 650, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=SUIUSDT" },
  { symbol: "BNB", name: "BNB", ltv: 7500, liq: 8000, rate: 400, telemetryUrl: "https://api.binance.com/api/v3/ticker/24hr?symbol=BNBUSDT" },
];

/** symbol -> display name, for the cards. Unknown symbols simply have no name. */
export const ASSET_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  MARKET_CATALOG.map((e) => [e.symbol, e.name]),
);
