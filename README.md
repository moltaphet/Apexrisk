# ApexRisk

Autonomous on-chain DeFi risk engine on [GenLayer](https://genlayer.com). ApexRisk re-underwrites collateral markets (LTV, liquidation threshold, borrow rate, risk tier) from **live off-chain market telemetry**, using GenVM web rendering and **multi-validator LLM consensus**, then clamps the result with deterministic on-chain invariants.

## Network

| | |
|---|---|
| Network | GenLayer Studio Next |
| Chain ID | `61997` |
| RPC | `https://studio-next.genlayer.com/api` |
| Explorer | https://explorer-studio-next.genlayer.com |
| Contract | **not deployed yet** (see [Deploy](#deploy)); address lands in `deployments/studio-next.json` and `frontend/src/config.ts` |

> The brief listed `/rpc` as the RPC path. On 2026-09-29 that path returns HTTP 404, while `/api` serves JSON-RPC for chain 61997, so `/api` is pinned everywhere.

## Architecture

```
contracts/apex_risk.py     GenVM intelligent contract
tests/direct/              in-memory pytest suite (51 tests)
scripts/deploy.py          deploy + seed ETH/BTC/SOL, writes deployments/studio-next.json
deployments/               deployment artifact
frontend/                  React + Vite + Tailwind + lucide-react terminal
```

`evaluate_market_risk(symbol)`:

1. **Scrape.** The leader renders the market's registered telemetry page with `gl.nondet.web.render(mode="text")`. Scraped text is sanitised and length-bounded before it reaches a prompt.
2. **Committee.** `gl.nondet.exec_prompt` asks an "institutional risk committee" for a JSON posture (LTV, liquidation threshold, rate, tier).
3. **Consensus.** `gl.vm.run_nondet` with a custom validator: each validator independently re-scrapes and re-polls, and ratifies only if the tier matches and every bps figure is within ±750 bps. Broken or divergent LLM output forces rotation.
4. **Invariants** (pure code, run after consensus, final authority):
   - LTV clamped to 2000–8500 bps
   - liquidation threshold ≥ LTV + 300 bps (max 9800)
   - borrow rate clamped to 100–2500 bps
   - tier must be `LOW | MODERATE | HIGH | CRITICAL` (otherwise `MODERATE`)
5. **Commit** the clamped posture and append a record (prior / committee / applied) to `risk_history`.

Governor-only: `register_market`, `toggle_circuit_breaker`, `set_market_active`. A tripped breaker or inactive market blocks evaluation. Views: `get_market`, `get_all_markets`, `get_history`, `get_governor`, `get_history_length`.

API note: the brief names `gl.get_webpage` / `gl.exec_prompt`. The pinned v0.3 runner exposes these as `gl.nondet.web.render` and `gl.nondet.exec_prompt`, which the contract uses.

## Local setup

```bash
uv venv --python 3.12
uv pip install --prerelease=allow -r requirements.txt

genvm-lint check contracts/apex_risk.py     # lint + SDK validation
.venv/bin/python -m pytest -q               # 51 direct-mode tests

cd frontend && npm install && npm run dev   # or: npm run build
```

## Deploy

```bash
DEPLOYER_PRIVATE_KEY=0x<funded Studio Next key> .venv/bin/python scripts/deploy.py
```

The key is read from the environment or a git-ignored `.env`. The script deploys, registers ETH/BTC/SOL, writes `deployments/studio-next.json`, and pins the address in `frontend/src/config.ts`.

## Frontend

- **Pinned to Studio Next (61997).** Network and the contract address fallback are hardcoded in `src/config.ts`; `VITE_APEXRISK_ADDRESS` can only override with a valid non-zero address.
- **Risk terminal:** ETH / BTC / SOL cards with LTV, liquidation margin, base borrow rate, tier badge.
- **Consensus runner:** three-step stepper (telemetry packaging → awaiting validator consensus → accepted on-chain). Success is shown only after the transaction reaches `ACCEPTED`/`FINALIZED` *and* a re-read of the contract shows the evaluation committed. A reverted or undetermined transaction shows as failed.
- **Guest mode:** pre-populated telemetry and a local port of the invariants run the full stepper with no wallet. Everything is labelled **SIMULATED**; nothing touches the chain. It is forced on while no contract address is configured.
- **ErrorBoundary** wraps the root; explorer links for the contract and every transaction.
