import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  CHAIN_ID,
  CHAIN_NAME,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  RPC_URL,
} from "./config";
import type { HistoryRecord, Market, Posture, RunState } from "./types";

// studionet is the SDK's Studio preset; pin id/name/rpc to Studio Next (61997).
export const chain = {
  ...studionet,
  id: CHAIN_ID,
  name: CHAIN_NAME,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Explorer", url: EXPLORER_URL } },
} as typeof studionet;

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
}
const provider = (): Eip1193 | undefined => (window as unknown as { ethereum?: Eip1193 }).ethereum;
export const hasWallet = () => !!provider();

export async function connectWallet(): Promise<string> {
  const eth = provider();
  if (!eth) throw new Error("No injected wallet found. Install MetaMask, or use Guest mode.");
  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const chainIdHex = "0x" + CHAIN_ID.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER_URL],
        },
      ],
    });
  }
  return account;
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

    emit({ detail: `Submitting evaluation for ${symbol}; wallet confirmation required…` });
    const hash = (await writer.writeContract({
      address: addr,
      functionName: "evaluate_market_risk",
      args: [symbol],
      value: 0n,
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
