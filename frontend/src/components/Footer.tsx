import { BookOpen, CheckCircle2, Code2, ExternalLink, ShieldCheck } from "lucide-react";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  DOCS_URL,
  EXPLORER_URL,
  GITHUB_URL,
  IS_DEPLOYED,
  RPC_URL,
  TESTS_PASSING,
  explorerAddressUrl,
} from "../config";

const head = "text-[11px] font-semibold uppercase tracking-[0.18em] text-white";
const link = "inline-flex items-center gap-1.5 text-xs text-mute transition hover:text-apex";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-panel/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-apex to-emerald-700 text-ink"><ShieldCheck size={17} /></span>
            Apex<span className="text-apex">Risk</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-mute">ApexRisk: Autonomous GenVM Risk Engine for Next-Gen DeFi.</p>
        </div>

        <div className="space-y-2.5">
          <div className={head}>Protocol</div>
          <a className={link} href={DOCS_URL} target="_blank" rel="noreferrer"><BookOpen size={13} /> Documentation <ExternalLink size={11} /></a>
          <a className={link} href={RPC_URL} target="_blank" rel="noreferrer">GenLayer Studio Next RPC ({CHAIN_ID}) <ExternalLink size={11} /></a>
          {IS_DEPLOYED ? (
            <a className={link} href={explorerAddressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">Contract Explorer <ExternalLink size={11} /></a>
          ) : (
            <a className={link} href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer (contract pending deploy) <ExternalLink size={11} /></a>
          )}
        </div>

        <div className="space-y-2.5">
          <div className={head}>Open Source</div>
          {GITHUB_URL ? (
            <a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer"><Code2 size={13} /> GitHub Repository <ExternalLink size={11} /></a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-mute/60" title="Set GITHUB_URL in src/config.ts"><Code2 size={13} /> GitHub Repository (link pending)</span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-apex/30 bg-apex/10 px-2.5 py-1 text-[11px] text-apex">
            <CheckCircle2 size={13} /> pytest · {TESTS_PASSING} tests passing
          </span>
        </div>

        <div>
          <div className={head}>Disclaimer</div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mute">
            Experimental decentralized autonomous risk engine powered by GenLayer GenVM. Non-custodial. Not financial advice.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-mute sm:px-6">
          <span>© {new Date().getFullYear()} ApexRisk. All rights reserved.</span>
          <span>Powered by GenLayer Intelligent Contracts</span>
        </div>
      </div>
    </footer>
  );
}
