"""Talk to the deployed ApexRisk contract on GenLayer Studio Next (chain 61997).

    .venv/bin/python scripts/interact_live.py                 # read-only health check
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --seed
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --seed --with-secondary
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --sync-telemetry [--only ETH,BTC]
    DEPLOYER_PRIVATE_KEY=0x... .venv/bin/python scripts/interact_live.py --evaluate ETH

Read views need no funds: with no key set, a throwaway random account is used
purely because the client requires *an* account object (it is never saved).

Write paths need a funded Studio Next key in DEPLOYER_PRIVATE_KEY (environment
or a git-ignored .env; never another project's account). Both check first, and
refuse to send anything the chain would reject:
  --seed        registers every asset of the ten-market catalog (seed_markets.py)
                that is not registered yet, and leaves the rest alone
  --with-secondary  with --seed / --sync-telemetry, also sets the catalog's independent
                second exchange as each market's secondary telemetry source
  --sync-telemetry  points already-registered markets at the catalog's current sources.
                Non-destructive: register_market resets a posture and re-activates a
                paused market, so a market is only retargeted when it has zero
                evaluations and is active, and it keeps its current posture.
  --only        with --sync-telemetry, restrict to a comma-separated symbol list
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


def seed_missing(client, address: str, account, with_secondary: bool = False, log: Callable[[str], None] = print) -> dict:
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
                fees=client.estimate_transaction_fees(),
            )
            log(f"Seed       {symbol:<5} tx {tx}")
            wait(client, tx)
            if with_secondary:
                tx2 = client.write_contract(
                    address=address,
                    function_name="set_secondary_telemetry",
                    args=[symbol, seed.secondary_url],
                    account=account,
                    fees=client.estimate_transaction_fees(),
                )
                log(f"           {symbol:<5} + secondary source tx {tx2}")
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


def sync_telemetry(
    client,
    address: str,
    account,
    with_secondary: bool = False,
    only: set | None = None,
    log: Callable[[str], None] = print,
) -> dict:
    """Point registered markets at the catalog's current telemetry sources.

    `register_market` is the only way to change a primary URL, but it also resets
    the posture and re-activates the market. So a primary is retargeted only when
    the market is active and has never been evaluated (nothing to lose), and it is
    re-registered with its CURRENT posture, not the catalog's. Secondary sources
    use `set_secondary_telemetry`, which touches nothing else. One market failing
    does not abort the batch, and the chain is re-read at the end.

    Returns {"retargeted", "secondary_set", "current", "skipped": {sym: why}, "failed": {sym: why}}.
    """
    markets = {m["symbol"]: m for m in read(client, address, "get_all_markets")}
    result: dict = {"retargeted": [], "secondary_set": [], "current": [], "skipped": {}, "failed": {}}

    for symbol, seed in SEED_MARKETS.items():
        if only and symbol not in only:
            continue
        m = markets.get(symbol)
        if m is None:
            result["skipped"][symbol] = "not registered (run --seed first)"
            log(f"Sync       {symbol:<5} not registered, skipping")
            continue
        primary_stale = m["telemetry_url"] != seed.telemetry_url
        secondary_stale = with_secondary and m.get("secondary_telemetry_url") != seed.secondary_url
        if not primary_stale and not secondary_stale:
            result["current"].append(symbol)
            log(f"Sync       {symbol:<5} already current")
            continue
        try:
            if primary_stale:
                if m["evaluation_count"] > 0:
                    result["skipped"][symbol] = "has evaluations: register_market would reset its live posture"
                    log(f"Sync       {symbol:<5} primary NOT changed ({result['skipped'][symbol]})")
                elif not m["active"]:
                    result["skipped"][symbol] = "paused: register_market would re-activate it"
                    log(f"Sync       {symbol:<5} primary NOT changed ({result['skipped'][symbol]})")
                else:
                    tx = client.write_contract(
                        address=address,
                        function_name="register_market",
                        args=[symbol, seed.telemetry_url, m["max_ltv_bps"], m["liquidation_threshold_bps"], m["borrow_rate_base_bps"]],
                        account=account,
                        fees=client.estimate_transaction_fees(),
                    )
                    log(f"Sync       {symbol:<5} primary -> {seed.telemetry_url}  tx {tx}")
                    wait(client, tx)
                    result["retargeted"].append(symbol)
            if secondary_stale:
                tx2 = client.write_contract(
                    address=address,
                    function_name="set_secondary_telemetry",
                    args=[symbol, seed.secondary_url],
                    account=account,
                    fees=client.estimate_transaction_fees(),
                )
                log(f"Sync       {symbol:<5} secondary -> {seed.secondary_url}  tx {tx2}")
                wait(client, tx2)
                result["secondary_set"].append(symbol)
        except Exception as exc:  # noqa: BLE001 - keep going: one bad market must not sink the batch
            result["failed"][symbol] = f"{type(exc).__name__}: {str(exc)[:160]}"
            log(f"Sync       {symbol:<5} FAILED, continuing: {result['failed'][symbol]}")

    # Trust the chain, not the receipts.
    after = {m["symbol"]: m for m in read(client, address, "get_all_markets")}
    for symbol in list(result["retargeted"]):
        if after.get(symbol, {}).get("telemetry_url") != SEED_MARKETS[symbol].telemetry_url:
            result["retargeted"].remove(symbol)
            result["failed"][symbol] = "transaction returned but the primary URL did not change on-chain"
    for symbol in list(result["secondary_set"]):
        if after.get(symbol, {}).get("secondary_telemetry_url") != SEED_MARKETS[symbol].secondary_url:
            result["secondary_set"].remove(symbol)
            result["failed"][symbol] = "transaction returned but the secondary URL did not change on-chain"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", action="store_true", help="register the missing catalog markets (governor only)")
    parser.add_argument("--with-secondary", action="store_true", help="with --seed/--sync-telemetry: also set the catalog's secondary source")
    parser.add_argument("--sync-telemetry", action="store_true", help="point registered markets at the catalog's current sources (governor only)")
    parser.add_argument("--only", metavar="SYMBOLS", help="with --sync-telemetry: comma-separated symbols, e.g. ETH,BTC")
    parser.add_argument("--evaluate", metavar="SYMBOL", help="submit evaluate_market_risk for SYMBOL")
    args = parser.parse_args()
    if args.with_secondary and not (args.seed or args.sync_telemetry):
        parser.error("--with-secondary only applies together with --seed or --sync-telemetry")
    if args.only and not args.sync_telemetry:
        parser.error("--only only applies together with --sync-telemetry")
    only = {x.strip().upper() for x in args.only.split(",") if x.strip()} if args.only else None
    unknown = (only or set()) - set(SEED_MARKETS)
    if unknown:
        parser.error(f"--only names assets outside the catalog: {', '.join(sorted(unknown))}")

    load_env_file()
    key = os.environ.get("DEPLOYER_PRIVATE_KEY")
    if (args.seed or args.sync_telemetry or args.evaluate) and not key:
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

    if not (args.seed or args.sync_telemetry or args.evaluate):
        missing = [s for s in SEED_MARKETS if s not in {m["symbol"] for m in markets}]
        if missing:
            print(f"Note       not registered yet: {', '.join(missing)}. The governor can run --seed.")
        return 0

    signer = account.address.lower()
    if (args.seed or args.sync_telemetry) and signer != str(governor).lower():
        print(f"Refusing to write: {signer} is not the governor ({governor}).", file=sys.stderr)
        return 3
    if args.seed:
        result = seed_missing(client, address, account, with_secondary=args.with_secondary)
        print(
            f"Seed       done: {len(result['registered'])} registered, "
            f"{len(result['skipped'])} already present, {len(result['failed'])} failed"
        )
        if result["failed"]:
            for symbol, reason in result["failed"].items():
                print(f"           {symbol}: {reason}", file=sys.stderr)
            print("           Re-run --seed to retry only the failed markets.", file=sys.stderr)
            return 6

    if args.sync_telemetry:
        result = sync_telemetry(client, address, account, with_secondary=args.with_secondary, only=only)
        print(
            f"Sync       done: {len(result['retargeted'])} primary retargeted, {len(result['secondary_set'])} secondary set, "
            f"{len(result['current'])} already current, {len(result['skipped'])} skipped, {len(result['failed'])} failed"
        )
        for symbol, why in result["skipped"].items():
            print(f"           skipped {symbol}: {why}")
        if result["failed"]:
            for symbol, reason in result["failed"].items():
                print(f"           {symbol}: {reason}", file=sys.stderr)
            print("           Re-run --sync-telemetry to retry only what is still out of date.", file=sys.stderr)
            return 6

    if args.evaluate:
        symbol = args.evaluate.upper()
        markets = read(client, address, "get_all_markets")
        market = next((m for m in markets if m["symbol"] == symbol), None)
        if market is None:
            print(f"{symbol} is not registered; run --seed as the governor first.", file=sys.stderr)
            return 4
        tx = client.write_contract(
            address=address,
            function_name="evaluate_market_risk",
            args=[symbol],
            account=account,
            fees=client.estimate_transaction_fees(),
        )
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
