// The ten-asset collateral catalog. Mirrors scripts/seed_markets.py, which is the
// source of truth for what `interact_live.py --seed` registers on-chain.
// tests/direct/test_seed_markets.py parses this file and fails if the numbers
// drift, so keep one entry per line in exactly this shape.
//
// ltv / liq / rate are the baseline basis points; telemetryUrl is the public,
// keyless Coinbase Exchange ticker endpoint the validators read (Binance is geo-blocked
// from Studio Next: HTTP 451; see scripts/seed_markets.py).

export interface CatalogEntry {
  symbol: string;
  name: string;
  ltv: number;
  liq: number;
  rate: number;
  telemetryUrl: string;
}

export const MARKET_CATALOG: readonly CatalogEntry[] = [
  { symbol: "ETH", name: "Ethereum", ltv: 8000, liq: 8500, rate: 350, telemetryUrl: "https://api.exchange.coinbase.com/products/ETH-USD/ticker" },
  { symbol: "BTC", name: "Bitcoin", ltv: 8000, liq: 8500, rate: 300, telemetryUrl: "https://api.exchange.coinbase.com/products/BTC-USD/ticker" },
  { symbol: "SOL", name: "Solana", ltv: 7000, liq: 7600, rate: 450, telemetryUrl: "https://api.exchange.coinbase.com/products/SOL-USD/ticker" },
  { symbol: "AVAX", name: "Avalanche", ltv: 6500, liq: 7200, rate: 500, telemetryUrl: "https://api.exchange.coinbase.com/products/AVAX-USD/ticker" },
  { symbol: "LINK", name: "Chainlink", ltv: 7000, liq: 7500, rate: 400, telemetryUrl: "https://api.exchange.coinbase.com/products/LINK-USD/ticker" },
  { symbol: "ARB", name: "Arbitrum", ltv: 6000, liq: 6800, rate: 550, telemetryUrl: "https://api.exchange.coinbase.com/products/ARB-USD/ticker" },
  { symbol: "OP", name: "Optimism", ltv: 6000, liq: 6800, rate: 550, telemetryUrl: "https://api.exchange.coinbase.com/products/OP-USD/ticker" },
  { symbol: "NEAR", name: "NEAR Protocol", ltv: 6000, liq: 6700, rate: 600, telemetryUrl: "https://api.exchange.coinbase.com/products/NEAR-USD/ticker" },
  { symbol: "SUI", name: "Sui", ltv: 5500, liq: 6400, rate: 650, telemetryUrl: "https://api.exchange.coinbase.com/products/SUI-USD/ticker" },
  { symbol: "BNB", name: "BNB", ltv: 7500, liq: 8000, rate: 400, telemetryUrl: "https://api.exchange.coinbase.com/products/BNB-USD/ticker" },
];

/** symbol -> display name, for the cards. Unknown symbols simply have no name. */
export const ASSET_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  MARKET_CATALOG.map((e) => [e.symbol, e.name]),
);
