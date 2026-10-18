# AGENTS.md — HOUSE OF CARDS: KOREA

Source of truth: `docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md`. If anything here conflicts with it, the Slice Spec wins. Record decisions in `docs/DECISIONS.md`.

## Non-negotiables
1. Engine code (`src/engine/**`) is pure TypeScript: no React, DOM, or browser APIs. Must run in Node, on the main thread, and in a Worker.
2. Reality data is read-only. Reality / Seed / Save are separate layers. Never mutate the reality pack. Never put save-state fields in it.
3. No flat stat bonuses. Core values, organization, and policy never directly "add votes". Every effect passes through the simulation chain: platform → cohort fit → awareness/viability → polling → district/list vote → tactical voting → seats.
4. Platform (공약) ≠ government policy. The player is out of power and cannot change social indicators directly.
5. Election rules come from Ruleset data files. Never hard-code 254, 46, or 3%.
6. Determinism: named RNG streams derived from `(seed, subsystem, date)`; no engine-dependent math in outcome paths; sorted-ID iteration; verify with a state hash.
7. UI never mutates simulation state; it dispatches commands.
8. Real people: label `REAL-WORLD BASELINE` vs `SAVE SIMULATION`; ratings are `GAME MODEL` estimates; never invent crimes, corruption, health, or private-life claims; no moral/personality scores; never use real polling firms or broadcasters' names/designs.
9. No external API in the core game. No backend.
10. Prefer shallow-but-real over deep-but-fake. Do not add fake static UI.

## Resources and scope
- Only three resources: Money, Staff Capacity, Agenda Slots.
- 6 policy domains, 96 cohorts, 254 Light districts + 30 Active districts, 8 regions, Full politicians ≤ 80 + Light candidates.
- Not in v1.0: parliament simulation, local/presidential elections, factions, mergers, live data, LLM outcomes.

## Process
- One phase per task (A→E). Each phase ends playable, with tests passing and unimplemented parts labelled in the UI.
- Phase B is split into B1 and B2 by `docs/HOUSE_OF_CARDS_KOREA_phase_b_rev2.md`; execute only its CURRENT STEP. B1 must be merged and tested before B2.
- Reality snapshot ends 2026-10-18; Save simulation starts 2026-10-19. B1's partial pack is not a verified electoral baseline.
- Mark unverifiable legal/real-world numbers `UNVERIFIED_ASSUMPTION`; release builds must fail CI while any remain.
- CI: typecheck/lint → unit tests → data validation → build → deploy. Nightly/manual: full AI-only and bot simulations.
- GitHub Pages: set Vite `base`; keep routing refresh-safe; Free plan requires a public repo.

## Commands (fill in during Phase A)
- install: `npm ci`
- test: `npm test`
- typecheck/lint: `npm run typecheck`, `npm run lint`
- data validation: `npm run validate:data`
- build: `npm run build`
- sim (B2 national political chain, balanced/idle/housing-focused bots; no election balance): `npm run sim -- --seeds 20`

## B2 decisions carried forward
- B1 was merged in PR #1, merge `a6cd47b3193e8fc0bcc2c19cbe2571026b62c37f`, before B2.
- User explicitly chose Slice Spec Potential: remove awareness and viability barriers for ALL parties, retaining trust, loyalty, identity and government evaluation. Use awareness=1 and the same neutral viability (median of the two current-support leaders' viability). Do not switch to target-party-only counterfactuals from B2 rev2.
- CURRENT STEP is B2. Phase C/D/E needs a separate task; do not add party creation, recruitment, organization, resources, tactical votes or seats in B2.
- Political-model defaults, preview party, AI and polls are GAME MODEL. Missing real government approval stays null in Reality; the separate neutral development fallback is explicitly UNVERIFIED_ASSUMPTION and blocks release.
- Schema 2 uses phase=B2; B1 previews are explicitly rejected with JSON preservation guidance, never silently filled with generated politics.

## Data verification revision (2026-10-18)
- `docs/DATA_VERIFICATION.md` and `docs/data/verification-2026-10-18.json` record the review of all 56 original blockers: 56 resolved, zero unverified blockers remain. Release gates remain strict.
- Government approval is now a sourced 39% measurement through 2026-10-15; the obsolete neutral fallback is null. No approval fallback is needed for this pack.
- Reality pack `kr-b2-2026-10-18-r3` changes deterministic initial politics. Older development saves need explicit JSON preservation guidance; do not replay them against a different baseline.
- Verified calibration observations do not mean the model fits them. Election observations are 2026 regional council proportional ballots, distinct from national assembly elections and current support; poll means are documented derived statistics, not official pooled estimates.

- Revision r3 imports owner-supplied MOIS September 2026 one-year-age CSV: 32 actual population counts, nationally reconciled. Use `python scripts/import-population.py docs/data/population-2026-09.csv` to reproduce; preserve original upload provenance.
- Future law remains UNRESOLVED as a sourced current-state fact. Election date 2028-04-12 is SCHEDULED, not a confirmed future event; retain this distinction in UI and data.
