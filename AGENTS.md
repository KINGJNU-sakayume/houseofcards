# AGENTS.md — HOUSE OF CARDS: KOREA

Source of truth: `docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md` (Slice Spec). If anything here conflicts with it, the Slice Spec wins, except where `docs/DECISIONS.md` records an explicit user decision. Record every decision in `docs/DECISIONS.md`.

## Status
- A/B1/B2/C1 are merged. C1 implements founding, resources, finance, publication costs, player research, paid internal surveys and the Party page.
- **Order and splitting of the remaining work: `docs/ROADMAP.md` (rev 2026-10-25). Current position: `docs/PROGRESS.md`.** Each run executes only the first unchecked step there, following the run protocol in ROADMAP §1 (one `npm ci` preflight; on failure log one line and stop, never schedule retries).
- Remaining steps: C2a politicians → C2b recruitment/promises → C2c regional organization (merge) → D1 Ruleset/seats → CAL model calibration → D2 districts/tactical voting → D3 nominations/list → D4 election/0-seat branch (merge) → E1 Election Night + Season Review → E2 polish incl. brand consistency (moved from C2). DD1–DD3 (Phase D data, Python/docs only) may run in parallel.
- v1.0 districts are the **real 2024 254 districts** (user decision 2026-10-25); AI candidates stay virtual Light records unless decided otherwise.
- Phase C is complete (C1, C2a/b/c; brand consistency moved to E2). DD1 (legal values, `docs/data/law-review-phase-d.json`) and D1 (ruleset presets in `src/data/rulesets/rulesets.json`, pure seat allocation, ruleset choice at new game, Election page) are done. Schema 11 / phase C2. Phase D instructions: `docs/HOUSE_OF_CARDS_KOREA_phase_d_rev1.md`. DD2 is done: 2024 district results and 2026-09 행정동 population normalized at party level in `docs/data/districts-2024.json` (raw files downloaded from data.go.kr at the user's request, not committed). DD3 is done: 254 Light records and Active 30 in `docs/data/districts-light-2024.json`, party mapping in `docs/data/party-mapping-2024.json` (not yet in the Reality pack; that is D2). CAL is done (political model B3, `docs/data/calibration-cal.json`: 18/20 seed-42 targets within ±5pp, 17/20 held-out mean). D2 is done: 254 districts in the Reality pack (`kr-d2-2026-10-18-r4`), pure district projection with S-curve viability and tactical voting (`src/engine/election/districts.ts`), Election-page district explorer. D3 is done: targets, primary/strategic nominations, list of 10–15 with the current-law gender and dual-candidacy rules, deposits, promise resolution at registration, nominee effects in the district projection (`src/engine/election/nominations.ts`, `src/data/seeds/nomination.json`), schema 9. D4 is done: Final Push (`src/engine/election/finalPush.ts`), the 2028-04-12 election computed on the last tick and saved (`src/engine/election/election.ts`, `src/data/seeds/election.json`), deposit refunds and reimbursement, 0-seat branch = extra-parliamentary with no revocation (user decision 2026-10-26), schema 10. E1 is done: Election Night and Season Review at `/review` (pure views in `src/engine/review/index.ts`, no state change). E2 is done: brand consistency (player trust factor), Vote Flow in internal surveys, list warning and list-first bots, the AI-only bot and election-distribution report in the sim (6 strategies), accessibility checks, `docs/RELEASE_CHECKLIST.md`; schema 11. E3 (added after the ROADMAP on the user's delegation) makes the election-day national swing relative to each party's support (±10%), which removes the Slice §30 first-party concentration warning; schema 12. F1 (balance 1) adds press coverage that follows each party's published poll and campaign-period exposure for parties on the ballot (same rule for all parties, awareness only, political model B4), raises the recruit profile cap to 0.30, and adds the `focused` ceiling-measurement bot (7 sim strategies); schema 13. **ROADMAP complete; the remaining open items (legal expert review, NEC dataset terms) need the user (see PROGRESS).** Current hashes are in `docs/PROGRESS.md`.
- Reality pack `kr-d2-2026-10-18-r4`; political model B3 (calibrated); schema 8.
- C1 seed42 hashes: before founding `8c52aa107c0a262d`, founded `80540311e6cc2763`, idle end `5cb48dbde11d429d`, management/reversal `1c3da2a992705758`. 20-seed ×4-strategy batch hash `d64c0602e0255e81` (B2 historical hash `d8d46221df2985db`).

## Non-negotiables
1. Engine code (`src/engine/**`) is pure TypeScript: no React, DOM, or browser APIs. Must run in Node, on the main thread, and in a Worker.
2. Reality data is read-only. Reality / Seed / Save are separate layers. Never mutate the reality pack. Never put save-state fields in it.
3. No flat stat bonuses. Core values, organization, and policy never directly "add votes". Every effect passes through the simulation chain: platform → cohort fit → awareness/viability → polling → district/list vote → tactical voting → seats.
4. Platform (공약) ≠ government policy. The player is out of power and cannot change social indicators directly.
5. Election rules come from Ruleset data files. Never hard-code 254, 46, or 3%.
6. Determinism: named RNG streams derived from `(seed, subsystem, date)`; Q6 fixed-point integers in outcome paths (no floats, no engine-dependent math); sorted-ID iteration; verify with a state hash and command replay.
7. UI never mutates simulation state; it dispatches commands.
8. Real people: label `REAL-WORLD BASELINE` vs `SAVE SIMULATION`; ratings are `GAME MODEL` estimates; never invent crimes, corruption, health, or private-life claims; no moral/personality scores; never use real polling firms or broadcasters' names/designs.
9. No external API in the core game. No backend.
10. Prefer shallow-but-real over deep-but-fake. Do not add fake static UI.

