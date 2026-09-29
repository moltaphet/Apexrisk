import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import {
  CHAIN_ID,
  CHAIN_NAME,
  CONTRACT_ADDRESS,
  EVAL_COOLDOWN_SECS,
  EXPLORER_URL,
  RPC_URL,
  WALLET_CHAIN_PARAMS,
} from "./config";
import type { HistoryRecord, Market, Posture, RunState } from "./types";

// studioDevnet is the SDK preset for chain 61997; pin name/rpc to Studio Next.
// genlayer-js 1.x encodes calldata in a format the v0.3 runner behind Studio Next
// rejects ("malformed_entry"), so every read and write failed; 2.0.0-rc.1 fixed it.
export const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: CHAIN_NAME,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Explorer", url: EXPLORER_URL } },
} as typeof studioDevnet;

const addr = CONTRACT_ADDRESS as `0x${string}`;
const reader = createClient({ chain, endpoint: RPC_URL });

/** genlayer-js decodes calldata to Maps/bigints; flatten to plain JSON values. */
export function normalize(v: unknown): unknown {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), normalize(x)]));
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  }
  return v;
}

export async function fetchMarkets(): Promise<Market[]> {
  const raw = await reader.readContract({ address: addr, functionName: "get_all_markets", args: [] });
  return normalize(raw) as Market[];
}

export async function fetchHistory(symbol: string): Promise<HistoryRecord[]> {
  const raw = await reader.readContract({ address: addr, functionName: "get_history", args: [symbol] });
  return normalize(raw) as HistoryRecord[];
}

// --- wallet ---------------------------------------------------------------------

interface Eip1193 {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}
const provider = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum;
export const hasWallet = () => !!provider();

const USER_REJECTED = 4001; // EIP-1193: the user dismissed the prompt
const UNRECOGNIZED_CHAIN = 4902; // EIP-3326: the wallet does not know this chain

/** Wallets report the JSON-RPC error code at the top level or nested under `data`. */
function errorCode(err: unknown): number | undefined {
  const e = err as { code?: unknown; data?: { originalError?: { code?: unknown } } } | null;
  const code = e?.code ?? e?.data?.originalError?.code;
  return typeof code === "number" ? code : undefined;
}

/** "0xf22d" -> 61997. Anything unparseable -> null. */
export function parseChainId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const n = raw.startsWith("0x") || raw.startsWith("0X") ? parseInt(raw, 16) : parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export const isStudioNext = (id: number | null) => id === CHAIN_ID;

const KNOWN_CHAINS: Record<number, string> = {
  1: "Ethereum Mainnet",
  10: "Optimism",
  56: "BNB Smart Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  11155111: "Sepolia",
  61999: "GenLayer Studio",
};

/** "GenLayer Studio (61999)": the wallet's chain, named when known, always with its id. */
export function chainLabel(id: number | null): string {
  if (id === null) return "an unknown network";
  const name = KNOWN_CHAINS[id];
  return name ? `${name} (${id})` : `chain ${id}`;
}

/** The wallet's current chain. `eth_chainId` never prompts, so this is safe to call any time. */
export async function getWalletChainId(): Promise<number | null> {
  const eth = provider();
  if (!eth) return null;
  try {
    return parseChainId(await eth.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

/**
 * Ask the wallet to move to Studio Next. `wallet_addEthereumChain` (standard
 * EIP-3085 params) is requested ONLY when the wallet reports the chain as unknown
 * (4902). Dismissing the switch prompt (4001) is surfaced as an error and is never
 * followed by another prompt.
 */
async function requestSwitch(eth: Eip1193): Promise<void> {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: WALLET_CHAIN_PARAMS.chainId }] });
  } catch (err) {
    const code = errorCode(err);
    if (code === USER_REJECTED) {
      throw Object.assign(new Error(`Network switch declined. Switch your wallet to ${WALLET_CHAIN_PARAMS.chainName} to submit transactions.`), { code });
    }
    if (code !== UNRECOGNIZED_CHAIN) throw err;
    await eth.request({ method: "wallet_addEthereumChain", params: [WALLET_CHAIN_PARAMS] });
  }
}

