export type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface Market {
  symbol: string;
  active: boolean;
  telemetry_url: string;
  max_ltv_bps: number;
  liquidation_threshold_bps: number;
  liquidation_margin_bps: number;
  borrow_rate_base_bps: number;
  risk_tier: RiskTier;
  circuit_breaker: boolean;
  evaluation_count: number;
  last_rationale: string;
}

export interface Posture {
  max_ltv_bps: number;
  liquidation_threshold_bps: number;
  borrow_rate_base_bps: number;
  risk_tier: RiskTier;
}

export interface HistoryRecord {
  symbol: string;
  evaluation_index: number;
  /** Numbers only: the committee never sets the tier (it is derived from LTV). */
  committee_posture: Omit<Posture, "risk_tier">;
  applied_posture: Posture;
  prior_posture: Posture;
  rationale: string;
}

/** 0 = idle, 1..3 = active step, 4 = all steps done. */
export type StepState = "idle" | "active" | "done" | "failed";

export interface RunState {
  symbol: string;
  mode: "onchain" | "guest";
  steps: [StepState, StepState, StepState];
  detail: string;
  txHash?: string;
  status?: string;
  error?: string;
  votes?: { agree: number; total: number; simulated: boolean };
  result?: { prior: Posture; applied: Posture; rationale: string; finalized: boolean; payload: unknown };
}
