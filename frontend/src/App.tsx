import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { connectWallet, fetchMarkets, hasWallet, runEvaluation } from "./chain";
import { ConsensusRunner } from "./components/ConsensusRunner";
import { RiskTerminal } from "./components/RiskTerminal";
import { AboutModal } from "./components/AboutModal";
import { Footer } from "./components/Footer";
import { Navbar } from "./components/Navbar";
import { MARKET_CATALOG } from "./catalog";
import { IS_DEPLOYED } from "./config";
import { GUEST_MARKETS, runGuestEvaluation } from "./guest";
import type { Market, RunState } from "./types";

const GUEST_KEY = "apexrisk.guest";
const readGuestPref = () => {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * With ten market cards the runner can sit well below the fold. After the user
 * picks a market, bring the runner into view, but only if it is not already
 * mostly visible, and without animation for users who prefer reduced motion.
 */
function revealRunner() {
  const el = document.getElementById("terminal");
  if (!el) return;
  if (el.getBoundingClientRect().top < window.innerHeight * 0.7) return;
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

const idleRun = (symbol: string, mode: RunState["mode"]): RunState => ({
  symbol,
  mode,
  steps: ["idle", "idle", "idle"],
  detail: "",
});

export default function App() {
  // Without a deployed address the only honest option is Guest mode.
  const [guest, setGuest] = useState(() => !IS_DEPLOYED || readGuestPref());
  const [markets, setMarkets] = useState<Market[]>(guest ? GUEST_MARKETS : []);
  const [loading, setLoading] = useState(!guest);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(MARKET_CATALOG[0].symbol);
  const [account, setAccount] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchMarkets();
      setMarkets(list);
      if (list.length && !list.some((m) => m.symbol === selected)) setSelected(list[0].symbol);
    } catch (e) {
      setLoadError(`Could not read markets from Studio Next: ${e instanceof Error ? e.message : String(e)}. Switch to Guest mode to explore offline.`);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    if (guest) {
      setMarkets(GUEST_MARKETS);
      setLoading(false);
      setLoadError(null);
    } else {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest]);

  const toggleGuest = (next: boolean) => {
    if (busy) return;
    setGuest(next);
    setRun(null);
    try {
      localStorage.setItem(GUEST_KEY, next ? "1" : "0");
    } catch {
      /* preference is optional */
    }
  };

  // Wired only to the Connect Wallet button; `isTrusted` is false for scripted clicks.
  const connect = async (e: MouseEvent<HTMLButtonElement>) => {
    setWalletError(null);
    try {
      setAccount(await connectWallet(e.nativeEvent.isTrusted));
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRun = async () => {
    const mode = guest ? "guest" : "onchain";
    let current = idleRun(selected, mode);
    // Any failure marks whichever step was active as failed.
    const emit = (patch: Partial<RunState>) => {
      current = { ...current, ...patch };
      if (patch.error) current.steps = current.steps.map((s) => (s === "active" ? "failed" : s)) as RunState["steps"];
      setRun(current);
    };
    setRun(current);
    setBusy(true);
    try {
      if (guest) {
        const market = markets.find((m) => m.symbol === selected);
        if (!market) throw new Error(`No ${selected} market loaded.`);
        const updated = await runGuestEvaluation(market, emit);
        setMarkets((ms) => ms.map((m) => (m.symbol === updated.symbol ? updated : m)));
      } else {
        if (!account) throw new Error("Connect a wallet first.");
        await runEvaluation(selected, account, emit);
        await load();
      }
    } catch (e) {
      if (!current.error) emit({ error: e instanceof Error ? e.message : String(e), detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const liveBlock = !IS_DEPLOYED
    ? "No contract is deployed on Studio Next yet. Live mode unlocks once scripts/deploy.py has run; Guest mode works now."
    : !account
      ? "Connect a wallet on Studio Next to submit a live evaluation."
      : null;

  return (
    <div className="min-h-screen">
      <Navbar
        guest={guest}
        guestLocked={!IS_DEPLOYED}
        busy={busy}
        account={account}
        walletAvailable={hasWallet()}
        onToggleGuest={toggleGuest}
        onConnect={connect}
        onDisconnect={() => setAccount(null)}
        onAbout={() => setAboutOpen(true)}
      />

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-apex/10 via-white/[0.02] to-transparent p-6 sm:p-8">
          <div className="text-[11px] uppercase tracking-[0.2em] text-apex">Autonomous risk terminal</div>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Collateral risk that reprices itself, before the crash.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mute">
            Validators scrape live orderbook depth and volatility, an LLM committee proposes a posture, and strict on-chain clamps make the final call.
          </p>
          <button
            onClick={() => setAboutOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-apex/40 bg-apex/10 px-4 py-2 text-xs font-semibold text-apex transition hover:bg-apex/20"
          >
            About ApexRisk · how it works
          </button>
        </section>
        {walletError && <p className="mt-3 text-xs text-crit">{walletError}</p>}

        <main className="mt-10 space-y-10">
          <RiskTerminal
            markets={markets}
            loading={loading}
            error={loadError}
            simulated={guest}
            selected={selected}
            onSelect={(s) => {
              if (!busy) {
                setSelected(s);
                setRun(null);
                revealRunner();
              }
            }}
          />
          <ConsensusRunner
            symbol={selected}
            guest={guest}
            run={run}
            busy={busy}
            canRunLive={IS_DEPLOYED && !!account}
            liveBlockReason={liveBlock}
            onRun={onRun}
          />
        </main>
      </div>

      <Footer />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
