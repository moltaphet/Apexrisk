"""Talk to the deployed ApexRisk contract on GenLayer Studio Next (chain 61997).

    .venv/bin/python scripts/interact_live.py                 # read-only health check
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --seed
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --evaluate ETH

Read views need no funds: with no key set, a throwaway random account is used
purely because the client requires *an* account object (it is never saved).

Write paths need a funded Studio Next key in DEPLOYER_PRIVATE_KEY (environment
or a git-ignored .env; never another project's account). Both check first, and
refuse to send anything the chain would reject:
  --seed      registers ETH/BTC/SOL (governor only) for markets not yet registered
  --evaluate  submits evaluate_market_risk(SYMBOL) and follows it to consensus
"""

import argparse
import json
import os
import sys
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import studio_devnet

sys.path.insert(0, str(Path(__file__).resolve().parent))
from deploy import CHAIN_ID, EXPLORER_URL, MARKETS, RPC_URL, load_env_file  # noqa: E402

ARTIFACT = Path(__file__).resolve().parent.parent / "deployments" / "studio-next.json"
EVAL_COOLDOWN_SECS = 1800  # mirrors contracts/apex_risk.py


def contract_address() -> str:
    return json.loads(ARTIFACT.read_text())["contract_address"]


def plain(value):
    """Flatten SDK results (Maps, bytes, bigints) to JSON-friendly values."""
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    if isinstance(value, bytes):
        return "0x" + value.hex()
    return value


def read(client, address: str, fn: str, args=None):
    return plain(client.read_contract(address=address, function_name=fn, args=args or []))


def wait(client, tx) -> dict:
    receipt = client.wait_for_transaction_receipt(transaction_hash=tx)
    return plain(receipt) if isinstance(receipt, dict) else {"receipt": str(receipt)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", action="store_true", help="register ETH/BTC/SOL (governor only)")
    parser.add_argument("--evaluate", metavar="SYMBOL", help="submit evaluate_market_risk for SYMBOL")
    args = parser.parse_args()

    load_env_file()
    key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if (args.seed or args.evaluate) and not key:
        print("DEPLOYER_PRIVATE_KEY is not set; write paths need a funded Studio Next key.", file=sys.stderr)
        return 1

    account = create_account(key) if key else create_account()
    client = create_client(chain=studio_devnet, endpoint=RPC_URL, account=account)
    address = contract_address()

    chain_id = client.w3.eth.chain_id
    print(f"RPC        {RPC_URL}")
    print(f"Chain id   {chain_id} ({'OK' if chain_id == CHAIN_ID else 'UNEXPECTED, expected ' + str(CHAIN_ID)})")
    print(f"Contract   {address}\nExplorer   {EXPLORER_URL}/address/{address}")
    if chain_id != CHAIN_ID:
        return 2

    governor = read(client, address, "get_governor")
    markets = read(client, address, "get_all_markets")
    history = read(client, address, "get_history_length")
    print(f"Governor   {governor}")
    print(f"History    {history} record(s)")
    print(f"Markets    {len(markets)} registered")
    for m in markets:
        print(
            f"  {m['symbol']:<5} LTV {m['max_ltv_bps'] / 100:5.2f}%  liq {m['liquidation_threshold_bps'] / 100:5.2f}%  "
            f"rate {m['borrow_rate_base_bps'] / 100:5.2f}%  tier {m['risk_tier']:<8} "
            f"evals {m['evaluation_count']}  stale {m['is_stale']}  breaker {m['circuit_breaker']}"
        )
    print("Read path  OK: the contract responds over the Studio Next RPC.")

    if not (args.seed or args.evaluate):
        if not markets:
            print("Note       no markets yet; the governor can run --seed.")
        return 0

    signer = account.address.lower()
    if args.seed:
        if signer != str(governor).lower():
            print(f"Refusing to seed: {signer} is not the governor ({governor}).", file=sys.stderr)
            return 3
        have = {m["symbol"] for m in markets}
        for symbol, (url, ltv, liq, rate) in MARKETS.items():
            if symbol in have:
                print(f"Seed       {symbol} already registered, skipping")
                continue
            tx = client.write_contract(
                address=address, function_name="register_market", args=[symbol, url, ltv, liq, rate], account=account
            )
            print(f"Seed       {symbol} tx {tx}")
            print("           ", json.dumps(wait(client, tx), default=str)[:400])

    if args.evaluate:
        symbol = args.evaluate.upper()
        market = next((m for m in markets if m["symbol"] == symbol), None)
        if market is None:
            print(f"{symbol} is not registered; run --seed as the governor first.", file=sys.stderr)
            return 4
        tx = client.write_contract(address=address, function_name="evaluate_market_risk", args=[symbol], account=account)
        print(f"Evaluate   {symbol} tx {tx}\n           waiting for validator consensus...")
        print("           ", json.dumps(wait(client, tx), default=str)[:600])
        after = read(client, address, "get_market", [symbol])
        moved = after["evaluation_count"] > market["evaluation_count"]
        print(f"Result     evaluation_count {market['evaluation_count']} -> {after['evaluation_count']} "
              f"({'committed' if moved else 'NOT committed: the call reverted, e.g. cooldown or unreachable telemetry'})")
        return 0 if moved else 5
    return 0


if __name__ == "__main__":
    sys.exit(main())
