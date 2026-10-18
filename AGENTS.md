# AGENTS.md — HOUSE OF CARDS: KOREA

Source of truth: `docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md` (Slice Spec). If anything here conflicts with it, the Slice Spec wins, except where `docs/DECISIONS.md` records an explicit user decision. Record every decision in `docs/DECISIONS.md`.

## Status
- Phase A (foundation) and Phase B1/B2 (national political simulation) are **done and merged**. B2 task documents are historical.
- **Next: Phase C** (party creation, resources, recruitment, regional organization). It is a separate task with its own prompt; execute only the phase named in that prompt's `CURRENT PHASE`.
- Not implemented yet: party creation, recruitment, organization, resources, publication costs, nominations, district/list election, tactical voting, seats, Election Night, Season Review. Do not fake them in the UI.

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
- One phase per task (A→E). Each phase ends playable, with tests passing and unimplemented parts labelled in the UI.
- Reality snapshot ends 2026-10-18; Save simulation starts 2026-10-19 (Mondays through 2028-04-10: 78 dates, 77 `ADVANCE_WEEK`s; election day 2028-04-12 is SCHEDULED, not a confirmed event).
- Mark unverifiable legal/real-world numbers `UNVERIFIED_ASSUMPTION`; release builds fail while any remain. Currently zero blockers remain for the national pack; Phase D rule values (party-revocation threshold, deposit/reimbursement, dual-candidacy ban, list-gender rule) must be added as `UNVERIFIED_ASSUMPTION` or sourced.
- Changing the model, the reality pack, or the save schema changes golden hashes. Regenerate `tests/fixtures/*golden*.json` only deliberately, by replaying the same command sequence, and record old→new hashes in `docs/DECISIONS.md`.
- Older saves are never silently upgraded or filled with generated state: bump the schema/phase discriminator and reject old JSON with Korean guidance to keep it.
- CI: typecheck/lint → unit tests → data validation → 20-seed × 3-strategy sim → dev build → Playwright; `release` runs `npm run build:release`; `deploy` only from main after both pass. Nightly/manual: 500-seed simulation.
- GitHub Pages: Vite `base` is `/houseofcards/`, HashRouter, refresh-safe; Free plan requires a public repo.

## Commands
- install: `npm ci`
- typecheck (app + pure engine): `npm run typecheck`; lint: `npm run lint`
- unit/regression tests: `npm test` (about 100 s; do not run in the background without waiting)
- data validation: `npm run validate:data` (strict: `-- --release`)
- build: `npm run build`; release build: `npm run build:release`
- sim (national political chain; balanced/idle/housing-focused bots; **not** an election balance test): `npm run sim -- --seeds 20`
- E2E: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`

## Decisions carried forward
- Schema 2, phase discriminator `B2`. Phase A/B1 JSON is rejected with guidance; do not regenerate B1-absent politics. Reality pack `kr-b2-2026-10-18-r3` (real MOIS 2026-09 population, sourced 39% government approval). Packs or phases before this are rejected; do not replay saves against a different baseline.
- **Potential Support** (user-confirmed, Slice Spec §18.5): for ALL parties set awareness = 1 and viability = one shared neutral value, equal to the rounded mean of the viability of the two parties leading in current support (ties by party id; `neutralViability` in `src/engine/voters/model.ts`). Trust, prior loyalty, identity distance and government evaluation are retained. No clamping; Potential may be below Current for large parties. Barrier decomposition uses independent single-barrier counterfactuals and is non-additive.
- Political-model defaults, the development preview party (`player-preview`), AI parties and polls are GAME MODEL, not official positions or predictions. Party positions and bills are not `REAL_FACT`.
- Election-law state: current law is semi-compensatory; the 3% threshold was struck down 2026-01-29 with no replacement enacted (`law-transition` = UNRESOLVED). The default game ruleset `parallel_46_open` is a GAME ASSUMPTION. Always show the "this save's ruleset" notice.
- Verified source data does not mean the model fits it: 15 of 20 seed-42 initial calibration comparisons are outside the old ±5pp tolerance. Do not tune targets/tolerances to pass; report honestly.
- Phase C replaces the fixed development preview party with real party creation; it must be removed from engine seeds at that point (see the Phase C prompt).
