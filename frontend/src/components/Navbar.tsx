import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, LogOut, Menu, ShieldCheck, Wallet, X } from "lucide-react";
import { APP_VERSION, CHAIN_ID, CHAIN_NAME, CONTRACT_ADDRESS, IS_DEPLOYED, explorerAddressUrl, EXPLORER_URL } from "../config";

// The nav's Explorer link goes straight to the contract once one is configured.
const EXPLORER_HREF = IS_DEPLOYED ? explorerAddressUrl(CONTRACT_ADDRESS) : EXPLORER_URL;

interface Props {
  guest: boolean;
  guestLocked: boolean;
  busy: boolean;
  account: string | null;
  walletAvailable: boolean;
  onToggleGuest: (guest: boolean) => void;
  onConnect: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onDisconnect: () => void;
  onAbout: () => void;
}

/** 0x1f9813eeb2de53134af5c824ca156ce82c4eb0fa -> 0x1f...0fa */
const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-3)}`;

// Every label in the header is one line, always: nothing here may wrap.
const linkCls =
  "whitespace-nowrap text-xs font-medium text-white/70 transition-colors hover:text-white lg:text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-apex";

const MODES = [
  { guest: false, label: "Live", title: "Read and write the deployed contract" },
  { guest: true, label: "Guest", title: "Simulated snapshot: no wallet or funds needed" },
] as const;

export function Navbar(p: Props) {
  const [menu, setMenu] = useState(false);
  const [wallet, setWallet] = useState(false);
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) setWallet(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const modeDisabled = (guest: boolean) => p.busy || (!guest && p.guestLocked);
  const modeTitle = (m: (typeof MODES)[number]) => (!m.guest && p.guestLocked ? "No contract deployed yet" : m.title);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-ink/75 backdrop-blur-xl">
      {/* One row, never wrapping. Each group is shrink-0 so a tight viewport hides
          the optional pieces (see breakpoints) instead of squeezing text onto two lines. */}
      <div className="mx-auto flex h-16 w-full max-w-7xl flex-nowrap items-center justify-between px-4 sm:px-6">
        {/* Left: brand */}
        <div className="flex shrink-0 items-center gap-3">
          <a href="#terminal" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-apex to-emerald-700 text-ink shadow-[0_0_20px_-4px_rgba(52,211,153,.7)]">
              <ShieldCheck size={20} strokeWidth={2.4} />
            </span>
            <span className="whitespace-nowrap font-display text-lg font-bold tracking-tight">
              Apex<span className="text-apex">Risk</span>
            </span>
          </a>
          <span className="hidden whitespace-nowrap rounded border border-white/10 px-2 py-0.5 font-mono text-[11px] text-white/50 sm:inline-block">
            {APP_VERSION}
          </span>
          <span
            title={`${CHAIN_NAME} (${CHAIN_ID})`}
            className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-apex/30 bg-apex/10 px-2.5 py-1 text-xs text-apex xl:inline-flex"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-apex opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-apex" />
            </span>
            Studio Next ({CHAIN_ID})
          </span>
        </div>

        {/* Center: navigation (desktop only; the menu button covers smaller screens) */}
        <div className="hidden shrink-0 items-center gap-5 lg:flex">
          <a href="#terminal" className={linkCls}>Terminal</a>
          <a href="#markets" className={linkCls}>Markets</a>
          <button type="button" onClick={p.onAbout} className={linkCls}>Architecture</button>
          <a href={EXPLORER_HREF} target="_blank" rel="noreferrer" className={linkCls}>Explorer ↗</a>
        </div>

        {/* Right: mode + wallet */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div
            role="group"
            aria-label="Data mode"
            className="hidden shrink-0 items-center rounded-full border border-white/10 bg-panel p-0.5 sm:flex"
          >
            {MODES.map((m) => {
              const on = p.guest === m.guest;
              return (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => p.onToggleGuest(m.guest)}
                  disabled={modeDisabled(m.guest)}
                  aria-pressed={on}
                  title={modeTitle(m)}
                  className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? (m.guest ? "bg-warn/20 text-warn" : "bg-apex/20 text-apex") : "text-white/60 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <div ref={walletRef} className="relative shrink-0">
            {p.account ? (
              <>
                <button
                  type="button"
                  onClick={() => setWallet((w) => !w)}
                  aria-expanded={wallet}
                  aria-label={`Wallet ${p.account}`}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-apex/40 bg-panel px-3.5 py-2 font-mono text-xs font-semibold hover:border-apex"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-apex" />
                  {short(p.account)}
                  <ChevronDown size={14} className="shrink-0 text-mute" />
                </button>
                {wallet && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-panel p-3 shadow-2xl">
                    <div className="whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-mute">Connected</div>
                    {/* The full address may wrap here: this is a menu, not the header row. */}
                    <div className="mt-1 break-all font-mono text-xs">{p.account}</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-apex/30 bg-apex/10 px-2 py-0.5 text-[11px] text-apex">
                      {CHAIN_NAME} · {CHAIN_ID}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWallet(false);
                        p.onDisconnect();
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-crit/40 px-3 py-2 text-xs text-crit hover:bg-crit/10"
                    >
                      <LogOut size={14} /> Disconnect
                    </button>
                    <p className="mt-2 text-[10px] leading-snug text-mute">Disconnects the app only; revoke site access in your wallet to fully sign out.</p>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={p.onConnect}
                disabled={!p.walletAvailable}
                title={p.walletAvailable ? undefined : "No EVM wallet detected"}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-apex via-emerald-400 to-cyan-400 px-3.5 py-2 text-xs font-bold text-ink shadow-[0_0_24px_-6px_rgba(52,211,153,.8)] transition hover:brightness-110 disabled:opacity-40 sm:px-4"
              >
                <Wallet size={14} className="hidden shrink-0 sm:block" />
                {p.walletAvailable ? (
                  <>
                    <span className="sm:hidden">Connect</span>
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </>
                ) : (
                  "No Wallet"
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            className="shrink-0 rounded-md p-2 text-white/70 hover:text-white lg:hidden"
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Small screens: the same destinations, stacked, plus the mode toggle (hidden in the bar below sm). */}
      {menu && (
        <div className="space-y-1 border-t border-white/10 px-4 py-3 lg:hidden">
          <a href="#terminal" onClick={() => setMenu(false)} className={`block py-1.5 ${linkCls}`}>Terminal</a>
          <a href="#markets" onClick={() => setMenu(false)} className={`block py-1.5 ${linkCls}`}>Markets</a>
          <button type="button" onClick={() => { setMenu(false); p.onAbout(); }} className={`block w-full py-1.5 text-left ${linkCls}`}>Architecture</button>
          <a href={EXPLORER_HREF} target="_blank" rel="noreferrer" className={`block py-1.5 ${linkCls}`}>Explorer ↗</a>
          <div className="flex gap-2 pt-2">
            {MODES.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => p.onToggleGuest(m.guest)}
                disabled={modeDisabled(m.guest)}
                aria-pressed={p.guest === m.guest}
                title={modeTitle(m)}
                className={`flex-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                  p.guest === m.guest ? "border-apex/50 bg-apex/10 text-apex" : "border-white/10 text-white/60"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
