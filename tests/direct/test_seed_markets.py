"""The ten-asset catalog: baselines, contract compatibility, frontend parity, and the
seeding loop (run against a fake client, since seeding itself is a live-network act)."""

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import interact_live  # noqa: E402
from seed_markets import SEED_MARKETS  # noqa: E402

EXPECTED = {
    # symbol: (ltv, liq, rate) in bps, exactly as specified
    "ETH": (8000, 8500, 350),
    "BTC": (8000, 8500, 300),
    "SOL": (7000, 7600, 450),
    "AVAX": (6500, 7200, 500),
    "LINK": (7000, 7500, 400),
    "ARB": (6000, 6800, 550),
    "OP": (6000, 6800, 550),
    "NEAR": (6000, 6700, 600),
    "SUI": (5500, 6400, 650),
    "BNB": (7500, 8000, 400),
}


def tier_for(ltv: int) -> str:
    return "LOW" if ltv >= 7500 else "MODERATE" if ltv >= 5500 else "HIGH" if ltv >= 3500 else "CRITICAL"


# --- the catalog itself ---------------------------------------------------------


def test_catalog_has_the_ten_assets_in_order():
    assert list(SEED_MARKETS) == ["ETH", "BTC", "SOL", "AVAX", "LINK", "ARB", "OP", "NEAR", "SUI", "BNB"]


@pytest.mark.parametrize("symbol,bps", EXPECTED.items())
def test_baselines_match_the_spec(symbol, bps):
    s = SEED_MARKETS[symbol]
    assert (s.ltv, s.liq, s.rate) == bps


@pytest.mark.parametrize("symbol", EXPECTED)
def test_every_baseline_sits_inside_the_contract_envelope(symbol):
    s = SEED_MARKETS[symbol]
    assert 2000 <= s.ltv <= 8500
    assert s.ltv + 300 <= s.liq <= 9800
    assert 100 <= s.rate <= 2500


@pytest.mark.parametrize("symbol", EXPECTED)
def test_telemetry_urls_are_distinct_https_endpoints_the_contract_accepts(mod, symbol):
    s = SEED_MARKETS[symbol]
    assert s.telemetry_url.startswith("https://") and s.coinbase in s.telemetry_url
    assert s.secondary_url.startswith("https://") and s.kraken in s.secondary_url
    assert mod._validate_url(s.telemetry_url) == s.telemetry_url
    assert mod._validate_url(s.secondary_url) == s.secondary_url
    assert s.telemetry_url != s.secondary_url  # the contract rejects a secondary equal to the primary
    assert len(s.telemetry_url) <= mod.MAX_URL_LEN and len(s.secondary_url) <= mod.MAX_URL_LEN


# Measured from inside Studio Next with a probe contract run as consensus transactions
# (see scripts/seed_markets.py). These are facts about the validators' network.
UNREACHABLE_FROM_STUDIO_NEXT = ("api.binance.com", "coingecko.com")


@pytest.mark.parametrize("symbol", EXPECTED)
def test_no_source_points_at_a_host_the_validators_cannot_reach(symbol):
    s = SEED_MARKETS[symbol]
    for url in (s.telemetry_url, s.secondary_url):
        assert not any(bad in url for bad in UNREACHABLE_FROM_STUDIO_NEXT), (
            f"{url} is on a host Studio Next validators cannot reach (Binance: HTTP 451, CoinGecko: 403)"
        )


def test_primary_and_secondary_are_independent_exchanges():
    for s in SEED_MARKETS.values():
        assert "coinbase.com" in s.telemetry_url and "kraken.com" in s.secondary_url


def test_all_telemetry_urls_are_unique():
    urls = [s.telemetry_url for s in SEED_MARKETS.values()] + [s.secondary_url for s in SEED_MARKETS.values()]
    assert len(urls) == len(set(urls)) == 20


# --- registers on the real contract, unclamped -----------------------------------


def test_all_ten_register_on_the_contract_exactly_as_seeded(apex):
    for symbol, s in SEED_MARKETS.items():
        apex.register_market(symbol, s.telemetry_url, s.ltv, s.liq, s.rate)
    markets = {m["symbol"]: m for m in apex.get_all_markets()}
    assert set(markets) == set(SEED_MARKETS)
    for symbol, s in SEED_MARKETS.items():
        m = markets[symbol]
        assert (m["max_ltv_bps"], m["liquidation_threshold_bps"], m["borrow_rate_base_bps"]) == (s.ltv, s.liq, s.rate), (
            f"{symbol} was clamped: the baseline is outside the envelope"
        )
        assert m["risk_tier"] == tier_for(s.ltv)
        assert m["is_stale"] is True and m["evaluation_count"] == 0


