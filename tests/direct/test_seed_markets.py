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
    assert s.telemetry_url.startswith("https://") and s.pair in s.telemetry_url
    assert mod._validate_url(s.telemetry_url) == s.telemetry_url
    assert mod._validate_url(s.depth_url) == s.depth_url
    assert s.telemetry_url != s.depth_url  # the contract rejects a secondary equal to the primary
    assert len(s.telemetry_url) <= mod.MAX_URL_LEN and len(s.depth_url) <= mod.MAX_URL_LEN


def test_all_telemetry_urls_are_unique():
    urls = [s.telemetry_url for s in SEED_MARKETS.values()] + [s.depth_url for s in SEED_MARKETS.values()]
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


def test_secondary_depth_source_is_accepted_by_the_contract(apex):
    for symbol, s in SEED_MARKETS.items():
        apex.register_market(symbol, s.telemetry_url, s.ltv, s.liq, s.rate)
        apex.set_secondary_telemetry(symbol, s.depth_url)
        assert apex.get_market(symbol)["secondary_telemetry_url"] == s.depth_url


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
    """Records writes and answers get_all_markets from what it 'registered'."""

    def __init__(self, registered=(), fail=(), invisible=(), fail_depth=()):
        self.markets = {s: {"symbol": s} for s in registered}
        self.fail, self.invisible, self.fail_depth = set(fail), set(invisible), set(fail_depth)
        self.writes: list[tuple[str, str]] = []

    def read_contract(self, address, function_name, args=None):
        assert function_name == "get_all_markets"
        return [dict(m) for m in self.markets.values()]

    def write_contract(self, address, function_name, args, account):
        symbol = args[0]
        if function_name == "register_market" and symbol in self.fail:
            raise RuntimeError("consensus rejected")
        if function_name == "set_secondary_telemetry" and symbol in self.fail_depth:
            raise RuntimeError("depth rejected")
        self.writes.append((function_name, symbol))
        if function_name == "register_market" and symbol not in self.invisible:
            self.markets[symbol] = {"symbol": symbol}
        return "0x" + f"{len(self.writes):064x}"

    def wait_for_transaction_receipt(self, transaction_hash):
        return {"status": "ACCEPTED"}


def seed(client, **kw):
    return interact_live.seed_missing(client, "0xC0ntract", object(), log=lambda _m: None, **kw)


def test_seed_registers_all_ten_on_an_empty_contract():
    c = FakeClient()
    r = seed(c)
    assert r["registered"] == list(SEED_MARKETS) and r["skipped"] == [] and r["failed"] == {}
    assert [w for w in c.writes if w[0] == "register_market"] == [("register_market", s) for s in SEED_MARKETS]


def test_seed_skips_registered_markets_and_registers_only_the_missing():
    c = FakeClient(registered=["ETH", "BTC", "SOL"])
    r = seed(c)
    assert r["skipped"] == ["ETH", "BTC", "SOL"]
    assert r["registered"] == ["AVAX", "LINK", "ARB", "OP", "NEAR", "SUI", "BNB"]
    assert not any(sym in ("ETH", "BTC", "SOL") for _fn, sym in c.writes)  # never re-registered (would reset a posture)


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
    assert c.writes == [("register_market", "SUI")]


def test_accepted_tx_that_did_not_register_is_reported_as_a_failure():
    c = FakeClient(invisible=["NEAR"])
    r = seed(c)
    assert "NEAR" not in r["registered"]
    assert "not visible on-chain" in r["failed"]["NEAR"]


def test_with_depth_sets_a_secondary_source_for_each_new_market_only():
    c = FakeClient(registered=["ETH"])
    r = seed(c, with_depth=True)
    depth = [sym for fn, sym in c.writes if fn == "set_secondary_telemetry"]
    assert depth == [s for s in SEED_MARKETS if s != "ETH"]
    assert len(r["registered"]) == 9 and r["failed"] == {}


def test_depth_failure_is_recorded_and_the_batch_continues():
    c = FakeClient(fail_depth=["BTC"])
    r = seed(c, with_depth=True)
    assert set(r["failed"]) == {"BTC"} and "depth rejected" in r["failed"]["BTC"]
    assert "ETH" in r["registered"] and "BNB" in r["registered"]


def test_without_the_flag_no_secondary_source_is_written():
    c = FakeClient()
    seed(c)
    assert not any(fn == "set_secondary_telemetry" for fn, _s in c.writes)