## Resources and scope
- Only three resources: Money, Staff Capacity, Agenda Slots.
- 6 policy domains, 32 policy levers, 96 cohorts, 254 Light districts + 30 Active districts, 8 regions, Full politicians ≤ 80 + Light candidates.
- Not in v1.0: parliament simulation, local/presidential elections, factions, mergers, live data, LLM outcomes.

## Process
- One ROADMAP step per PR (user decision 2026-10-25): each step gets its own branch and PR and is merged to main once CI passes. Every state-shape change bumps `schemaVersion` and rejects the previous schema with Korean keep-JSON guidance. Each merge to main ends playable, with tests passing and unimplemented parts labelled in the UI.
- Reality snapshot ends 2026-10-18; Save simulation starts 2026-10-19 (Mondays through 2028-04-10: 78 dates, 77 `ADVANCE_WEEK`s; election day 2028-04-12 is SCHEDULED, not a confirmed event).
- Mark unverifiable legal/real-world numbers `UNVERIFIED_ASSUMPTION`; release builds fail while any remain. Currently zero blockers remain for the national pack; Phase D statutory values are sourced in DD1 and must match `currentLaw` in the rulesets (validator). The 0-seat/under-2% revocation clause (정당법 §44①3) was held unconstitutional on 2014-01-28 with no replacement; presets keep `partyRevocation: null` until the user decides (ROADMAP §5-1).
- Changing the model, the reality pack, or the save schema changes golden hashes. Regenerate `tests/fixtures/*golden*.json` only deliberately, by replaying the same command sequence, and record old→new hashes in `docs/DECISIONS.md`.
- Older saves are never silently upgraded or filled with generated state: bump the schema/phase discriminator and reject old JSON with Korean guidance to keep it.
- CI: typecheck/lint → unit tests → data validation → 20-seed × 7-strategy sim (incl. AI-only and seat checks) → dev build → Playwright; `release` runs `npm run build:release`; `deploy` only from main after both pass. Nightly/manual: 500-seed simulation.
- GitHub Pages: Vite `base` is `/houseofcards/`, HashRouter, refresh-safe; Free plan requires a public repo.

## Commands
- install: `npm ci`
- typecheck (app + pure engine): `npm run typecheck`; lint: `npm run lint`
- unit/regression tests: `npm test` (about 100 s; do not run in the background without waiting)
- data validation: `npm run validate:data` (strict: `-- --release`)
- build: `npm run build`; release build: `npm run build:release`
- sim (full season incl. election; idle/balanced/housing-focused/regional/spender/ai-only/focused bots; reports seat distributions; **not** a balance target): `npm run sim -- --seeds 20`
- E2E: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`

## Decisions carried forward
- Schema3, phase C. A/B1/B2 JSON is rejected with Korean keep-JSON guidance. Import limit 8,000,000 UTF-8 bytes; command cap6,000. `tests/fixtures/phase-b2-v2.json` was exported from the real B2 engine before changing it.
- A new world has five AI parties and status=founding. Only CREATE_PARTY is permitted; it adds `player` once, with no poll published that day. Never restore a fixed preview party.
- Atomic refusals leave state/log untouched; show shortage errors in UI rather than mutating the persistent Inbox. Weekly arrears are real Critical messages. Staff/Slots refill to caps, never accumulate. Maintain ledger conservation including ledgerTruncatedSum.
- **Potential Support** (user-confirmed, Slice Spec §18.5): for ALL parties set awareness = 1 and viability = one shared neutral value, equal to the rounded mean of the viability of the two parties leading in current support (ties by party id; `neutralViability` in `src/engine/voters/model.ts`). Trust, prior loyalty, identity distance and government evaluation are retained. No clamping; Potential may be below Current for large parties. Barrier decomposition uses independent single-barrier counterfactuals and is non-additive.
- Political/party-management defaults, AI parties, generated player state and polls are GAME MODEL, not official positions or predictions. No subsidy for the out-of-parliament player is a labelled game assumption, not a Reality claim.
- Election-law state: current law is semi-compensatory; the 3% threshold was struck down 2026-01-29 with no replacement enacted (`law-transition` = UNRESOLVED). The default game ruleset `parallel_46_open` is a GAME ASSUMPTION. Always show the "this save's ruleset" notice.
- Calibration compares party shares excluding 'none' against fixed targets. After CAL, 18 of 20 seed-42 comparisons are within ±5pp (호남 ppp and national dp remain off). Do not tune targets/tolerances to pass; report honestly.
- C1 removed the development preview from runtime code/seeds. Real core politicians are deferred for lack of verified Tier2 sources; C2 uses virtual Full objects only.