def test_secondary_source_is_accepted_by_the_contract(apex):
    for symbol, s in SEED_MARKETS.items():
        apex.register_market(symbol, s.telemetry_url, s.ltv, s.liq, s.rate)
        apex.set_secondary_telemetry(symbol, s.secondary_url)
        assert apex.get_market(symbol)["secondary_telemetry_url"] == s.secondary_url


# --- the frontend catalog mirrors the Python one ----------------------------------

CATALOG_TS = ROOT / "frontend" / "src" / "catalog.ts"
ENTRY = re.compile(
    r'\{ symbol: "(\w+)", name: "([^"]+)", ltv: (\d+), liq: (\d+), rate: (\d+), telemetryUrl: "([^"]+)" \}'
)


def test_frontend_catalog_mirrors_the_seed_script():
    entries = ENTRY.findall(CATALOG_TS.read_text())
    assert [e[0] for e in entries] == list(SEED_MARKETS), "frontend/src/catalog.ts has drifted from scripts/seed_markets.py"
    for symbol, name, ltv, liq, rate, url in entries:
        s = SEED_MARKETS[symbol]
        assert (name, int(ltv), int(liq), int(rate), url) == (s.name, s.ltv, s.liq, s.rate, s.telemetry_url)


def test_guest_mode_has_a_snapshot_for_every_catalog_asset():
    guest = (ROOT / "frontend" / "src" / "guest.ts").read_text()
    for symbol in SEED_MARKETS:
        assert re.search(rf"^  {symbol}: \{{$", guest, re.MULTILINE), f"guest.ts has no GUEST_TELEMETRY entry for {symbol}"


# --- the seeding loop ---------------------------------------------------------------


class FakeClient:
    """A stand-in for the genlayer-py client. It keeps per-market state (URLs, posture,
    evaluation count, active flag) and applies register_market / set_secondary_telemetry
    the way the contract does, including register_market resetting a posture."""

    OLD = "https://api.binance.com/api/v3/ticker/24hr?symbol="

    def __init__(self, registered=(), fail=(), invisible=(), fail_secondary=(), evaluated=(), paused=(), current=(), posture=None):
        self.markets = {}
        for sym in registered:
            seed = SEED_MARKETS[sym]
            self.markets[sym] = {
                "symbol": sym,
                "telemetry_url": seed.telemetry_url if sym in current else f"{self.OLD}{sym}USDT",
                "secondary_telemetry_url": "",
                "max_ltv_bps": (posture or {}).get(sym, (seed.ltv, seed.liq, seed.rate))[0],
                "liquidation_threshold_bps": (posture or {}).get(sym, (seed.ltv, seed.liq, seed.rate))[1],
                "borrow_rate_base_bps": (posture or {}).get(sym, (seed.ltv, seed.liq, seed.rate))[2],
                "evaluation_count": 3 if sym in evaluated else 0,
                "active": sym not in paused,
            }
        self.fail, self.invisible, self.fail_secondary = set(fail), set(invisible), set(fail_secondary)
        self.writes: list[tuple] = []  # (function_name, symbol, *rest)

    def read_contract(self, address, function_name, args=None):
        assert function_name == "get_all_markets"
        return [dict(m) for m in self.markets.values()]

    def estimate_transaction_fees(self):
        # Studio Next reverts writes that carry no fee distribution (FeesDistributionMissing).
        return {"fee_value": 1}

    def write_contract(self, address, function_name, args, account, fees=None):
        assert fees, "every write must carry fees: Studio Next reverts without them"
        symbol = args[0]
        if function_name == "register_market" and symbol in self.fail:
            raise RuntimeError("consensus rejected")
        if function_name == "set_secondary_telemetry" and symbol in self.fail_secondary:
            raise RuntimeError("secondary rejected")
        self.writes.append((function_name, symbol, *args[1:]))
        if function_name == "register_market" and symbol not in self.invisible:
            old = self.markets.get(symbol, {})
            self.markets[symbol] = {
                "symbol": symbol,
                "telemetry_url": args[1],
                "secondary_telemetry_url": old.get("secondary_telemetry_url", ""),
                "max_ltv_bps": args[2],  # register_market RESETS the posture to what it is given
                "liquidation_threshold_bps": args[3],
                "borrow_rate_base_bps": args[4],
                "evaluation_count": old.get("evaluation_count", 0),
                "active": True,  # ... and re-activates a paused market
            }
        if function_name == "set_secondary_telemetry":
            self.markets[symbol]["secondary_telemetry_url"] = args[1]
        return "0x" + f"{len(self.writes):064x}"

    def wait_for_transaction_receipt(self, transaction_hash):
        return {"status": "ACCEPTED"}

    def calls(self, fn):
        return [w for w in self.writes if w[0] == fn]