/**
 * Connect an injected wallet. Wallet security providers (e.g. Blockaid) flag
 * sites that prompt without being asked, so this is deliberately conservative:
 *
 *  - It is called ONLY from the Connect button's click handler, never on mount,
 *    and refuses to run unless that click was a real user gesture.
 *  - `eth_requestAccounts` is the first and only account prompt.
 *  - The chain is switched only if the wallet is not already on Studio Next.
 *  - If the user declines that switch the connection is KEPT (they did approve the
 *    site); the returned chainId tells the UI to show its "Switch to Studio Next"
 *    banner instead of prompting again.
 */
export async function connectWallet(trustedClick: boolean): Promise<{ account: string; chainId: number | null }> {
  if (!trustedClick) throw new Error("Wallet connection must be started by a click on Connect Wallet.");
  const eth = provider();
  if (!eth) throw new Error("No injected wallet found. Install MetaMask, or use Guest mode.");

  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as string[];

  let chainId = await getWalletChainId();
  if (!isStudioNext(chainId)) {
    try {
      await requestSwitch(eth);
    } catch (err) {
      if (errorCode(err) !== USER_REJECTED) throw err;
    }
    chainId = await getWalletChainId();
  }
  return { account, chainId };
}

/**
 * The "Switch to Studio Next" button. Click-only, like connecting. Resolves with
 * the wallet's chain afterwards; rejects if the user declines.
 */
export async function switchToStudioNext(trustedClick: boolean): Promise<number | null> {
  if (!trustedClick) throw new Error("Switching networks must be started by a click.");
  const eth = provider();
  if (!eth) throw new Error("No injected wallet found.");
  if (!isStudioNext(await getWalletChainId())) await requestSwitch(eth);
  return getWalletChainId();
}

/**
 * Follow the wallet after the user has connected: network and account changes made
 * inside the wallet. Listening is passive (it prompts nothing) and starts only
 * once the user has connected. Returns an unsubscribe function.
 */
export function watchWallet(handlers: {
  onChainChanged: (chainId: number | null) => void;
  onAccountsChanged: (accounts: string[]) => void;
}): () => void {
  const eth = provider();
  if (!eth?.on) return () => {};
  const chainHandler = (raw: unknown) => handlers.onChainChanged(parseChainId(raw));
  const accountsHandler = (raw: unknown) => handlers.onAccountsChanged(Array.isArray(raw) ? (raw as string[]) : []);
  eth.on("chainChanged", chainHandler);
  eth.on("accountsChanged", accountsHandler);
  return () => {
    eth.removeListener?.("chainChanged", chainHandler);
    eth.removeListener?.("accountsChanged", accountsHandler);
  };
}

// --- fees -----------------------------------------------------------------------

/** wei -> "0.1000" GEN, for prompts and messages. */
export const formatGen = (wei: bigint) => (Number(wei) / 1e18).toFixed(4);

/**
 * Studio Next enforces a fee policy on every write: a transaction with no fee
 * distribution is reverted on-chain with `FeesDistributionMissing`. The SDK quotes
 * the distribution and the deposit (about 0.1 GEN); the deposit travels as the
 * transaction's value, which is what the wallet shows the user to approve.
 */
export async function quoteFees() {
  const est = await reader.estimateTransactionFees();
  return {
    feeValue: est.feeValue,
    fees: { distribution: est.distribution, feeValue: est.feeValue } as Parameters<
      typeof reader.simulateWriteContract
    >[0]["fees"],
  };
}

// --- live consensus lifecycle ---------------------------------------------------

const POLL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000;
const FAILED = new Set(["UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const toPosture = (m: Market): Posture => ({
  max_ltv_bps: m.max_ltv_bps,
  liquidation_threshold_bps: m.liquidation_threshold_bps,
  borrow_rate_base_bps: m.borrow_rate_base_bps,
  risk_tier: m.risk_tier,
});

/**
 * Submit evaluate_market_risk and follow it to on-chain consensus.
 * Success is reported ONLY after the network accepted the transaction AND the
 * re-read market shows the evaluation actually committed -- never optimistically.
 */
