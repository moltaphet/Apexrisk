import type { Market, Posture, RiskTier, RunState } from "./types";

// Offline / Guest mode: a pre-populated telemetry snapshot per asset plus a local
// port of the contract's safety envelope, so reviewers can walk the entire
// consensus flow without a funded wallet. Every guest result is labelled
// SIMULATED in the UI -- it is never presented as an on-chain outcome.

export const GUEST_TELEMETRY: Record<string, { page: string; committee: Posture & { rationale: string } }> = {
  ETH: {
    page: "ETH-USD · depth ±2%: $41.3M · realised vol (30d): 46% · perp funding: +0.011%/8h · OI: $9.8B",
    committee: { max_ltv_bps: 7200, liquidation_threshold_bps: 7900, borrow_rate_base_bps: 420, risk_tier: "MODERATE", rationale: "Deep books and contained funding support a modest LTV trim." },
  },
  BTC: {
    page: "BTC-USD · depth ±2%: $118.6M · realised vol (30d): 31% · perp funding: +0.006%/8h · OI: $24.1B",
    committee: { max_ltv_bps: 8100, liquidation_threshold_bps: 8600, borrow_rate_base_bps: 280, risk_tier: "LOW", rationale: "Deepest liquidity and calm volatility keep BTC in the lowest tier." },
  },
  SOL: {
    page: "SOL-USD · depth ±2%: $6.2M · realised vol (30d): 88% · perp funding: +0.052%/8h · OI: $2.4B",
    committee: { max_ltv_bps: 5600, liquidation_threshold_bps: 6300, borrow_rate_base_bps: 780, risk_tier: "HIGH", rationale: "Thin depth, elevated volatility and stretched funding warrant tighter limits." },
  },
};

export const GUEST_MARKETS: Market[] = [
  ["ETH", 7500, 8000, 350, "MODERATE"],
  ["BTC", 8000, 8500, 300, "LOW"],
  ["SOL", 6500, 7200, 500, "MODERATE"],
].map(([symbol, ltv, liq, rate, tier]) => ({
  symbol: symbol as string,
  active: true,
  telemetry_url: `https://telemetry.example.com/${(symbol as string).toLowerCase()}`,
  max_ltv_bps: ltv as number,
  liquidation_threshold_bps: liq as number,
  liquidation_margin_bps: (liq as number) - (ltv as number),
  borrow_rate_base_bps: rate as number,
  risk_tier: tier as RiskTier,
  circuit_breaker: false,
  evaluation_count: 0,
  last_evaluated_at: 0,
  last_rationale: "",
}));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Mirror of ApexRisk._apply_invariants. */
export function applyInvariants(p: Posture): Posture {
  let ltv = clamp(p.max_ltv_bps, 2000, 8500);
  const liq = clamp(p.liquidation_threshold_bps, ltv + 300, 9800);
  if (liq < ltv + 300) ltv = clamp(liq - 300, 2000, 8500);
  return { ...p, max_ltv_bps: ltv, liquidation_threshold_bps: liq, borrow_rate_base_bps: clamp(p.borrow_rate_base_bps, 100, 2500) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulated lifecycle with realistic pacing; returns the updated market. */
export async function runGuestEvaluation(
  market: Market,
  emit: (patch: Partial<RunState>) => void,
): Promise<Market> {
  const snap = GUEST_TELEMETRY[market.symbol] ?? GUEST_TELEMETRY.ETH;
  emit({ steps: ["active", "idle", "idle"], detail: "Packaging pre-populated telemetry snapshot…" });
  await sleep(1400);
  emit({ steps: ["done", "active", "idle"], status: "PROPOSING", votes: { agree: 0, total: 5, simulated: true }, detail: "Simulated validators proposing…" });
  await sleep(1500);
  emit({ status: "COMMITTING", votes: { agree: 2, total: 5, simulated: true }, detail: "Simulated validators committing votes…" });
  await sleep(1500);
  emit({ status: "REVEALING", votes: { agree: 4, total: 5, simulated: true }, detail: "Simulated validators revealing votes…" });
  await sleep(1300);

  const prior: Posture = {
    max_ltv_bps: market.max_ltv_bps,
    liquidation_threshold_bps: market.liquidation_threshold_bps,
    borrow_rate_base_bps: market.borrow_rate_base_bps,
    risk_tier: market.risk_tier,
  };
  const applied = applyInvariants(snap.committee);
  emit({
    steps: ["done", "done", "done"],
    status: "SIMULATED",
    votes: { agree: 5, total: 5, simulated: true },
    detail: "Simulated consensus complete. Nothing was written on-chain.",
    result: {
      prior,
      applied,
      rationale: snap.committee.rationale,
      finalized: false,
      payload: {
        simulated: true,
        symbol: market.symbol,
        telemetry: snap.page,
        committee_posture: {
          max_ltv_bps: snap.committee.max_ltv_bps,
          liquidation_threshold_bps: snap.committee.liquidation_threshold_bps,
          borrow_rate_base_bps: snap.committee.borrow_rate_base_bps,
          risk_tier: snap.committee.risk_tier,
        },
        applied_posture: applied,
        prior_posture: prior,
        rationale: snap.committee.rationale,
      },
    },
  });
  return {
    ...market,
    ...applied,
    liquidation_margin_bps: applied.liquidation_threshold_bps - applied.max_ltv_bps,
    evaluation_count: market.evaluation_count + 1,
    last_evaluated_at: Math.floor(Date.now() / 1000),
    last_rationale: snap.committee.rationale,
  };
}
