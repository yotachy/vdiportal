repo: yotachy/vdiportal
branch: main
path: map

## Last sync
date: 2026-08-09T15:20:16Z

### Updated in this project
- Read `forge-backtest-report.json` and rebuilt the verification screens on its real figures (58.1% direction, 60.8% always-up baseline, ECE 0.13%, cone coverage 77.7%, 31,496 forecasts / 86 series / 1969–2026).
- Rebalanced the honesty framing: strengths first, baseline gap as a design choice, drawdowns as sizing context.
- Added the engine-growth story from verifiable repo facts: 20 → 32 indicators, 434 automated tests, 2026-08-06 quote-source swap.
- Positioned the product as pure technical analysis — price/volume/time only, with every number traceable to the chart.

## Screen map
| Screen | Built from |
|---|---|
| Watchlist | map/forge.html `.forge-side`, CLAUDE.md §4패널 |
| Ticker report (chart + cone, horizons, TF matrix) | map/forge.html `.chart-pane` / `#fcDashPanel` / `#fcHorizons` |
| Indicator signals · per-node analysis | map/forge.html `#sigProw` / `#fcNarrPanel`, CLAUDE.md §지표 시스템 |
| Indicator rail (32 across Lv1–Lv4) | map/forge.html `.ind-rail`, CLAUDE.md `IND_TIERS` |
| Wave scan / PDM | map/forge.html `#fcPdmPanel` / `#fcFoldPanel` |
| Risk & sizing | map/forge.html `#riskBtn` → openRiskTool |
| How we measure · regime & interval breakdown | map/forge-backtest-report.json (`overall`, `byRegime`, `byTimeframe`) |
| Engine releases | map/CLAUDE.md (indicator tiers, test counts, 2026-08-06 data source change) |
| Method · coverage | map/forge-backtest-report.json `universe`; CLAUDE.md §지표 시스템 |

## Not yet read
- `map/forge-scorecard.html` (115 KB) — the PC "검증 성적" page. Read it before finalising the verification copy.
