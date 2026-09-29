import { MARKET_CATALOG } from "./catalog";
import {
  MAX_LIQ_STEP_BPS,
  MAX_LTV_STEP_DOWN_BPS,
  MAX_LTV_STEP_UP_BPS,
  MAX_RATE_STEP_BPS,
} from "./config";
import type { Market, Posture, PostureNumbers, RiskTier, RunState } from "./types";

// Offline / Guest mode: a pre-populated telemetry snapshot per asset plus a local
// port of the contract's safety envelope, so reviewers can walk the entire
// consensus flow without a funded wallet. Every guest result is labelled
// SIMULATED in the UI -- it is never presented as an on-chain outcome.

// The committee proposes numbers only; the tier is derived from the clamped LTV,
// exactly as on-chain (ApexRisk._tier_for_ltv).
type CommitteeProposal = PostureNumbers & { rationale: string };

// One pre-populated snapshot per catalog asset. The figures are illustrative mock
// data, not live prices. Every committee proposal is chosen so the guest demo tells
// a different story: most nudge a market a little, while SOL asks for a large
// tightening that the velocity limit turns into a multi-step walk.
export const GUEST_TELEMETRY: Record<string, { page: string; committee: CommitteeProposal }> = {
  ETH: {
    page: "ETHUSDT · 24h range $2,690–$2,790 (3.7%) · quote volume $9.1B · top-20 book depth $18.4M · spread 0.4 bps",
    committee: { max_ltv_bps: 7600, liquidation_threshold_bps: 8200, borrow_rate_base_bps: 380, rationale: "Deep books and a contained range support a modest LTV trim, not a cut." },
  },
  BTC: {
    page: "BTCUSDT · 24h range $60,850–$62,300 (2.4%) · quote volume $17.6B · top-20 book depth $52.1M · spread 0.1 bps",
    committee: { max_ltv_bps: 8100, liquidation_threshold_bps: 8600, borrow_rate_base_bps: 280, rationale: "Deepest liquidity and the calmest range keep BTC at the top of the envelope." },
  },
  SOL: {
    page: "SOLUSDT · 24h range $131–$149 (13.7%) · quote volume $2.4B · top-20 book depth $2.1M · spread 1.1 bps",
    committee: { max_ltv_bps: 4800, liquidation_threshold_bps: 5600, borrow_rate_base_bps: 780, rationale: "A 14% daily range on thin books warrants sharply tighter limits." },
  },
  AVAX: {
    page: "AVAXUSDT · 24h range $22.1–$24.0 (8.6%) · quote volume $310M · top-20 book depth $1.3M · spread 1.6 bps",
    committee: { max_ltv_bps: 6000, liquidation_threshold_bps: 6800, borrow_rate_base_bps: 560, rationale: "Mid-cap liquidity with an elevated range: trim LTV, raise the rate." },
  },
  LINK: {
    page: "LINKUSDT · 24h range $11.4–$12.1 (6.1%) · quote volume $190M · top-20 book depth $1.6M · spread 1.2 bps",
    committee: { max_ltv_bps: 6800, liquidation_threshold_bps: 7400, borrow_rate_base_bps: 430, rationale: "Steady volume and a moderate range; a small tightening is enough." },
  },
  ARB: {
    page: "ARBUSDT · 24h range $0.52–$0.58 (11.5%) · quote volume $95M · top-20 book depth $0.7M · spread 2.4 bps",
    committee: { max_ltv_bps: 5500, liquidation_threshold_bps: 6300, borrow_rate_base_bps: 620, rationale: "Thinner books and a wide range for an L2 token justify a lower LTV." },
  },
  OP: {
    page: "OPUSDT · 24h range $1.42–$1.55 (9.2%) · quote volume $80M · top-20 book depth $0.8M · spread 2.1 bps",
    committee: { max_ltv_bps: 5600, liquidation_threshold_bps: 6400, borrow_rate_base_bps: 600, rationale: "Comparable to ARB: moderate depth, wide range; tighten slightly." },
  },
  NEAR: {
    page: "NEARUSDT · 24h range $3.05–$3.38 (10.8%) · quote volume $120M · top-20 book depth $0.9M · spread 1.9 bps",
    committee: { max_ltv_bps: 5400, liquidation_threshold_bps: 6200, borrow_rate_base_bps: 650, rationale: "Volatile week on modest depth; pull LTV toward the lower end." },
  },
  SUI: {
    page: "SUIUSDT · 24h range $1.71–$1.98 (15.8%) · quote volume $260M · top-20 book depth $0.6M · spread 2.8 bps",
    committee: { max_ltv_bps: 5000, liquidation_threshold_bps: 5900, borrow_rate_base_bps: 720, rationale: "The widest range in the catalog on thin books: the tightest posture." },
  },
  BNB: {
    page: "BNBUSDT · 24h range $548–$566 (3.3%) · quote volume $610M · top-20 book depth $6.4M · spread 0.8 bps",
    committee: { max_ltv_bps: 7500, liquidation_threshold_bps: 8000, borrow_rate_base_bps: 400, rationale: "Calm range and healthy depth: the current posture already fits." },
  },
};

