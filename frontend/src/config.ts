// Pinned network + address configuration.
//
// Everything the dApp needs to reach the chain is hardcoded here on purpose:
// a missing, stale or cached VITE_* variable must never point the app at the
// wrong network or blank the screen. Env vars may only *override* these, and
// only when they pass validation.

export const CHAIN_ID = 61997;
export const CHAIN_NAME = "GenLayer Studio Next";
// Studio Next serves JSON-RPC at /api (the /rpc path returns 404).
export const RPC_URL = "https://studio-next.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio-next.genlayer.com";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Studio Next deployment. `scripts/deploy.py` rewrites this line after a deploy.
export const STUDIO_NEXT_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function resolveAddress(): string {
  const fromEnv = (import.meta.env?.VITE_APEXRISK_ADDRESS as string | undefined)?.trim();
  return fromEnv && ADDRESS_RE.test(fromEnv) && fromEnv !== ZERO_ADDRESS
    ? fromEnv
    : STUDIO_NEXT_CONTRACT_ADDRESS;
}

export const CONTRACT_ADDRESS = resolveAddress();
export const IS_DEPLOYED = CONTRACT_ADDRESS !== ZERO_ADDRESS;

export const SYMBOLS = ["ETH", "BTC", "SOL"] as const;

export const explorerAddressUrl = (a: string) => `${EXPLORER_URL}/address/${a}`;
export const explorerTxUrl = (h: string) => `${EXPLORER_URL}/tx/${h}`;

export const DOCS_URL = "https://docs.genlayer.com";
// Set to the public repository URL once published; the footer shows a disabled label while empty.
export const GITHUB_URL = "";
export const APP_VERSION = "v1.0-alpha";
export const TESTS_PASSING = 51;