export async function runEvaluation(
  symbol: string,
  account: string,
  emit: (patch: Partial<RunState>) => void,
): Promise<void> {
  const writer = createClient({ chain, endpoint: RPC_URL, account: account as `0x${string}` });
  try {
    emit({ steps: ["active", "idle", "idle"], detail: "Reading market and packaging telemetry request…" });
    const before = (normalize(
      await reader.readContract({ address: addr, functionName: "get_market", args: [symbol] }),
    ) as Market);

    // The contract enforces the cooldown; checking here just spares a wallet
    // prompt and a doomed transaction.
    const waitSecs = before.last_evaluated_at + EVAL_COOLDOWN_SECS - Math.floor(Date.now() / 1000);
    if (before.last_evaluated_at > 0 && waitSecs > 0) {
      throw new Error(
        `Evaluation cooldown active for ${symbol}: about ${Math.ceil(waitSecs / 60)} min remaining (the contract allows one evaluation per ${EVAL_COOLDOWN_SECS / 60} min per market).`,
      );
    }

    // Never prompt on the wrong network: the wallet would sign for a chain that
    // has no ApexRisk. (The UI also shows a "Switch to Studio Next" banner.)
    const walletChain = await getWalletChainId();
    if (!isStudioNext(walletChain)) {
      throw new Error(`Your wallet is on ${chainLabel(walletChain)}. Switch to ${WALLET_CHAIN_PARAMS.chainName} (${CHAIN_ID}) to submit this transaction.`);
    }

    // Studio Next reverts any write without a fee distribution (FeesDistributionMissing).
    emit({ detail: "Estimating Studio Next network fees…" });
    const { fees, feeValue } = await quoteFees();
    const balance = await reader.getBalance({ address: account as `0x${string}` });
    if (balance < feeValue) {
      throw new Error(
        `Not enough GEN for the network fee: this transaction needs a ${formatGen(feeValue)} GEN fee deposit and your wallet holds ${formatGen(balance)} GEN on Studio Next.`,
      );
    }

    emit({ detail: `Approve in your wallet: evaluate ${symbol} with a ${formatGen(feeValue)} GEN network fee deposit…` });
    const hash = (await writer.writeContract({
      address: addr,
      functionName: "evaluate_market_risk",
      args: [symbol],
      value: 0n,
      fees,
    })) as string;
    emit({
      steps: ["done", "active", "idle"],
      txHash: hash,
      detail: "Transaction submitted. Validators are scraping telemetry and voting…",
    });

    const started = Date.now();
    let status = "PENDING";
    for (;;) {
      if (Date.now() - started > TIMEOUT_MS) throw new Error("Timed out waiting for validator consensus.");
      const tx = (await reader.getTransaction({ hash: hash as unknown as Parameters<typeof reader.getTransaction>[0]["hash"] })) as unknown as Record<string, unknown>;
      status = String(tx.statusName ?? tx.status ?? status);
      emit({ status, detail: `Consensus status: ${status}` });
      if (FAILED.has(status)) throw new Error(`Consensus did not accept the evaluation (${status}).`);
      if (status === "ACCEPTED" || status === "FINALIZED" || status === "READY_TO_FINALIZE") break;
      await sleep(POLL_MS);
    }

    const [after, history] = await Promise.all([
      reader.readContract({ address: addr, functionName: "get_market", args: [symbol] }).then((r) => normalize(r) as Market),
      fetchHistory(symbol),
    ]);
    if (after.evaluation_count <= before.evaluation_count) {
      throw new Error("Consensus was reached but the evaluation reverted on-chain; no state changed.");
    }
    emit({
      steps: ["done", "done", "done"],
      status,
      detail:
        status === "FINALIZED"
          ? "Consensus accepted and finalized on-chain."
          : "Consensus accepted on-chain; finality follows the appeal window.",
      result: {
        prior: toPosture(before),
        applied: toPosture(after),
        target: history[0]?.target_posture,
        rationale: history[0]?.rationale ?? after.last_rationale,
        finalized: status === "FINALIZED",
        payload: history[0] ?? { note: "history record unavailable" },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The caller marks whichever step was active as failed.
    emit({ error: msg, detail: msg });
    throw e;
  }
}
