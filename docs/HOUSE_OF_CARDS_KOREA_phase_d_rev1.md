# HOUSE OF CARDS: KOREA — Phase D Implementation (rev1)

Repository: `KINGJNU-sakayume/houseofcards`

> **Status (2026-10-26):** D1 (§2), CAL and D2 (§2a) and D3 (§2b) are implemented. D4 is outlined only (§3). Before starting a later step, expand its section here from the code as it then stands, and record decisions in `docs/DECISIONS.md`.

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

## 2a. CAL and D2 (implemented 2026-10-26)

- **CAL.** Calibrated 50 pre-committed tunables (regional attachment weights, party awareness/viability) against the fixed 20 targets; political model B3, schema 8. See `docs/data/calibration-cal.json` and VALIDATION.
- **D2 data.** `src/data/reality/districts-2024.json` (pack `kr-d2-2026-10-18-r4`): 254 Light records from DD2/DD3 (2024 districts, party-level baselines, 12-cell composition, Active 30). Validated by `validateDistricts` (count = default preset district seats, composition and shares sum to 1,000,000, Active quotas).
- **D2 engine.** `src/engine/election/districts.ts`, pure and recomputed on demand, nothing stored in the save:
  1. sincere share = Σ cells (regional cohort choice × composition × turnout), plus residual (district 2024 share − region's turnout-weighted 2024 mean), game parties only, clamped and renormalized excluding 'none';
  2. district viability: top two = 1, others S-curve between 15% and 30% (`src/data/seeds/district-model.json`);
  3. tactical voting: each non-viable party loses share × cohort tactical tendency × (1 − viability) to the top two in proportion to their shares.
  No candidate or organization terms yet (D3/D4).
- **UI.** Election page district explorer (Active 30 / all 254, region filter), labelled "2024년 기준" and "save-model estimate before nominations".
- Old saves (pack r3) are rejected by the pack-id check with Korean keep-JSON guidance.

## 2b. D3 — Nominations and list (implemented 2026-10-26)

- **Data.** `src/data/seeds/nomination.json` (strict zod, `D3.0`, GAME_MODEL): gates 2027-07-05 targets / 2027-10-04 nominations / 2027-12-06 list / 2028-03-20 registration (validated as weekly ticks), target maximum 20, primary and strategic parameters, candidate-effect weights.
- **State (schema 9).** `nominations = { targets, districts: {districtId → {politicianId, method, participants, nominatedAt}}, list, primaryParticipants, registeredAt }`.
- **Commands** (`src/engine/election/nominations.ts`, atomic refusals with Korean reasons):
  - `SET_TARGET_DISTRICT {districtId, targeted}` — Active 30 only, at most 20; a nominated district cannot be untargeted.
  - `NOMINATE_DISTRICT {districtId, method: primary|strategic|none, candidateIds}` — targeted districts, recruited people not already standing (no dual candidacy). `primary`: 2–3 people, score = LocalBase (home region only) .3 + Recognition .2 + Campaigning .2 + BroadAppeal .2 + Negotiation .1 plus ±8 points from the `primary` stream; participant trust +5, winner +5 more, regional organization +2; Money 2000, Staff 3. `strategic`: one person, Staff 1; passed-over regional recruits lose up to 12 trust (halved at Negotiation 100), regional organization −1 if anyone was passed over. `none` withdraws and refunds the deposit.
  - `SET_LIST {politicianIds}` — 0 or `listSizeUi` (10–15) names; `currentLaw` gender rule (odd positions women, ≥ 50% women) and dual-candidacy ban.
  - Deposits from `currentLaw` (₩15,000,000 / ₩5,000,000 per list candidate) are charged when named and refunded on withdrawal before registration (ledger `deposit`; primary cost ledger `nomination`).
- **Registration.** On the 2028-03-20 tick: `registeredAt` is set, later nomination commands are refused, and `primary_guarantee` (kept if the person took part in a primary) and `regional_priority` (kept if the person stands in a district of their home region) are resolved.
- **District projection.** From the nomination stage the player stands only where nominated; elsewhere cohorts choose among the other parties. In a nominated district the player's cohort utility gains (quality − 50) × 0.5 (quality = LocalBase home-only .4, Campaigning .3, BroadAppeal .3) and awareness is at least max(base, Recognition × .5 + regional organization × .3). AI parties are party-level virtual candidates everywhere (GAME ASSUMPTION).
- **UI.** `/election` nomination panel: stage line, Active 30 target table with nominee and withdraw, nomination form with method explanations and refusal reasons, list editor (order, add/remove, save). The district explorer shows '후보 없음' and the nominee.
- **Not yet.** List vote/branding effects, the Organization attribute, local-issue fit and deposit refunds by result are D4.

## 3. Later steps (outline; expand before starting)

- **D4.** Final Push from 2028-01-17, election on 2028-04-12 using `allocateList`/`totalSeats`, deposits and reimbursements from `currentLaw`, the 0-seat branch per the user's confirmed decision, results saved.

## 4. Blockers recorded on 2026-10-25

- DD2 needs the user's raw files (2024 district results, list votes, 별표 1 district table, 읍면동 age population; ROADMAP §3.2). DD3, CAL's held-out validation, and D2 depend on it.
- ROADMAP §5 decision 1 (0-seat branch) needs the user's confirmation before D4.
