# Balance simulation tools

`player_focus_sim.py` is a Monte Carlo balance-analysis tool. It approximates long-term player expansion and survival; it does **not** execute the JavaScript game engine exactly.

## Purpose

- Compare clear/game-over/timeout rates across clans.
- Compare cautious / standard / skilled player-policy profiles.
- Estimate turns to clear or game over and median castle-count checkpoints.
- Detect large balance shifts after data or rule changes.

The normal regression tests under `tests/` answer **"did the implementation stay correct?"**. This tool answers **"how did the balance trend change over many runs?"**.

## Basic usage

From the project root:

```bash
python tools/simulation/player_focus_sim.py 100
```

The old positional interface is preserved:

```bash
python tools/simulation/player_focus_sim.py 1000 cautious,standard,skilled
```

Defaults are the 1560 Okehazama scenario and clans 1 / 3 / 62 (Oda / Takeda / So).

Useful options:

```bash
python tools/simulation/player_focus_sim.py 500 standard --clans 1,3,62
python tools/simulation/player_focus_sim.py 500 skilled --clans 織田家,武田家
python tools/simulation/player_focus_sim.py 500 standard --max-months 600
python tools/simulation/player_focus_sim.py 500 standard --json-out tools/simulation/results/latest.json
```

## Data source

The tool resolves the project root automatically from its own location and reads:

- `data/scenarios/<scenario>/castles.csv`
- `data/scenarios/<scenario>/warriors.csv`
- `data/scenarios/<scenario>/clans.csv`

`warriors.csv` is intentionally used as the readable source data instead of `warriors.bin`.

## Important limitation

This model contains approximations for AI decisions, domestic policy, combat resolution and event effects. Treat results as comparative balance evidence, not as exact predictions of the browser game.

If the JavaScript game rules change materially, review this simulator rather than silently assuming it still mirrors the same design intent.

## Simulator tests

```bash
python tools/simulation/test_player_focus_sim.py
```
