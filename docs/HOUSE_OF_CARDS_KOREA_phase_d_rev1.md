# HOUSE OF CARDS: KOREA — Phase D Implementation (rev1)

Repository: `KINGJNU-sakayume/houseofcards`

> **Status (2026-10-25):** D1 is implemented (this document's §2). D2–D4 and CAL are outlined only (§3). Before starting a later step, expand its section here from the code as it then stands, and record decisions in `docs/DECISIONS.md`.

Order, dependencies and the run protocol come from `docs/ROADMAP.md`; progress is in `docs/PROGRESS.md`. Precedence: explicit user decisions in `docs/DECISIONS.md` → Slice Spec (`docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md`, §7, §17–19, §26–27) → this document → `AGENTS.md` conventions. Each step is its own PR and is merged to main once CI passes (user decision 2026-10-25); state-shape changes bump `schemaVersion` and reject the previous schema with Korean keep-JSON guidance.

## 1. Inputs that already exist

- Legal values: `docs/data/law-review-phase-d.json` (DD1, primary statute text of 공직선거법 2026-10-02 and 정당법 2026-07-29). No `UNVERIFIED_ASSUMPTION` remains for the values below.
- Phase C game: founding, resources, recruits with promises (`primary_guarantee`, `regional_priority` wait for nomination), 8-region organization, §16 channels. Phase D-only person attributes (LocalBase, Campaigning, Organization, BroadAppeal, Negotiation) are stored with zero effect until the step that consumes them.
- User decisions: v1.0 uses the **real 2024 254 districts** (labelled "2024년 기준"); brand consistency is E2; CAL sits between D1 and D2; the default for the 0-seat branch is "no revocation under current law, revocation only as a fictional-legislation scenario", to be confirmed before D4.

## 2. D1 — Ruleset presets and seat allocation (implemented)

- **Data.** `src/data/rulesets/rulesets.json` (strict zod, `D1.0`): `currentLaw` (REAL_FACT, shared by all presets: plurality with older-candidate tie, 13 campaign days, no dual candidacy, list 50% women with odd positions women, deposits ₩15,000,000 district / ₩5,000,000 per list candidate, refund and reimbursement 15%/10% with list refund when any list candidate is elected, lottery for equal remainders) and three GAME_ASSUMPTION presets: `parallel_46_open` (default), `parallel_46_threshold_3` (fictional re-enactment of the struck-down "3% or 5 districts"), `semi_compensatory_30` (coupling 0.5, cap 30, satellite mode `none`; not selectable in the UI until v1.1). Seat counts come only from this file. `partyRevocation` is `null` in every preset.
- **Validator.** `validateRulesets` (run by `npm run validate:data`) checks every statutory value against the DD1 review, that the review lists no unverified item, and that `political-model.scenario` agrees with the default preset.
- **Engine.** `src/engine/election/allocation.ts` (pure, BigInt): `hareLargestRemainder`, `eligibleParties` (threshold: share ≥ t or district seats ≥ k), `allocateList` (parallel; semi-compensatory per 공직선거법 §189② with rounding half up, residual or scaled cap seats, and the parallel remainder), `districtWinner` (plurality, caller-supplied older-first order), `totalSeats`. Ties are resolved by caller-supplied order (lottery / age), never by hidden randomness inside the function.
- **Game.** `createGame(seed, rulesetId)` and `replay(seed, commands, rulesetId)`; the save stores `rulesetId` and the full `electionRuleset` snapshot; the opinion model reads `listSeats` and the threshold from it. New-game dialog offers the UI-enabled presets. `/election` shows the ruleset, the current-law values with article numbers, and an illustration that allocates list seats from the latest fictional poll's point estimates (labelled: not a result or prediction, no district seats).
- **Schema 7**; real C2c saves rejected.
- **Tests.** Hand-calculated parallel, threshold and semi-compensatory examples; lottery and older-candidate ties; over 300 seeded random elections per preset: list seats sum to the list size, total seats equal the house, non-negative, and more votes never mean fewer list seats; ruleset/law-review agreement; save/replay with a non-default ruleset.

## 3. Later steps (outline; expand before starting)

- **CAL (after D1, needs DD3 for held-out validation).** Deterministic offline coefficient search (`scripts/calibrate.ts`) over a committed list of tunable coefficients and ranges; targets and tolerances fixed; report before/after honestly in `docs/VALIDATION.md`; political model B3; goldens regenerated.
- **D2 (after CAL).** Load DD3 districts into the Reality pack (new pack id); district vote = regional cohort preferences × district composition + 2024 baseline residual; district viability and S-curve tactical voting (Slice §17–19); Election page district explorer; no election run yet. Uses `districtWinner`.
- **D3.** Nomination windows (2027-07/10/12), three nomination methods, list of 10–15 with the verified gender rule, no dual candidacy; resolves Phase C nomination promises; uses LocalBase/Campaigning/BroadAppeal/Negotiation where Slice §20.4 says so.
- **D4.** Final Push from 2028-01-17, election on 2028-04-12 using `allocateList`/`totalSeats`, deposits and reimbursements from `currentLaw`, the 0-seat branch per the user's confirmed decision, results saved.

## 4. Blockers recorded on 2026-10-25

- DD2 needs the user's raw files (2024 district results, list votes, 별표 1 district table, 읍면동 age population; ROADMAP §3.2). DD3, CAL's held-out validation, and D2 depend on it.
- ROADMAP §5 decision 1 (0-seat branch) needs the user's confirmation before D4.