def seed(client, **kw):
    return interact_live.seed_missing(client, "0xC0ntract", object(), log=lambda _m: None, **kw)


def sync(client, **kw):
    return interact_live.sync_telemetry(client, "0xC0ntract", object(), log=lambda _m: None, **kw)


# --- seeding ------------------------------------------------------------------------


def test_seed_registers_all_ten_on_an_empty_contract():
    c = FakeClient()
    r = seed(c)
    assert r["registered"] == list(SEED_MARKETS) and r["skipped"] == [] and r["failed"] == {}
    assert [w[1] for w in c.calls("register_market")] == list(SEED_MARKETS)


def test_seed_registers_the_reachable_coinbase_source_not_binance():
    c = FakeClient()
    seed(c)
    for fn, symbol, url, *_ in c.calls("register_market"):
        assert url == SEED_MARKETS[symbol].telemetry_url and "coinbase.com" in url and "binance" not in url


def test_seed_skips_registered_markets_and_registers_only_the_missing():
    c = FakeClient(registered=["ETH", "BTC", "SOL"])
    r = seed(c)
    assert r["skipped"] == ["ETH", "BTC", "SOL"]
    assert r["registered"] == ["AVAX", "LINK", "ARB", "OP", "NEAR", "SUI", "BNB"]
    assert not any(w[1] in ("ETH", "BTC", "SOL") for w in c.writes)  # never re-registered (would reset a posture)


def test_seed_is_idempotent_when_everything_is_registered():
    c = FakeClient(registered=list(SEED_MARKETS))
    r = seed(c)
    assert r["registered"] == [] and r["failed"] == {} and len(r["skipped"]) == 10
    assert c.writes == []


def test_one_failing_market_does_not_abort_the_batch():
    c = FakeClient(fail=["AVAX", "OP"])
    r = seed(c)
    assert set(r["failed"]) == {"AVAX", "OP"}
    assert "consensus rejected" in r["failed"]["AVAX"]
    assert r["registered"] == [s for s in SEED_MARKETS if s not in ("AVAX", "OP")]  # the other eight went through
    assert [m["symbol"] for m in c.read_contract("a", "get_all_markets")] == r["registered"]


def test_a_rerun_retries_only_what_failed():
    c = FakeClient(fail=["SUI"])
    assert set(seed(c)["failed"]) == {"SUI"}
    c.fail.clear()
    c.writes.clear()
    r = seed(c)
    assert r["registered"] == ["SUI"] and r["failed"] == {} and len(r["skipped"]) == 9
    assert [w[:2] for w in c.writes] == [("register_market", "SUI")]


def test_accepted_tx_that_did_not_register_is_reported_as_a_failure():
    c = FakeClient(invisible=["NEAR"])
    r = seed(c)
    assert "NEAR" not in r["registered"]
    assert "not visible on-chain" in r["failed"]["NEAR"]


def test_with_secondary_sets_the_second_exchange_for_each_new_market_only():
    c = FakeClient(registered=["ETH"], current=["ETH"])
    r = seed(c, with_secondary=True)
    got = [(w[1], w[2]) for w in c.calls("set_secondary_telemetry")]
    assert got == [(s, SEED_MARKETS[s].secondary_url) for s in SEED_MARKETS if s != "ETH"]
    assert all("kraken.com" in url for _s, url in got)
    assert len(r["registered"]) == 9 and r["failed"] == {}


def test_secondary_failure_is_recorded_and_the_batch_continues():
    c = FakeClient(fail_secondary=["BTC"])
    r = seed(c, with_secondary=True)
    assert set(r["failed"]) == {"BTC"} and "secondary rejected" in r["failed"]["BTC"]
    assert "ETH" in r["registered"] and "BNB" in r["registered"]


def test_without_the_flag_no_secondary_source_is_written():
    c = FakeClient()
    seed(c)
    assert not c.calls("set_secondary_telemetry")


# --- sync_telemetry: retargeting live markets safely ----------------------------------


