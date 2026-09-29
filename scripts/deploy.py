"""Deploy ApexRisk to GenLayer Studio Next (chain 61997) and seed its markets.

    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/deploy.py [--no-seed]

The key is read only from the environment (or .env, which is git-ignored); the
script never falls back to another project's account. On success it writes
deployments/studio-next.json and pins the address in frontend/src/config.ts so
a missing or cached env var can never break the dApp.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import studio_devnet

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contracts" / "apex_risk.py"
ARTIFACT = ROOT / "deployments" / "studio-next.json"
FRONTEND_CONFIG = ROOT / "frontend" / "src" / "config.ts"

CHAIN_ID = 61997
# Studio Next serves JSON-RPC at /api (the /rpc path 404s as of 2026-09-29).
RPC_URL = "https://studio-next.genlayer.com/api"
EXPLORER_URL = "https://explorer-studio-next.genlayer.com"

# The ten-asset catalog (baseline postures + public telemetry endpoints) lives in
# seed_markets.py, shared with interact_live.py.
from seed_markets import SEED_MARKETS  # noqa: E402


def load_env_file() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def find_address(node) -> str | None:
    """Locate the deployed contract address anywhere in a receipt structure."""
    if isinstance(node, dict):
        for key in ("contract_address", "contractAddress", "to_address", "recipient"):
            val = node.get(key)
            if isinstance(val, str) and re.fullmatch(r"0x[0-9a-fA-F]{40}", val) and int(val, 16):
                return val
        for val in node.values():
            found = find_address(val)
            if found:
                return found
    elif isinstance(node, (list, tuple)):
        for val in node:
            found = find_address(val)
            if found:
                return found
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-seed", action="store_true", help="skip registering the ten-asset catalog")
    args = parser.parse_args()

    load_env_file()
    key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if not key:
        print("DEPLOYER_PRIVATE_KEY is not set. Export a funded Studio Next key first.", file=sys.stderr)
        return 1

    account = create_account(key)
    client = create_client(chain=studio_devnet, endpoint=RPC_URL, account=account)
    print(f"Deployer  {account.address}\nNetwork   Studio Next ({CHAIN_ID}) via {RPC_URL}")

    tx_hash = client.deploy_contract(code=CONTRACT.read_bytes(), args=[])
    print(f"Deploy tx {tx_hash}")
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash, full_transaction=True)
    address = find_address(receipt)
    if not address:
        print(f"Could not find the contract address in the receipt:\n{receipt}", file=sys.stderr)
        return 2
    print(f"Contract  {address}")

    seeded = []
    if not args.no_seed:
        for symbol, seed in SEED_MARKETS.items():
            tx = client.write_contract(
                address=address,
                function_name="register_market",
                args=[symbol, seed.telemetry_url, seed.ltv, seed.liq, seed.rate],
                account=account,
            )
            client.wait_for_transaction_receipt(transaction_hash=tx)
            seeded.append({"symbol": symbol, "telemetry_url": seed.telemetry_url, "tx": str(tx)})
            print(f"Seeded    {symbol}  {tx}")

    ARTIFACT.parent.mkdir(exist_ok=True)
    ARTIFACT.write_text(
        json.dumps(
            {
                "network": "studio-next",
                "chain_id": CHAIN_ID,
                "rpc_url": RPC_URL,
                "explorer_url": EXPLORER_URL,
                "contract": "ApexRisk",
                "contract_address": address,
                "deployer": account.address,
                "deploy_tx": str(tx_hash),
                "deployed_at": datetime.now(timezone.utc).isoformat(),
                "explorer_contract_url": f"{EXPLORER_URL}/address/{address}",
                "explorer_tx_url": f"{EXPLORER_URL}/tx/{tx_hash}",
                "seeded_markets": seeded,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote     {ARTIFACT.relative_to(ROOT)}")

    if FRONTEND_CONFIG.exists():
        text = FRONTEND_CONFIG.read_text()
        patched = re.sub(
            r'(export const STUDIO_NEXT_CONTRACT_ADDRESS\s*=\s*)"0x[0-9a-fA-F]{40}"',
            rf'\g<1>"{address}"',
            text,
        )
        FRONTEND_CONFIG.write_text(patched)
        print(f"Pinned    {FRONTEND_CONFIG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
