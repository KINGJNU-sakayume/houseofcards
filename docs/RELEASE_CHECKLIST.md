# Release checklist (Slice §31) — status 2026-10-26 (E2)

Not legal advice. GitHub Pages deploys from main automatically (development preview). These four Slice §31 items must be met before calling a build a **public release**.

| # | Item | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Every `UNVERIFIED_ASSUMPTION` verified or removed | **Done** | `npm run validate:data -- --release` passes with zero blockers. `npm run build:release` fails while any remain. Phase D statutory values are checked against `docs/data/law-review-phase-d.json` (DD1). |
| 2 | Real-world results are clearly labelled "가상 시뮬레이션" | **Done** | The 2024 baselines carry `REAL-WORLD BASELINE`, and everything after 2026-10-19 carries `SAVE SIMULATION`. The Election Night and results sections are always labelled "가상 시뮬레이션", and the fictional exit poll uses no real broadcaster or polling-firm name or design. No real candidate or incumbent names are stored (DD2 decision); AI candidates are party-level records. Checked by `tests/browser/e1.spec.ts` and `d4.spec.ts`. |
| 3 | **Expert review** of election-law risk (e.g. publishing polls, false statements) for a public release within about six months of the election | **Not done — needs the user** | An election-law expert has not reviewed this. In particular, look at the fictional polls, the exit poll and the district results for real 2024 district names close to 2028-04-12. |
| 4 | Data sources and terms of use | **Partly done** | Sources, URLs and SHA-256 hashes are in `docs/DATA_VERIFICATION.md` and `docs/data/districts-2024-provenance.json`. Terms, read from the dataset pages on 2026-10-26: 행정안전부 행정동 인구 (15097972) shows 이용허락범위 "제한 없음". For 중앙선관위 개표결과 15025527 and 15144273, the page HTML does not expose the field; **confirm on the dataset pages before release**. |

Other gates (all automated in CI): typecheck, lint, unit tests, data validation, the 20-seed × 6-strategy sim, build, release build and Playwright.
