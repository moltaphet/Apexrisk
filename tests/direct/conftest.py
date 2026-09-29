"""Fixtures for the ApexRisk direct-mode suite (in-memory GenVM, no network)."""

import json

import pytest

CONTRACT = "contracts/apex_risk.py"
ETH_URL = "https://telemetry.example.com/eth"


def pin_telemetry(vm, url: str = ETH_URL, body: str = "ETH depth 2% = $41M vol 38% funding 0.01%") -> None:
    """Pin the page the GenVM browser renders for a telemetry URL."""
    vm.mock_web(rf"^{url}$", {"method": "GET", "status": 200, "body": body})


def pin_committee(vm, **verdict) -> None:
    """Pin the committee's JSON answer for any risk-committee prompt."""
    payload = {
        "max_ltv_bps": 7000,
        "liquidation_threshold_bps": 7800,
        "borrow_rate_base_bps": 400,
        "risk_tier": "MODERATE",
        "rationale": "Healthy depth, moderate volatility.",
    }
    payload.update(verdict)
    # JSON inside prose, as a model returns it. (The gltest harness auto-parses
    # bare JSON mocks into dicts, which the SDK's text channel rejects.)
    vm.mock_llm(r".*risk committee.*", "Committee verdict: " + json.dumps(payload))


@pytest.fixture
def apex(direct_vm, direct_deploy, direct_alice):
    """Contract deployed by alice (the governor), with ETH registered."""
    direct_vm.sender = direct_alice
    c = direct_deploy(CONTRACT)
    c.register_market("ETH", ETH_URL, 7500, 8000, 350)
    return c
