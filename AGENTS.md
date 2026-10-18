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
- Mark unverifiable legal/real-world numbers `UNVERIFIED_ASSUMPTION`; release builds must fail CI while any remain.
- CI: typecheck/lint → unit tests → data validation → build → deploy. Nightly/manual: full AI-only and bot simulations.
- GitHub Pages: set Vite `base`; keep routing refresh-safe; Free plan requires a public repo.

## Commands (fill in during Phase A)
- install: `npm ci`
- test: `npm test`
- typecheck/lint: `npm run typecheck`, `npm run lint`
- data validation: `npm run validate:data`
- build: `npm run build`
- sim (bots/AI-only): `npm run sim -- --seeds 20`
