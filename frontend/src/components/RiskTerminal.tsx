import { Activity, Clock, OctagonAlert, ShieldCheck } from "lucide-react";
import type { Market, RiskTier } from "../types";

export const TIER_STYLE: Record<RiskTier, string> = {
  LOW: "text-apex border-apex/40 bg-apex/10",
  MODERATE: "text-warn border-warn/40 bg-warn/10",
  HIGH: "text-hot border-hot/40 bg-hot/10",
  CRITICAL: "text-crit border-crit/50 bg-crit/10",
};

const GLOW: Record<RiskTier, string> = {
  LOW: "shadow-[0_0_40px_-18px_rgba(52,211,153,.9)]",
  MODERATE: "shadow-[0_0_40px_-18px_rgba(251,191,36,.9)]",
  HIGH: "shadow-[0_0_40px_-18px_rgba(251,146,60,.9)]",
  CRITICAL: "shadow-[0_0_40px_-18px_rgba(248,113,113,.9)]",
};

export const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold tracking-widest ${TIER_STYLE[tier] ?? TIER_STYLE.MODERATE}`}>
      {tier}
    </span>
  );
}

/** Safety colour from the liquidation margin (bps between LTV and threshold). */
function marginTone(marginBps: number) {
  if (marginBps >= 600) return { bar: "from-emerald-500 to-apex", text: "text-apex", label: "Comfortable" };
  if (marginBps >= 400) return { bar: "from-amber-500 to-warn", text: "text-warn", label: "Watch" };
  return { bar: "from-red-600 to-crit", text: "text-crit", label: "Thin" };
}

function LtvBar({ ltv, liq, margin }: { ltv: number; liq: number; margin: number }) {
  const tone = marginTone(margin);
  const l = Math.min(100, ltv / 100);
  const t = Math.min(100, liq / 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.14em]">
        <span className="text-mute">LTV vs liquidation</span>
        <span className={tone.text}>{tone.label} · {pct(margin)} buffer</span>
      </div>
      <div
        className="relative h-3 rounded-full bg-ink ring-1 ring-line"
        role="img"
        aria-label={`LTV ${pct(ltv)}, liquidation threshold ${pct(liq)}`}
      >
        <div className={`absolute inset-y-0 left-0 rounded-l-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${l}%` }} />
        {/* margin zone between LTV and the liquidation threshold */}
        <div className="absolute inset-y-0 bg-white/10" style={{ left: `${l}%`, width: `${Math.max(0, t - l)}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-crit" style={{ left: `${t}%` }} />
      </div>
      <div className="relative mt-1 h-3 text-[10px] tabular-nums text-mute">
        <span className="absolute -translate-x-1/2" style={{ left: `${Math.min(Math.max(l, 6), 94)}%` }}>{pct(ltv)}</span>
        <span className="absolute -translate-x-1/2 text-crit" style={{ left: `${Math.min(Math.max(t, l + 12, 10), 94)}%` }}>{pct(liq)}</span>
      </div>
    </div>
  );
}

/** Freshness of the committed posture: never evaluated / stale (>24h) / updated N ago. */
function Freshness({ m }: { m: Market }) {
  if (m.last_evaluated_at === 0) {
    return <span className="inline-flex items-center gap-1 text-warn"><Clock size={12} /> never evaluated · seed posture</span>;
  }
  if (m.is_stale) {
    return <span className="inline-flex items-center gap-1 text-warn"><Clock size={12} /> stale · over 24h old</span>;
  }
  const mins = Math.max(0, Math.floor((Date.now() / 1000 - m.updated_at) / 60));
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
  return <span className="inline-flex items-center gap-1 text-mute"><Clock size={12} /> updated {ago}</span>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-mute">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

interface Props {
  markets: Market[];
  loading: boolean;
  error: string | null;
  simulated: boolean;
  selected: string;
  onSelect: (symbol: string) => void;
}

export function RiskTerminal({ markets, loading, error, simulated, selected, onSelect }: Props) {
  return (
    <section id="markets" aria-label="Collateral markets" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Activity size={18} className="text-apex" /> Collateral Markets
          </h2>
          <p className="mt-1 text-xs text-mute">Select a market to re-underwrite it in the consensus runner below.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] ${simulated ? "border-warn/40 bg-warn/10 text-warn" : "border-apex/30 bg-apex/10 text-apex"}`}>
          {simulated ? "SIMULATED · guest snapshot" : "on-chain · Studio Next"}
        </span>
      </div>

      {error && <div className="mb-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{error}</div>}

      {!loading && !error && markets.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-relaxed text-mute backdrop-blur-md">
          <div className="font-display text-base font-semibold text-white">No markets are registered on this contract yet</div>
          <p className="mt-2">
            The contract is deployed and answering, but the governor has not run <code className="text-apex">register_market</code> for any asset.
            Seed ETH, BTC and SOL with <code className="text-apex">scripts/interact_live.py --seed</code>, or switch to{" "}
            <span className="text-warn">Guest</span> mode in the navbar to walk the full consensus flow on a simulated snapshot.
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        {loading && markets.length === 0
          ? [0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl border border-line bg-panel" />)
          : markets.map((m) => {
              const active = m.symbol === selected;
              return (
                <button
                  key={m.symbol}
                  onClick={() => onSelect(m.symbol)}
                  aria-pressed={active}
                  className={`group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-5 text-left backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-apex ${
                    active ? `border-apex/60 ${GLOW[m.risk_tier] ?? ""}` : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-apex/10 blur-3xl transition group-hover:bg-apex/20" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-ink font-display text-xs font-bold">{m.symbol.slice(0, 3)}</span>
                      <span className="font-display text-xl font-bold tracking-wide">{m.symbol}</span>
                    </div>
                    <TierBadge tier={m.risk_tier} />
                  </div>

                  <div className="relative mt-5">
                    <LtvBar ltv={m.max_ltv_bps} liq={m.liquidation_threshold_bps} margin={m.liquidation_margin_bps} />
                  </div>

                  <div className="relative mt-5 grid grid-cols-2 gap-4">
                    <Metric label="Current LTV" value={pct(m.max_ltv_bps)} sub={`liq @ ${pct(m.liquidation_threshold_bps)}`} />
                    <Metric label="Liq. margin" value={pct(m.liquidation_margin_bps)} sub="above LTV" />
                    <Metric label="Base borrow" value={pct(m.borrow_rate_base_bps)} sub="APR floor" />
                    <Metric label="Evaluations" value={String(m.evaluation_count)} sub={m.active ? "market active" : "market paused"} />
                  </div>

                  <div className="relative mt-4 text-[11px]"><Freshness m={m} /></div>

                  <div className="relative mt-2 flex items-center justify-between text-[11px]">
                    {m.circuit_breaker ? (
                      <span className="inline-flex items-center gap-1 text-crit"><OctagonAlert size={13} /> circuit breaker tripped</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-mute"><ShieldCheck size={13} /> invariants enforced</span>
                    )}
                    <span className={active ? "text-apex" : "text-mute/0 group-hover:text-mute"}>{active ? "● selected" : "select →"}</span>
                  </div>
                  {m.last_rationale && <p className="relative mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-mute">{m.last_rationale}</p>}
                </button>
              );
            })}
      </div>
    </section>
  );
}
