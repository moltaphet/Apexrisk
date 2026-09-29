"""Fixtures for the ApexRisk direct-mode suite (in-memory GenVM, no network)."""

import json
import sys
from datetime import datetime, timedelta, timezone

import pytest

CONTRACT = "contracts/apex_risk.py"
ETH_URL = "https://telemetry.example.com/eth"
ETH_URL_B = "https://mirror.example.org/eth"
BTC_URL = "https://telemetry.example.com/btc"

# Mirrors of the contract's velocity constants (tests also read the real ones
# from the loaded module where the value itself is under test).
COOLDOWN = 1_800
T0 = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)

_DEFAULT_VERDICT = {
    "max_ltv_bps": 7000,
    "liquidation_threshold_bps": 7800,
    "borrow_rate_base_bps": 400,
    "rationale": "Healthy depth, moderate volatility.",
}


class Clock:
    """The transaction clock. `advance` moves block time forward."""

    def __init__(self, vm):
        self.vm = vm
        self.now = T0
        self._apply()

    def _apply(self) -> None:
        self.vm.warp(self.now.strftime("%Y-%m-%dT%H:%M:%SZ"))

    def advance(self, seconds: int) -> None:
        self.now += timedelta(seconds=seconds)
        self._apply()

    @property
    def epoch(self) -> int:
        return int(self.now.timestamp())


def pin_telemetry(vm, url: str = ETH_URL, body: str = "ETH depth 2% = $41M vol 38% funding 0.01%") -> None:
    """Pin the page the GenVM browser renders for a telemetry URL."""
    vm.mock_web(rf"^{url}$", {"method": "GET", "status": 200, "body": body})


def _pin_llm(vm, text: str, pattern: str = r".*risk committee.*") -> None:
    vm.mock_llm(pattern, text)


def pin_committee(vm, pattern: str = r".*risk committee.*", **verdict) -> None:
    """Pin the committee's answer: JSON inside prose, as a model returns it.

    (The gltest harness auto-parses bare JSON mocks into dicts, which the SDK's
    text channel rejects.) Extra keys, e.g. a bogus risk_tier, pass through so
    tests can prove the contract ignores them.
    """
    _pin_llm(vm, "Committee verdict: " + json.dumps({**_DEFAULT_VERDICT, **verdict}), pattern)


def pin_committee_fenced(vm, **verdict) -> None:
    """Pin the committee's answer wrapped in a markdown ```json fence."""
    body = json.dumps({**_DEFAULT_VERDICT, **verdict}, indent=2)
    _pin_llm(vm, f"Here is my assessment:\n```json\n{body}\n```\nHope that helps.")


def repin(vm, *, telemetry: dict[str, str] | None = None, **verdict) -> None:
    """Replace all mocks (the harness keeps the first matching mock)."""
    vm.clear_mocks()
    for url, body in (telemetry or {ETH_URL: "ETH depth 2% = $41M vol 38%"}).items():
        pin_telemetry(vm, url, body)
    pin_committee(vm, **verdict)


def ev(apex, clock: Clock, symbol: str = "ETH") -> dict:
    """Evaluate after letting the cooldown expire, so the call is always legal."""
    clock.advance(COOLDOWN + 1)
    return apex.evaluate_market_risk(symbol)


def posture(m: dict) -> tuple:
    return (m["max_ltv_bps"], m["liquidation_threshold_bps"], m["borrow_rate_base_bps"])


@pytest.fixture
def clock(direct_vm):
    return Clock(direct_vm)


@pytest.fixture
def apex(direct_vm, direct_deploy, direct_alice, clock):
    """Contract deployed by alice (the governor), with ETH registered at T0."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    c.register_market("ETH", ETH_URL, 7500, 8000, 350)
    return c


@pytest.fixture
def mod(apex):
    """The loaded contract module, for exercising its pure functions directly
    (the direct harness never runs the validator function)."""
    return sys.modules["_contract_apex_risk"]
