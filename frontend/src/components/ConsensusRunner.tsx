import { useState } from "react";
import { Braces, CheckCircle2, ChevronDown, ExternalLink, Loader2, Play, XCircle, Circle } from "lucide-react";
import { explorerTxUrl } from "../config";
import { GUEST_TELEMETRY } from "../guest";
import type { Posture, RunState, StepState } from "../types";
import { TierBadge, pct } from "./RiskTerminal";

const STEPS = [
  { title: "Telemetry Fetching (Orderbook depth & IV)", hint: "Market state read; evaluation request packaged and signed." },
  { title: "GenVM Multi-Validator LLM Consensus", hint: "Validators scrape telemetry, run the risk committee and vote." },
  { title: "On-Chain Finality & Parameter Ratification", hint: "Accepted result re-read from the contract before success is shown." },
] as const;

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="text-apex" size={22} />;
  if (state === "active")
    return (
      <span className="relative grid h-[22px] w-[22px] place-items-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn/40" />
        <Loader2 className="relative animate-spin text-warn" size={18} />
      </span>
    );
  if (state === "failed") return <XCircle className="text-crit" size={22} />;
  return <Circle className="text-line" size={22} />;
}

function Delta({ label, from, to, fmt = pct }: { label: string; from: number; to: number; fmt?: (n: number) => string }) {
  const diff = to - from;
  return (
    <div className="rounded-md border border-line bg-ink p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-mute">{label}</div>
      <div className="mt-1 flex items-baseline gap-2 tabular-nums">
        <span className="text-mute line-through decoration-line">{fmt(from)}</span>
        <span className="font-display text-lg font-semibold">{fmt(to)}</span>
      </div>
      <div className={`text-[11px] ${diff === 0 ? "text-mute" : diff > 0 ? "text-apex" : "text-hot"}`}>
        {diff === 0 ? "unchanged" : `${diff > 0 ? "+" : ""}${(diff / 100).toFixed(2)} pts`}
      </div>
    </div>
  );
}

function Result({ prior, applied, rationale }: { prior: Posture; applied: Posture; rationale: string }) {
  return (
    <div className="mt-5 rounded-lg border border-apex/30 bg-apex/5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.16em] text-apex">Committee result</span>
        <span className="flex items-center gap-2 text-xs text-mute">
          <TierBadge tier={prior.risk_tier} /> → <TierBadge tier={applied.risk_tier} />
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Delta label="Max LTV" from={prior.max_ltv_bps} to={applied.max_ltv_bps} />
        <Delta label="Liq. threshold" from={prior.liquidation_threshold_bps} to={applied.liquidation_threshold_bps} />
        <Delta label="Base borrow" from={prior.borrow_rate_base_bps} to={applied.borrow_rate_base_bps} />
      </div>
      {rationale && <p className="mt-3 text-xs leading-relaxed text-mute">“{rationale}”</p>}
    </div>
  );
}

function Votes({ run }: { run: RunState }) {
  const v = run.votes;
  if (!v) {
    // Live mode: the RPC exposes phase, not per-validator votes, so show only what is known.
    return run.status ? <div className="text-[11px] text-mute">validator phase: <span className="text-white">{run.status}</span></div> : null;
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-mute">
        <span>Validator votes{v.simulated && <span className="ml-1.5 text-warn">(simulated)</span>}</span>
        <span className="tabular-nums text-white">{v.agree}/{v.total} agree</span>
      </div>
      <div className="flex gap-1.5" role="img" aria-label={`${v.agree} of ${v.total} validators agree`}>
        {Array.from({ length: v.total }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-500 ${i < v.agree ? "bg-apex" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}

function PayloadDrawer({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4 rounded-lg border border-line bg-ink">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-mute hover:text-white"
      >
        <span className="inline-flex items-center gap-2"><Braces size={14} className="text-apex" /> Committee output · JSON payload</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-line p-3 text-[11px] leading-relaxed text-emerald-200/90">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface Props {
  symbol: string;
  guest: boolean;
  run: RunState | null;
  busy: boolean;
  canRunLive: boolean;
  liveBlockReason: string | null;
  onRun: () => void;
}

export function ConsensusRunner({ symbol, guest, run, busy, canRunLive, liveBlockReason, onRun }: Props) {
  const steps = run?.steps ?? (["idle", "idle", "idle"] as StepState[]);
  const blocked = !guest && !canRunLive;
  const allDone = steps.every((s) => s === "done");

  return (
    <section id="terminal" aria-label="Live consensus runner" className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Live Consensus Runner</h2>
        <button
          onClick={onRun}
          disabled={busy || blocked}
          className="inline-flex items-center gap-2 rounded-md bg-apex px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {busy ? "Running…" : `${guest ? "Simulate" : "Evaluate"} ${symbol} risk`}
        </button>
      </div>

      {blocked && liveBlockReason && <p className="mt-3 text-xs text-warn">{liveBlockReason}</p>}

      {guest && (
        <div className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-3 text-xs">
          <div className="font-semibold text-warn">Guest mode · pre-populated telemetry · SIMULATED</div>
          <div className="mt-1 text-mute">{(GUEST_TELEMETRY[symbol] ?? GUEST_TELEMETRY.ETH).page}</div>
        </div>
      )}

      <ol className="mt-5 space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`flex gap-3 rounded-lg border p-3 ${steps[i] === "active" ? "border-warn/40 bg-warn/5 pulse-ring" : "border-line"}`}>
            <StepIcon state={steps[i]} />
            <div>
              <div className="text-sm font-semibold">Step {i + 1}: {s.title}</div>
              <div className="text-[11px] text-mute">{s.hint}</div>
            </div>
          </li>
        ))}
      </ol>

      {run && !run.error && (run.votes || run.status) && (steps[1] !== "idle") && <div className="mt-4"><Votes run={run} /></div>}

      {run && (
        <div className="mt-4 space-y-1 text-xs" aria-live="polite">
          <div className={run.error ? "text-crit" : "text-mute"}>{run.detail}</div>
          {run.status && !run.error && <div className="text-mute">status: <span className="text-white">{run.status}</span></div>}
          {run.txHash && (
            <a href={explorerTxUrl(run.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-apex hover:underline">
              tx {run.txHash.slice(0, 10)}…{run.txHash.slice(-6)} <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {allDone && run?.result && !run.error && (
        <>
          <Result prior={run.result.prior} applied={run.result.applied} rationale={run.result.rationale} />
          <PayloadDrawer payload={run.result.payload} />
          {run.mode === "guest" && <p className="mt-2 text-[11px] text-warn">Simulated outcome, nothing was written to the chain.</p>}
        </>
      )}
    </section>
  );
}