def test_sync_retargets_a_stale_primary_to_the_catalog_source():
    c = FakeClient(registered=["ETH"])
    r = sync(c)
    assert r["retargeted"] == ["ETH"] and r["failed"] == {}
    assert set(r["skipped"]) == set(SEED_MARKETS) - {"ETH"}  # the nine unregistered ones, and only those
    assert c.markets["ETH"]["telemetry_url"] == SEED_MARKETS["ETH"].telemetry_url


def test_sync_keeps_the_markets_current_posture_instead_of_the_catalogs():
    """register_market resets the posture, so sync must hand it the posture the market already has."""
    c = FakeClient(registered=["ETH"], posture={"ETH": (7000, 7900, 425)})
    sync(c)
    (_fn, _sym, _url, ltv, liq, rate) = c.calls("register_market")[0]
    assert (ltv, liq, rate) == (7000, 7900, 425)
    m = c.markets["ETH"]
    assert (m["max_ltv_bps"], m["liquidation_threshold_bps"], m["borrow_rate_base_bps"]) == (7000, 7900, 425)


def test_sync_never_touches_a_market_that_has_evaluations():
    c = FakeClient(registered=["ETH", "BTC"], evaluated=["ETH"])
    r = sync(c)
    assert "ETH" not in r["retargeted"] and "evaluations" in r["skipped"]["ETH"]
    assert not any(w[1] == "ETH" for w in c.calls("register_market"))  # its live posture is safe
    assert r["retargeted"] == ["BTC"]


def test_sync_never_reactivates_a_paused_market():
    c = FakeClient(registered=["SOL"], paused=["SOL"])
    r = sync(c)
    assert "paused" in r["skipped"]["SOL"] and not c.calls("register_market")
    assert c.markets["SOL"]["active"] is False


def test_sync_is_a_noop_when_everything_is_current():
    c = FakeClient(registered=list(SEED_MARKETS), current=list(SEED_MARKETS))
    r = sync(c)
    assert r["current"] == list(SEED_MARKETS) and c.writes == []


def test_sync_only_restricts_the_markets_it_touches():
    c = FakeClient(registered=list(SEED_MARKETS))
    r = sync(c, only={"ETH", "BNB"})
    assert r["retargeted"] == ["ETH", "BNB"]
    assert {w[1] for w in c.writes} == {"ETH", "BNB"}
    assert c.markets["SOL"]["telemetry_url"].startswith(FakeClient.OLD)  # untouched


def test_sync_skips_unregistered_markets():
    c = FakeClient(registered=["ETH"])
    r = sync(c)
    assert "not registered" in r["skipped"]["BTC"] and r["retargeted"] == ["ETH"]


def test_sync_with_secondary_sets_the_second_exchange():
    c = FakeClient(registered=["ETH"], current=["ETH"])
    r = sync(c, with_secondary=True)
    assert r["secondary_set"] == ["ETH"] and not c.calls("register_market")
    assert c.markets["ETH"]["secondary_telemetry_url"] == SEED_MARKETS["ETH"].secondary_url


def test_sync_can_add_a_secondary_even_to_an_evaluated_market():
    """set_secondary_telemetry changes nothing else, so an evaluated market may still get one."""
    c = FakeClient(registered=["ETH"], evaluated=["ETH"], current=["ETH"])
    r = sync(c, with_secondary=True)
    assert r["secondary_set"] == ["ETH"] and c.markets["ETH"]["evaluation_count"] == 3


def test_sync_secondary_is_idempotent():
    c = FakeClient(registered=["ETH"], current=["ETH"])
    sync(c, with_secondary=True)
    c.writes.clear()
    r = sync(c, with_secondary=True)
    assert r["current"] == ["ETH"] and c.writes == []


def test_sync_one_failure_does_not_abort_the_batch_and_a_rerun_retries_only_it():
    c = FakeClient(registered=["ETH", "BTC", "SOL"], fail=["BTC"])
    r = sync(c)
    assert set(r["failed"]) == {"BTC"} and r["retargeted"] == ["ETH", "SOL"]
    c.fail.clear()
    c.writes.clear()
    r2 = sync(c)
    assert r2["retargeted"] == ["BTC"] and r2["current"] == ["ETH", "SOL"]
    assert [w[1] for w in c.writes] == ["BTC"]


def test_sync_reports_an_accepted_tx_that_did_not_change_the_url():
    c = FakeClient(registered=["ETH"], invisible=["ETH"])
    r = sync(c)
    assert r["retargeted"] == [] and "did not change on-chain" in r["failed"]["ETH"]
