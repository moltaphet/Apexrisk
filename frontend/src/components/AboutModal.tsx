import { useEffect } from "react";
import { AlertTriangle, Cpu, Globe, ShieldCheck, Users, X } from "lucide-react";

const MECHANISM = [
  { icon: Globe, title: "Multi-validator web scraping", body: "Each GenVM validator independently renders the registered telemetry page: live orderbook depth, implied volatility and funding." },
  { icon: Users, title: "LLM consensus committee", body: "Validators poll an institutional-risk LLM committee and ratify a posture only when tier and every basis-point figure agree within tolerance." },
  { icon: ShieldCheck, title: "On-chain safety clamps", body: "Deterministic code has the final word: LTV bounded 20–85%, liquidation margin ≥ 300 bps, borrow rate 1–25%." },
];

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="About ApexRisk">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative my-8 w-full max-w-3xl rounded-2xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-2 text-mute hover:bg-white/5 hover:text-white">
          <X size={18} />
        </button>
        <div className="text-[11px] uppercase tracking-[0.2em] text-apex">Protocol architecture</div>
        <h2 className="mt-1 font-display text-3xl font-bold">About ApexRisk</h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-crit/30 bg-crit/5 p-4">
            <div className="flex items-center gap-2 font-display font-semibold text-crit"><AlertTriangle size={16} /> The problem</div>
            <p className="mt-2 text-xs leading-relaxed text-mute">
              Lending protocols rely on centralized off-chain risk firms and slow DAO votes to tune collateral parameters. In a flash crash the parameters lag the market, liquidations fail to keep pace, and the protocol is left holding bad debt.
            </p>
          </div>
          <div className="rounded-xl border border-apex/30 bg-apex/5 p-4">
            <div className="flex items-center gap-2 font-display font-semibold text-apex"><Cpu size={16} /> The solution</div>
            <p className="mt-2 text-xs leading-relaxed text-mute">
              ApexRisk runs autonomous risk evaluations on-chain through the GenLayer GenVM. Anyone can trigger a re-underwrite from live telemetry, and the result only lands if validators reach consensus and pass the invariants.
            </p>
          </div>
        </div>

        <h3 className="mt-7 font-display text-lg font-semibold">Mechanism</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {MECHANISM.map((m, i) => (
            <li key={m.title} className="rounded-xl border border-line bg-ink/60 p-4">
              <div className="flex items-center gap-2 text-apex">
                <span className="grid h-6 w-6 place-items-center rounded-full border border-apex/40 text-[11px]">{i + 1}</span>
                <m.icon size={16} />
              </div>
              <div className="mt-2 text-sm font-semibold">{m.title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-mute">{m.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-[11px] leading-relaxed text-mute">
          The committee only advises. A tripped circuit breaker freezes evaluation, telemetry text is sanitised before it reaches the model, and every evaluation is appended to an immutable on-chain history (prior, committee and applied posture).
        </p>
      </div>
    </div>
  );
}
