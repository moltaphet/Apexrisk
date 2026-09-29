export type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface Market {
  symbol: string;
  active: boolean;
  telemetry_url: string;
  secondary_telemetry_url: string;
  max_ltv_bps: number;
  liquidation_threshold_bps: number;
  liquidation_margin_bps: number;
  borrow_rate_base_bps: number;
  risk_tier: RiskTier;
  circuit_breaker: boolean;
  evaluation_count: number;
  /** Unix seconds of the last evaluation; 0 = never evaluated. */
  last_evaluated_at: number;
  updated_at: number;
  /** True when never evaluated, or last evaluated more than 24h ago. */
  is_stale: boolean;
  last_rationale: string;
}

/** Numeric posture without a tier: what a committee proposes or a target clamps to. */
export type PostureNumbers = Omit<Posture, "risk_tier">;

export interface Posture {
  max_ltv_bps: number;
  liquidation_threshold_bps: number;
  borrow_rate_base_bps: number;
  risk_tier: RiskTier;
}

export interface HistoryRecord {
  symbol: string;
  evaluation_index: number;
  evaluated_at: number;
  /** Index of this market's previous record in the global log; -1 = none. */
  prev: number;
  /** Raw committee answer. Numbers only: the tier is derived from the LTV. */
  committee_posture: PostureNumbers;
  /** The committee answer after the on-chain clamps (the goal). */
  target_posture: Posture;
  /** What was actually committed: one velocity-limited step toward the target. */
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
  result?: {
    prior: Posture;
    applied: Posture;
    /** Where the committee wants the market; `applied` may still be mid-walk toward it. */
    target?: Posture;
    rationale: string;
    finalized: boolean;
    payload: unknown;
  };
}
