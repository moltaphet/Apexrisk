"""Talk to the deployed ApexRisk contract on GenLayer Studio Next (chain 61997).

    .venv/bin/python scripts/interact_live.py                 # read-only health check
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --seed
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --seed --with-depth
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --evaluate ETH

Read views need no funds: with no key set, a throwaway random account is used
purely because the client requires *an* account object (it is never saved).

Write paths need a funded Studio Next key in DEPLOYER_PRIVATE_KEY (environment
or a git-ignored .env; never another project's account). Both check first, and
refuse to send anything the chain would reject:
  --seed        registers every asset of the ten-market catalog (seed_markets.py)
                that is not registered yet, and leaves the rest alone
  --with-depth  with --seed, also sets each newly registered market's orderbook
                depth endpoint as its independent secondary telemetry source
  --evaluate    submits evaluate_market_risk(SYMBOL) and follows it to consensus
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Callable

from genlayer_py import create_account, create_client
from genlayer_py.chains import studio_devnet

sys.path.insert(0, str(Path(__file__).resolve().parent))
from deploy import CHAIN_ID, EXPLORER_URL, RPC_URL, load_env_file  # noqa: E402
from seed_markets import SEED_MARKETS  # noqa: E402

ARTIFACT = Path(__file__).resolve().parent.parent / "deployments" / "studio-next.json"


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


def seed_missing(client, address: str, account, with_depth: bool = False, log: Callable[[str], None] = print) -> dict:
    """Register every catalog asset that is not registered yet.

    Already-registered markets are skipped, never re-registered (which would
    reset their posture). One market failing does not abort the batch: the
    error is recorded and the loop moves on. At the end the chain is re-read, so
    a transaction that was accepted but did not actually register the market is
    reported as a failure instead of a success.

    Returns {"registered": [...], "skipped": [...], "failed": {symbol: reason}}.
    """
    registered_now = {m["symbol"] for m in read(client, address, "get_all_markets")}
    result: dict = {"registered": [], "skipped": [], "failed": {}}

    for symbol, seed in SEED_MARKETS.items():
        if symbol in registered_now:
            result["skipped"].append(symbol)
            log(f"Seed       {symbol:<5} already registered, skipping")
            continue
        try:
            tx = client.write_contract(
                address=address,
                function_name="register_market",
                args=[symbol, seed.telemetry_url, seed.ltv, seed.liq, seed.rate],
                account=account,
            )
            log(f"Seed       {symbol:<5} tx {tx}")
            wait(client, tx)
            if with_depth:
                tx2 = client.write_contract(
                    address=address,
                    function_name="set_secondary_telemetry",
                    args=[symbol, seed.depth_url],
                    account=account,
                )
                log(f"           {symbol:<5} + depth source tx {tx2}")
                wait(client, tx2)
            result["registered"].append(symbol)
        except Exception as exc:  # noqa: BLE001 - keep going: one bad market must not sink the batch
            result["failed"][symbol] = f"{type(exc).__name__}: {str(exc)[:160]}"
            log(f"Seed       {symbol:<5} FAILED, continuing: {result['failed'][symbol]}")

    # Trust the chain, not the receipts.
    visible = {m["symbol"] for m in read(client, address, "get_all_markets")}
    for symbol in list(result["registered"]):
        if symbol not in visible:
            result["registered"].remove(symbol)
            result["failed"][symbol] = "transaction returned but the market is not visible on-chain"
            log(f"Seed       {symbol:<5} NOT VISIBLE after registering")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", action="store_true", help="register the missing catalog markets (governor only)")
    parser.add_argument("--with-depth", action="store_true", help="with --seed: also set the depth endpoint as secondary telemetry")
    parser.add_argument("--evaluate", metavar="SYMBOL", help="submit evaluate_market_risk for SYMBOL")
    args = parser.parse_args()
    if args.with_depth and not args.seed:
        parser.error("--with-depth only applies together with --seed")

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
    print(f"Markets    {len(markets)} of {len(SEED_MARKETS)} catalog assets registered")
    for m in markets:
        print(
            f"  {m['symbol']:<5} LTV {m['max_ltv_bps'] / 100:5.2f}%  liq {m['liquidation_threshold_bps'] / 100:5.2f}%  "
            f"rate {m['borrow_rate_base_bps'] / 100:5.2f}%  tier {m['risk_tier']:<8} "
            f"evals {m['evaluation_count']}  stale {m['is_stale']}  breaker {m['circuit_breaker']}"
        )
    print("Read path  OK: the contract responds over the Studio Next RPC.")

    if not (args.seed or args.evaluate):
        missing = [s for s in SEED_MARKETS if s not in {m["symbol"] for m in markets}]
        if missing:
            print(f"Note       not registered yet: {', '.join(missing)}. The governor can run --seed.")
        return 0

    signer = account.address.lower()
    if args.seed:
        if signer != str(governor).lower():
            print(f"Refusing to seed: {signer} is not the governor ({governor}).", file=sys.stderr)
            return 3
        result = seed_missing(client, address, account, with_depth=args.with_depth)
        print(
            f"Seed       done: {len(result['registered'])} registered, "
            f"{len(result['skipped'])} already present, {len(result['failed'])} failed"
        )
        if result["failed"]:
            for symbol, reason in result["failed"].items():
                print(f"           {symbol}: {reason}", file=sys.stderr)
            print("           Re-run --seed to retry only the failed markets.", file=sys.stderr)
            return 6

    if args.evaluate:
        symbol = args.evaluate.upper()
        markets = read(client, address, "get_all_markets")
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
