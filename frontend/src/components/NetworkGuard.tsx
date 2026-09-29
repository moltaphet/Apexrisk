import { Loader2, TriangleAlert } from "lucide-react";
import type { MouseEvent } from "react";
import { chainLabel } from "../chain";
import { CHAIN_ID, CHAIN_NAME } from "../config";

interface Props {
  /** The wallet's current chain id (null when unknown). */
  chainId: number | null;
  switching: boolean;
  onSwitch: (e: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Shown when a connected wallet is on any network other than Studio Next (61997),
 * for example Studio Dev (61999). Transactions from another network cannot reach
 * ApexRisk, so the runner is disabled until the wallet switches. The button is the
 * only thing that prompts, and only when clicked.
 */
export function NetworkGuard({ chainId, switching, onSwitch }: Props) {
  return (
    <div role="alert" className="border-b border-crit/40 bg-crit/10">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-crit" />
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold text-white">Wrong network</div>
            <p className="text-xs leading-relaxed text-white/70">
              Your wallet is on {chainLabel(chainId)}. ApexRisk runs on {CHAIN_NAME} ({CHAIN_ID}); transactions sent from another network will fail.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitch}
          disabled={switching}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-crit px-4 py-2 text-xs font-bold text-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {switching && <Loader2 size={14} className="animate-spin" />}
          Switch to Studio Next
        </button>
      </div>
    </div>
  );
}
