"""Fixtures for the ApexRisk direct-mode suite (in-memory GenVM, no network)."""

import json

import pytest

CONTRACT = "contracts/apex_risk.py"
ETH_URL = "https://telemetry.example.com/eth"
BTC_URL = "https://telemetry.example.com/btc"

_DEFAULT_VERDICT = {
    "max_ltv_bps": 7000,
    "liquidation_threshold_bps": 7800,
    "borrow_rate_base_bps": 400,
    "rationale": "Healthy depth, moderate volatility.",
}


def pin_telemetry(vm, url: str = ETH_URL, body: str = "ETH depth 2% = $41M vol 38% funding 0.01%") -> None:
    """Pin the page the GenVM browser renders for a telemetry URL."""
    vm.mock_web(rf"^{url}$", {"method": "GET", "status": 200, "body": body})


def _pin_llm(vm, text: str) -> None:
    vm.mock_llm(r".*risk committee.*", text)


def pin_committee(vm, **verdict) -> None:
    """Pin the committee's answer: JSON inside prose, as a model returns it.

    (The gltest harness auto-parses bare JSON mocks into dicts, which the SDK's
    text channel rejects.) Extra keys, e.g. a bogus risk_tier, pass through so
    tests can prove the contract ignores them.
    """
    _pin_llm(vm, "Committee verdict: " + json.dumps({**_DEFAULT_VERDICT, **verdict}))


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


@pytest.fixture
def apex(direct_vm, direct_deploy, direct_alice):
    """Contract deployed by alice (the governor), with ETH registered."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    c.register_market("ETH", ETH_URL, 7500, 8000, 350)
    return c
