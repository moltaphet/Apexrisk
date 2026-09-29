import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ExternalLink, LogOut, Menu, ShieldCheck, Wallet, X } from "lucide-react";
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

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-3)}`;

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

  const links = [
    { label: "Terminal", href: "#terminal" },
    { label: "Collateral Markets", href: "#markets" },
  ];
  const linkCls = "rounded-md px-3 py-1.5 text-sm text-mute transition hover:bg-white/5 hover:text-white";

  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#terminal" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-apex to-emerald-700 text-ink shadow-[0_0_20px_-4px_rgba(52,211,153,.7)]">
            <ShieldCheck size={20} strokeWidth={2.4} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Apex<span className="text-apex">Risk</span>
          </span>
          <span className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-mute sm:inline">{APP_VERSION}</span>
        </a>

        <span className="hidden items-center gap-2 rounded-full border border-apex/30 bg-apex/10 px-3 py-1 text-[11px] text-apex xl:inline-flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-apex opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-apex" />
          </span>
          {CHAIN_NAME} ({CHAIN_ID})
        </span>

        <div className="mx-auto hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a key={l.label} href={l.href} className={linkCls}>{l.label}</a>
          ))}
          <button onClick={p.onAbout} className={linkCls}>Architecture / About</button>
          <a href={EXPLORER_HREF} target="_blank" rel="noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
            Explorer <ExternalLink size={12} />
          </a>
        </div>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <div
            role="group"
            aria-label="Data mode"
            className="hidden rounded-full border border-line bg-panel p-0.5 text-[11px] sm:flex"
          >
            {([
              [false, "Live Contract"],
              [true, "Studio Guest"],
            ] as const).map(([g, label]) => {
              const on = p.guest === g;
              const disabled = p.busy || (!g && p.guestLocked);
              return (
                <button
                  key={label}
                  onClick={() => p.onToggleGuest(g)}
                  disabled={disabled}
                  aria-pressed={on}
                  title={!g && p.guestLocked ? "No contract deployed yet" : undefined}
                  className={`rounded-full px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? (g ? "bg-warn/20 text-warn" : "bg-apex/20 text-apex") : "text-mute hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div ref={walletRef} className="relative">
            {p.account ? (
              <>
                <button
                  onClick={() => setWallet((w) => !w)}
                  aria-expanded={wallet}
                  className="inline-flex items-center gap-2 rounded-full border border-apex/40 bg-panel px-3.5 py-2 text-xs font-semibold hover:border-apex"
                >
                  <span className="h-2 w-2 rounded-full bg-apex" />
                  {short(p.account)}
                  <ChevronDown size={14} className="text-mute" />
                </button>
                {wallet && (
                  <div className="absolute right-0 mt-2 w-60 rounded-xl border border-line bg-panel p-3 shadow-2xl">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-mute">Connected</div>
                    <div className="mt-1 break-all text-xs">{p.account}</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-apex/30 bg-apex/10 px-2 py-0.5 text-[11px] text-apex">
                      {CHAIN_NAME} · {CHAIN_ID}
                    </div>
                    <button
                      onClick={() => {
                        setWallet(false);
                        p.onDisconnect();
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-crit/40 px-3 py-2 text-xs text-crit hover:bg-crit/10"
                    >
                      <LogOut size={14} /> Disconnect
                    </button>
                    <p className="mt-2 text-[10px] leading-snug text-mute">Disconnects the app only; revoke site access in your wallet to fully sign out.</p>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={p.onConnect}
                disabled={!p.walletAvailable}
                title={p.walletAvailable ? undefined : "No EVM wallet detected"}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-apex via-emerald-400 to-cyan-400 px-4 py-2 text-xs font-bold text-ink shadow-[0_0_24px_-6px_rgba(52,211,153,.8)] transition hover:brightness-110 disabled:opacity-40"
              >
                <Wallet size={14} /> {p.walletAvailable ? "Connect Wallet" : "No Wallet Found"}
              </button>
            )}
          </div>

          <button onClick={() => setMenu((m) => !m)} aria-label="Menu" className="rounded-md p-2 text-mute hover:text-white lg:hidden">
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {menu && (
        <div className="space-y-1 border-t border-line px-4 py-3 lg:hidden">
          {links.map((l) => (
            <a key={l.label} href={l.href} onClick={() => setMenu(false)} className={`block ${linkCls}`}>{l.label}</a>
          ))}
          <button onClick={() => { setMenu(false); p.onAbout(); }} className={`block w-full text-left ${linkCls}`}>Architecture / About</button>
          <a href={EXPLORER_HREF} target="_blank" rel="noreferrer" className={`block ${linkCls}`}>Explorer ↗</a>
          <div className="flex gap-2 pt-2 text-[11px]">
            {([[false, "Live Contract"], [true, "Studio Guest"]] as const).map(([g, label]) => (
              <button
                key={label}
                onClick={() => p.onToggleGuest(g)}
                disabled={p.busy || (!g && p.guestLocked)}
                aria-pressed={p.guest === g}
                className={`flex-1 rounded-full border px-3 py-1.5 disabled:opacity-40 ${p.guest === g ? "border-apex/50 bg-apex/10 text-apex" : "border-line text-mute"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