/** Mirror of ApexRisk._tier_for_ltv. */
export function tierForLtv(ltv: number): RiskTier {
  if (ltv >= 7500) return "LOW";
  if (ltv >= 5500) return "MODERATE";
  if (ltv >= 3500) return "HIGH";
  return "CRITICAL";
}

/** All ten catalog markets, starting from the same baselines the seed script registers. */
export const GUEST_MARKETS: Market[] = MARKET_CATALOG.map((e) => ({
  symbol: e.symbol,
  active: true,
  telemetry_url: e.telemetryUrl,
  secondary_telemetry_url: "",
  max_ltv_bps: e.ltv,
  liquidation_threshold_bps: e.liq,
  liquidation_margin_bps: e.liq - e.ltv,
  borrow_rate_base_bps: e.rate,
  risk_tier: tierForLtv(e.ltv),
  circuit_breaker: false,
  evaluation_count: 0,
  last_evaluated_at: 0,
  updated_at: 0,
  is_stale: true, // never evaluated, exactly like a freshly registered market on-chain
  last_rationale: "",
}));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Mirror of ApexRisk._apply_invariants. */
export function applyInvariants(p: CommitteeProposal): Posture {
  let ltv = clamp(p.max_ltv_bps, 2000, 8500);
  const liq = clamp(p.liquidation_threshold_bps, ltv + 300, 9800);
  if (liq < ltv + 300) ltv = clamp(liq - 300, 2000, 8500);
  return {
    max_ltv_bps: ltv,
    liquidation_threshold_bps: liq,
    borrow_rate_base_bps: clamp(p.borrow_rate_base_bps, 100, 2500),
    risk_tier: tierForLtv(ltv),
  };
}

/** Mirror of ApexRisk._step: move `prev` toward `target` by a bounded amount. */
export function step(prev: number, target: number, maxDown: number, maxUp: number): number {
  const delta = target - prev;
  return prev + Math.max(-maxDown, Math.min(maxUp, delta));
}

/** Mirror of ApexRisk._velocity_limited: one bounded step, then the invariants again. */
export function velocityLimited(prior: PostureNumbers, target: Posture): Posture {
  return applyInvariants({
    max_ltv_bps: step(prior.max_ltv_bps, target.max_ltv_bps, MAX_LTV_STEP_DOWN_BPS, MAX_LTV_STEP_UP_BPS),
    liquidation_threshold_bps: step(prior.liquidation_threshold_bps, target.liquidation_threshold_bps, MAX_LIQ_STEP_BPS, MAX_LIQ_STEP_BPS),
    borrow_rate_base_bps: step(prior.borrow_rate_base_bps, target.borrow_rate_base_bps, MAX_RATE_STEP_BPS, MAX_RATE_STEP_BPS),
    rationale: "",
  });
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
  const target = applyInvariants(snap.committee);
  const applied = velocityLimited(prior, target);
  const now = Math.floor(Date.now() / 1000);
  emit({
    steps: ["done", "done", "done"],
    status: "SIMULATED",
    votes: { agree: 5, total: 5, simulated: true },
    detail: "Simulated consensus complete. Nothing was written on-chain.",
    result: {
      prior,
      applied,
      target,
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
        },
        target_posture: target,
        applied_posture: applied,
        prior_posture: prior,
        velocity_limits_bps: {
          ltv_step_down: MAX_LTV_STEP_DOWN_BPS,
          ltv_step_up: MAX_LTV_STEP_UP_BPS,
          rate_step: MAX_RATE_STEP_BPS,
          liquidation_step: MAX_LIQ_STEP_BPS,
        },
        rationale: snap.committee.rationale,
      },
    },
  });
  // The simulator does not enforce the 30-minute cooldown, so reviewers can
  // click through several steps; on-chain the contract does.
  return {
    ...market,
    ...applied,
    liquidation_margin_bps: applied.liquidation_threshold_bps - applied.max_ltv_bps,
    evaluation_count: market.evaluation_count + 1,
    last_evaluated_at: now,
    updated_at: now,
    is_stale: false,
    last_rationale: snap.committee.rationale,
  };
}
