# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Mittominato/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Mittominato/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: pre-token protocols ranked by implied value, with a farm plan for each. The board holds 198 rows — all 40 watchlist protocols plus the other launch candidates in the snapshot.

## The model

Implied value = TVL × 0.35 × growth factor × age factor × breadth factor × category factor.

- Growth factor: 1 + clamped 7-day TVL change / 200.
- Age factor: 1 + min(years listed, 5) × 0.05.
- Breadth factor: 1 + min(chains, 10) × 0.015.
- Category factor: 0.6 (CEX) to 1.12 (Lending).

Only protocols that record no token are ranked. Protocols whose token already trades are set aside on the dashboard as already launched. No protocol name is hardcoded anywhere in the model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`, written by the same run). The board is sortable and filterable, every row opens a detail view with its factor breakdown and five concrete farm steps.

---

<sub>Entered on [make.fun](https://make.fun/?ref=6xedf17w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
