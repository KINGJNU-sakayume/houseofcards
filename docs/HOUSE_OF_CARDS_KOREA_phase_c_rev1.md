# HOUSE OF CARDS: KOREA — Phase C Implementation (rev1)

Repository: `KINGJNU-sakayume/houseofcards`

> Implementation status: C1 completed in its dedicated PR; C2 is not implemented. Confirm C1 merge and tests before a separate C2 task.

**CURRENT STEP: C1**   <!-- Run C1 first. Stop and report. Then change to C2 for the second task. -->

Phase C is split into two steps. Execute **only the step named above**. When the step is done, stop and report; do not start the other step or any Phase D/E work.

- **C1 — Founding and resources:** sections 3–12 and the C1 tests. (Schema bump, a world without a player party, `CREATE_PARTY`, resources and finance, publication costs, expertise growth and policy research, internal survey cost, Inbox, Party page, Home/Policy/Data Hub changes, C1 bots.)
- **C2 — People and organization:** sections 13–22 and the C2 tests. (Virtual politician generator, recruitment and promises, regional organization, brand consistency, effect channels into the voter chain, Politicians and Organization pages, C2 bots, balance report, docs.)

If you run C2, first confirm C1 is merged and its tests pass.

---

# 0. How to use this document

- The **Slice Spec** (`docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md`) remains the source of truth. Relevant sections: §8–9 (founding, resources), §13–14 (expertise, value mapping, brand consistency), §20–22 (politicians, recruitment, organization), §24–25 (internal survey, Inbox), §28–29 (UI, save).
- Precedence: explicit user decisions in `docs/DECISIONS.md` → Slice Spec → this prompt → `AGENTS.md` conventions. Where this prompt conflicts with the **actual code**, inspect the code, choose the option that keeps the simulation chain and determinism intact, and record the decision in `docs/DECISIONS.md`.
- Read `AGENTS.md`, `docs/DECISIONS.md` (start with its status index), `docs/VALIDATION.md`, and `docs/DATA_VERIFICATION.md` first. Earlier prompts (`…codex_implementation_prompt…`, `…phase_b_rev2.md`) are **historical**; do not execute them.
- This prompt was written against `main` after PR #3 (Reality pack `kr-b2-2026-10-18-r3`, schema 2, phase `B2`, 66 unit tests, 4 Playwright tests, 20-seed batch hash `d8d46221df2985db`). If `main` differs, trust the code and say so in your report.
- The app must stay playable after each step. Unimplemented parts are labelled in the UI; **no fake static numbers, no fake candidates, no fake seats.**

# 1. What exists (do not rebuild)

Keep and reuse: pure-TS engine under `src/engine/**` (Q6 fixed point, `fixedExp`/`roundDiv`, named RNG streams `(seed, subsystem, ISO date)`, FNV-1a state hash), immutable `GameState` with `deepFreeze`, command reducer `dispatchCommand`, Worker + main-thread fallback, IndexedDB autosave/manual save, JSON export/import with checksum and full command replay, HashRouter, Vite base `/houseofcards/`.

Domain facts: 6 policy domains, 32 levers (0–4, 2 = status quo), 96 cohorts (8 regions × 4 age bands × 3 profiles), 10 core values, platform (draft/published) vs enacted government policy, awareness/loyalty per cohort×party, ownership/expertise/identity per party, analytic consideration-set voter model (`considerationShares`, ≤ 6 parties), Potential (all-party, shared neutral viability) vs Current, barrier decomposition, lagged viability from the last ≤ 2 polls, three fictional poll houses with persistent house effects, limited party AI and quarterly government AI.

Known hard-coded coupling to remove in C1 (found by `grep -rn "player-preview\|playerPreview\|PLAYER_PARTY_ID"`): `src/engine/simulation/initialize.ts`, `engine.ts`, `voters/dynamics.ts`, `voters/model.ts` (`computeAnalysis` uses a fixed id for barriers), `parties/ai.ts`, `data/reality/validate.ts`, `data/seeds/political-model.{json,ts}` (`playerPreview`), `data/seeds/b1.json` (a `player-preview` entry), `components/Simulation.tsx`, `pages/{Home,Policy,DataHub}.tsx`, `scripts/sim.ts`, `tests/b1.test.ts`, `tests/b2.test.ts`.

Stubs to replace: `/party`, `/politicians`, `/organization` currently render `FuturePage`. `/election` stays a Phase D stub.

# 2. Scope

**In Phase C:** party creation (name, short name, color, exactly 3 core values), resources (Money, Staff Capacity, Agenda Slots), finance (weekly settlement), publication costs, policy research and expertise growth for the player party, internal survey costs, expanded Inbox, seed-generated virtual politicians (Full only), recruitment with promises, 8-region organization, brand consistency, the effect channels in §16, Party / Politicians / Organization pages, bots, tests, docs.

**Not in Phase C:** Ruleset engine and seat allocation, districts (Light/Active), target districts, nominations, proportional list, campaign (Final Push), tactical voting, Election Night, Season Review, vote-flow view, Light candidates, real-politician records, parliament, factions, mergers, live data, LLM outcomes. Leave clean interfaces; do not create placeholder numbers for them.

Real core politicians (Slice §20.1 "≤ 20 실존") are **deferred**: the Reality pack holds no people and no verified Data Tier 2 source exists. Phase C uses only virtual Full politicians. Record this deviation in `docs/DECISIONS.md`.

---

# C1

## 3. Versioning, schema and compatibility

- Bump to `schemaVersion: 3`, `phase: 'C'`, `modelVersion` for new data files (`'C1.0'`). B2 JSON must be **rejected with Korean guidance to keep the JSON**, never silently migrated or filled with generated state (same policy as Phase A/B1). Before changing any code, export a real B2 save from current `main` into `tests/fixtures/phase-b2-v2.json` and add a test that the codec rejects it.
- The Reality pack stays `kr-b2-2026-10-18-r3` (no new real-world facts in C1). Do not add `UNVERIFIED_ASSUMPTION` records for game-balance numbers. Balance values are `GAME_MODEL` parameters in a new strict-zod data file `src/data/seeds/party-management.json` (+ `.ts` loader like `political-model.ts`). The statement "an out-of-parliament party receives no state subsidy" is a **game assumption stated in the UI as such**, not a Reality fact; do not put it in the Reality pack and do not make it block release.
- Regenerate golden fixtures deliberately: new `tests/fixtures/c1-golden.json` created once by a documented command sequence. Keep `b1-golden.json`/`b2-golden.json` as historical files (no longer asserted against current state). Record old→new facts in `docs/DECISIONS.md`.
- `MAX_COMMANDS = 1000` is too small once actions cost resources. Set an explicit larger limit (suggested 6000), set an explicit import size limit consistent with it, document both, and test the boundary.

## 4. A world without a player party, then founding

- `createGame(seed)` builds the world **without any player party**: no `player-preview` object, no player entry in `platforms`, `politics.parties`, `perceptions`, `viability`, poll `results`, `partyAttachment`, or analysis. `status` starts as `'founding'` (new union member). The date stays 2026-10-19.
- While `status === 'founding'`: `ADVANCE_WEEK`, platform commands, and every Phase C command except `CREATE_PARTY` are rejected with a Korean message. The UI routes everything to the founding form (§11).
- `CREATE_PARTY` adds the player party to the world exactly once. Use `PLAYER_PARTY_ID = 'player'`. Remove `playerPreview` and the `player-preview` entries from seeds and the validator (the validator must still reject real-polling-firm/broadcaster names and, new: party names/short names that normalize equal to any Reality party's name/short name).
- Integration traps you must handle (these will crash or silently corrupt otherwise):
  - `considerationShares` supports ≤ 6 parties; before founding there are 5 (dp, ppp, reform, rkp, minor-bloc), after founding 6.
  - Poll houses need a house effect for the new party: draw it at founding from its own stream (e.g. `(seed, 'poll-house-effect-player', date)`), persistent thereafter. Do not re-draw existing houses' effects.
  - Polls published before founding contain no player result. `updateViability` must use only polls that contain the party; at founding set viability from `party-management.json` (`newParty.viability`) and let lagged viability start from the first poll after founding. UI and AI code must tolerate missing player results in old polls.
  - The player's per-cohort awareness/loyalty are created at founding from stream `(seed, 'party-founding', date)`: low awareness scaled by cohort `politicalAttention`, loyalty 0 (new party). Do **not** reuse or shift the `cohort-calibration` stream, so AI parties' initial values do not depend on whether/when the player founds. (Removing the preview from `buildCohorts`/platform-prior loops may still change draws; accept it, regenerate goldens, and say so.)
  - `neutralViability`, `computeAnalysis`, barrier decomposition and the sim assertions must take the player id as data and return an explicit "no player" shape before founding (not zeros that look like results).
  - AI code that special-cased the preview party (`platformDiversity`, `updatePartyAI`) must exclude the player by id from the new constant; AI never reads player hidden state (keep the existing test).
- Immediately after `CREATE_PARTY` recompute `analysis`. Do not publish a poll on the founding day (no fake history); the next monthly tick publishes the first poll that includes the party.

## 5. `CREATE_PARTY`

Command payload: `{ type: 'CREATE_PARTY', name, shortName, color, values: [CoreValue, CoreValue, CoreValue] }`.

- Validation (Korean errors, engine-side, not only UI): exactly 3 distinct values from the 10; `name` 2–20 chars and `shortName` 1–6 chars after NFKC normalize/trim, no control characters; reject collision with any Reality party name/short name or `minor-bloc`; reject forbidden poll/media names; `color` from a fixed preset palette in data (≥ 8 colors, none reproducing the red-vs-blue coding of the two large parties; colors identify parties only).
- Creates: player platform (all drafts 2, **nothing published**), `PartyPerception` (`declaredValues` = the 3 values; identity derived by the existing `platformIdentity`; expertise per domain from the Slice §13 example table scaled to Q6 and **data-driven**; ownership near 0; `prior` = status quo), initial resources and finance (§6), initial members (seeded 8,000–15,000 from a named stream), 8 regional organization records (§15, C2 will extend; in C1 store only `members` per region and `level`), `foundedAt`.
- Core values give **no flat bonuses** (Slice §8). In C1 they affect only: (a) research cost priority (data table `valueDomainAffinity`: value → domains; matched domains cost less Staff Capacity to research, bounded, e.g. ≤ 25%), (b) the existing identity target, (c) later brand consistency (C2). Pre-seed the data table now, consume (a) now.
- One-line notice in the founding UI: "법적 창당 절차(창당준비위원회, 시도당 등록 등)는 게임에서 생략된 추상화입니다."
- Event `PARTY_CREATED`, an Inbox welcome with the three values, and the first Inbox "what to do now" items (§10).

## 6. Resources and finance

State (all integers, no floats): `resources: { money, staffCapacity, agendaSlots }`, plus `finance: { members, ledger[] , arrears, staffLevel }`, where `ledger` keeps the last 100 entries `{ date, kind, amount, balanceAfter, ref }`.

- **Money** unit: integer in 10,000 KRW (만원); display as 백만 원 with one decimal. Weekly settlement on each `ADVANCE_WEEK`: income = members × paying rate × monthly dues × 12/52 (integer arithmetic, fixed rounding rule); expenses = staff payroll for the current `staffLevel` + rent for regional offices (C2). No state subsidy (game assumption, labelled).
- **Staff Capacity** is *refilled* (not accumulated) to its monthly cap on the monthly tick (`isMonthlyTick`). Cap = base + `staffLevel` table + offices (C2). **Agenda Slots** likewise refilled to a monthly cap from data.
- Command `SET_STAFF_LEVEL { level }` (discrete levels in data, each with weekly payroll and capacity). Changing level costs Money (hiring) and takes effect from the next refill; reducing level is free but never refunds.
- Spending commands are **atomic**: if any required resource is short, throw a Korean error naming the shortage ("Staff Capacity가 부족합니다 (필요 N, 보유 M)") and change nothing (no partial deduction, no command log entry).
- If payroll cannot be paid at settlement: record `arrears`, post an Inbox *Critical*, halve the next Staff Capacity refill while arrears > 0, never let `money` go negative, and never end the game. (Bankruptcy/game-over is out of scope; record this rule.)
- Conservation invariant: `money = initialMoney + Σ(all signed ledger amounts since founding)`. The displayed ledger keeps only the last 100 entries, so also store a running `ledgerTruncatedSum` (sum of dropped entries) in the state and test the identity across more than 100 entries.
- Suggested starting parameters (tune, record in DECISIONS): Money ≈ 100,000–200,000 만원, Staff Capacity ≈ 10, Agenda Slots ≈ 6/month, 5 staff levels. Targets: an *idle* player stays solvent to 2028-04-10; a heavy spender hits resource refusals by about month 12; neither is a calibrated election balance.

## 7. Publication costs (deferred from B2)

- `SET_PLATFORM_DRAFT` stays free and still changes nothing in the simulation.
- `PUBLISH_PLATFORM { leverId }` now costs Agenda Slots and Staff Capacity from data (default 1 slot + `1 + |newValue − currentPublished|` staff, with reversing a recent directional position costing extra), checked and deducted atomically. Publishing a value equal to the current published value is a no-op and free.
- Remove the B2 code comment "publication costs are deferred" and the matching README/UI text.
- The Policy page shows each lever's cost and the remaining resources, and disables Publish with the reason when short.

## 8. Expertise growth and policy research (player party only)

- AI parties' expertise stays fixed (existing test). The player's expertise grows only through defined channels: `START_POLICY_RESEARCH { domain }` (costs Money + Staff Capacity, takes N weeks, deterministic gain with diminishing returns toward `expertiseCap`), and repeated consistent publication in a domain (small, diminishing). Recruits' PolicyExpertise (C2) is a third channel.
- Expertise feeds only the existing ownership dynamics (`ownership` target = expertise × coverage × consistency); it never adds votes directly. Ownership still moves slowly.
- Research already in progress must survive save/load and replay. A domain can have at most one active research.

## 9. Internal survey cost

- Potential / Current / Barrier / by-age / by-region analysis is an **internal survey** (Slice §24). Add `COMMISSION_INTERNAL_SURVEY` (costs Money + Staff Capacity). It stores a snapshot `{ date, margin, analysis for the player }` in `internalSurveys` (keep the last 12). The Data Hub shows the latest snapshot with its date and a staleness label; before the first survey it shows how to commission one and what it costs. Public polls remain free and unchanged.
- Snapshots are display values with the configured ±range (the existing model-explanatory band, not a statistical CI) and the "save-model estimate" notice. The engine's live `analysis` stays internal state.
- Public polls remain derived from Current Support only; the internal snapshot never feeds polls or AI.

## 10. Inbox (C1 part)

- Priorities become `Critical | Action Required | Important | Report | FYI`. Store the last 60 messages (not 12). Home shows at most **5** key alerts (priority order, then newest).
- Messages come from real triggers only (never filler): founding/welcome, resource shortages and arrears, survey results, research completion, monthly issue report, new public poll, rival platform changes, government enactments, publication reversal warning. If fewer than 3 real items exist in a week, emit fewer and say so in DECISIONS. Calendar milestones for Phase D (2027-07-05, 2027-10-04, 2027-12-06, 2028-01-17, 2028-03-20) may appear as informational messages that state plainly "이 기능은 아직 구현되지 않았습니다".
- Senders are virtual titles (정책위원장, 사무총장, 데이터 책임자, 영입 책임자). Reports may carry uncertainty text. Keep every real-world label rule from `AGENTS.md`.

## 11. UI (C1)

- **Founding gate:** when `status === 'founding'`, all routes show the founding form (party name, short name, color from the palette, exactly 3 values with a one-line explanation of what each value will and will not do, the abstraction notice, the seed). A new-game seed field in advanced settings is allowed; keep the default seed behavior in the store.
- **Party page** (`/party`): founding summary, three declared values, expertise and ownership by domain, members, finance (ledger, weekly income/expense), staff level control, active research, internal-survey history. No politician or organization content yet.
- **Home:** resource strip (Money / Staff / Slots with next refill date), key alerts (max 5), date, 77 advances remaining, `SCHEDULED` election date label (it is a scheduled date, not confirmed).
- **Policy:** costs and remaining resources (§7).
- **Data Hub:** survey gating (§9).
- Remove "다음 단계에서 열립니다" for `/party`; update navigation phase badges and `FuturePage` text so it no longer says Party is a later phase. `/politicians` and `/organization` remain labelled stubs in C1. Keep desktop-first density and the no-red-vs-blue rule; no horizontal overflow at 390px.

## 12. C1 tests, simulation, CI, docs

Unit/regression (state relationships, not magic numbers where possible):
- Founding: rejected before `CREATE_PARTY`; one founding only; validation errors (values count/duplicates, name collisions, forbidden names, palette); after founding exactly 6 parties, all probabilities valid and sums exact; AI parties' decisions unchanged by when the player founds; no player key anywhere before founding.
- Determinism: founding then replay hash equal; Worker vs main-thread equal; save/export/import equal; `phase-b2-v2.json` rejected; new streams independent (adding a stream draw elsewhere does not move others).
- Resources: atomic failure leaves state and command log unchanged; refill is cap-not-accumulate; ledger conservation; arrears rules; staff-level changes; `money` never negative.
- Costs: publish deducts exactly; insufficient slots/staff rejected; no-op publish free; draft free.
- Expertise: AI fixed, player grows only via research/consistent publication, diminishing, capped, research survives save/load.
- Survey: gated display, cost, snapshot immutability, not used by polls/AI.
- Viability: first monthly update after founding uses only polls containing the player; no NaN.
- Port every B2 invariant test that referenced the preview party to the founded-party setup; list each ported/removed test in DECISIONS.

Simulation (`npm run sim -- --seeds 20`, nightly 500): update bots to found a party first: `idle` (found, no actions), `balanced` (found with 3 values, publish within slots, one staff level up, quarterly survey, research per quarter), `housing-focused`, plus a `spender` stress bot that tries everything every week to prove constraints bind. Assert: no NaN/Infinity, money/resources within bounds, ledger conservation, every refused command left state unchanged, B2 national invariants still hold (support sums, monthly cap, AI caps/diversity, replay), strategy ordering is informational only (do not assert a player support target).

CI/Docs: keep `check`/`release`/`deploy` gates strict; add the C1 simulation to the same job; update `README.md` ("Implemented in Phase C1" vs "Not implemented"), `docs/DECISIONS.md` (schema 3 decision, no-player world, stream names, golden regeneration with old→new hashes, resource rules, arrears rule, real-politician deferral, command/size limits, test porting list), `docs/VALIDATION.md`, `AGENTS.md` status (CURRENT STEP and current hashes). Do not oversell.

**C1 ends here. Stop and report if CURRENT STEP is C1.**

---

# C2

## 13. Virtual politicians (Full objects only)

State: `politicians: Politician[]` (the pool, stored in id order) with at most **80** Full objects ever generated.

```
Politician { id, name, gender, age, background, regionId, origin: 'GENERATED',
  attributes { recognition, localBase, campaigning, organization, media, negotiation, broadAppeal } /* integers 0–100 */,
  policyExpertise: Record<DomainId, number> /* integers 0–100 */,
  valueLean: Partial<Record<CoreValue, number>> /* Q6, drives matching and brand consistency */,
  domainInterest: Record<DomainId, number>,
  status: 'prospect' | 'recruited' | 'declined' | 'unavailable', availableUntil, cooldownUntil, trust /* 0–100 toward the player */ }
```

- Exactly the 8 attributes in Slice §20.4 (PolicyExpertise is per domain). **No** intelligence, morality, honesty, patriotism, corruption, or mental-stability attributes; no real-world claims about anyone. UI footer: "가상 인물입니다. 실존 인물과 무관하며 이름이 우연히 같을 수 있습니다."
- Generation uses named streams `(seed, 'politician-pool', date)`; background (지방의원, 정책연구원, 변호사, 의사, 간호사, 엔지니어, 교사, 기업가, 노동운동가, 시민단체 활동가, 전직 보좌진, …), region (weighted by cohort population), and domain/value distributions come from a data file. At founding, about 30 prospects appear; each monthly tick adds 1–3 (the count is drawn). The generator **guarantees ≥ 50 cumulative generated prospects by 2027-12-06**; if the draw falls short it tops up deterministically. Regional `후보발굴` investment raises the probability weight of prospects in that region but never creates more than the cap. Unrecruited prospects expire (`unavailable`) after a bounded period so storage stays bounded.
- Names: surname/given-name tables in data, unique among generated people, no collision with any Reality party/person name, any Reality `politicians` record (currently empty), or the denylist file `src/validation/real-name-denylist.json` (initially empty array plus a documented format; the owner may supply names later; the mechanism and its test use synthetic entries). Generated names must also pass the forbidden poll/media filter. The validator fails CI on a collision. Do not invent a "list of real politicians" from memory.
- Core values influence the **initial pool's interest** in the party (probability weights), not stats.

## 14. Recruitment and promises

- `RECRUIT_POLITICIAN { politicianId, role, promises: PromiseType[] }`. Costs Staff Capacity (+ Money). Roles: `member`, `policy_chair` (one slot), `secretary_general` (one slot). Promise types (Slice §21): `primary_guarantee` (총선 경선 보장), `policy_chair` (정책위원장), `regional_priority` (지역 우선공천).
- Success probability is a deterministic function (Q6) of: policy and value match (politician `valueLean`/`domainInterest` vs the party's declared values and **published** platform), party momentum (latest public poll range midpoint and awareness), role appeal, promises offered, personal `trust`, and party `recruitmentReputation`. The UI shows a qualitative band (낮음/보통/높음) before the attempt, never the exact number. The outcome is drawn from stream `(seed, 'recruitment', date)`; a refusal sets a cooldown and a small trust change. Same state + same choices ⇒ same outcome.
- `Promise { id, politicianId, type, madeAt, due, status: 'pending' | 'kept' | 'broken' }` is stored and shown. In C2: `policy_chair` is kept if the person is appointed within the stated window, otherwise broken; `primary_guarantee` and `regional_priority` stay `pending` with `due: 'NOMINATION'` until Phase D implements nomination (the UI says so). A broken promise lowers that person's `trust` and the party's `recruitmentReputation` (bounded, recovering slowly). Promises are never silently dropped.
- Recruited people can be given/removed roles; removing a promised role breaks the promise.

## 15. Regional organization (8 regions)

- Per region: `level` (0–100, starts very low, seeded within a small band), `members`, `office: boolean`, `activeInvestments[]`. Regions are the existing `REGION_IDS`.
- `INVEST_REGION { regionId, kind, intensity }`, `kind ∈ { member_drive, local_office, candidate_scouting, policy_forum }`. Each costs Money + Staff Capacity, may take several weeks, and is atomic. `local_office` adds weekly rent (affects §6 settlement) and Staff Capacity. Without upkeep, `level` decays slowly.
- Dues and Staff Capacity consume members/offices from here (so §6 numbers now depend on organization).
- Organization attributes of recruited politicians, regional `level`, and national party strength are three different values (Slice §22); in C2 the regional level is the aggregate that matters.

## 16. Effect channels into the voter chain (complete list; nothing else)

| Input | Channel in Phase C | Consumed in |
|---|---|---|
| Publication count/freshness (existing) | awareness exposure | B2 (unchanged) |
| Recruits' Recognition and Media (capped, diminishing) | party profile term inside awareness exposure | C2 |
| Regional organization level + `policy_forum` investment | per-region exposure multiplier for that region's cohorts | C2 |
| Research + recruits' PolicyExpertise (+ `policy_chair` role) | player expertise → ownership → trust (existing path) | C1/C2 |
| Declared values vs published platform vs recruits' `valueLean` | **brand consistency** → trust factor and identity target | C2 |
| Members | Money (dues), nothing else | C1/C2 |
| `candidate_scouting` + organization | prospect supply weights | C2 |
| Recruits' LocalBase, Campaigning, Organization, BroadAppeal, Negotiation; regional turnout mobilization; tactical-voting viability | stored/displayed only | **Phase D** |

Rules: all arithmetic stays Q6/integer; exposure bonuses are *added inside* the existing exposure term and clamped, never added to support; brand consistency is a bounded multiplicative factor on the player's trust (AI parties' factor is exactly 1, so AI behavior is unchanged), computed from declared values, published `valueTags` mass, and recruits' leanings; inconsistency accumulates slowly and recovers slowly (like `reversalPenalty`). The UI marks Phase D-only attributes "Phase D에서 사용됩니다".

## 17. Inbox expansion (C2 part)

Add recruitment (new prospects, accepted/declined, promise window ending), organization (investment complete, decay warning), and policy-chair/brand-consistency messages. Same rules as §10: real triggers only, max 5 on Home.

## 18. UI (C2)

- **Politicians page** (`/politicians`): prospect and roster tables (sortable, filter by region/background/domain), a detail panel with the 8 attributes, expertise by domain, status, trust, promise list; recruit dialog with role and promise choices, cost, and qualitative success band; role assignment. Phase D-only attributes labelled.
- **Organization page** (`/organization`): 8-region list with level, members, office, active investments, upkeep, and what each investment changes; a clear "what organization does not do yet" line.
- **Party page:** add roster summary, brand consistency (value → measured alignment, as ranges/labels, not a single score), promises.
- **Home:** key alerts cover recruitment/organization; resource strip unchanged.
- Navigation badges updated; `/election` still a Phase D stub. Accessibility basics (labels, focus order) for new forms; no horizontal overflow at 390px.

## 19. C2 tests

- Generator: same seed ⇒ same pool; unique names; no collision (synthetic denylist); cap 80; ≥ 50 cumulative by 2027-12-06 for every tested seed (property test over ≥ 50 seeds); regions follow population weights loosely; no forbidden attribute; scouting raises only probability weights.
- Recruitment: determinism; monotonicity (better value match ⇒ no lower probability, holding the draw fixed); cooldown after refusal; atomic cost; role slot limits; promise lifecycle; broken-promise effects bounded; promises survive save/load/replay.
- Organization: atomic costs, weekly rent, decay, aggregates equal sums, Staff cap formula, dues depend on members.
- Effects: awareness rises with organization/recruit profile *gradually* (not one-for-one), never directly changes support; brand consistency lowers player trust when contradicted and not AI's; AI decisions unchanged by player state (existing test); Phase D-only attributes have zero effect (assert unchanged analysis).
- Regression: all C1 tests, all ported B2 invariants, replay hash, Worker/main-thread equality, schema rejection of B2 and C1 saves.
- Playwright (real browser): found a party → publish a lever (cost shown) → survey → recruit → invest → advance months → save/reload equal hash; a refused action shows the reason; 390px overflow check; `/election` stub still honest.

## 20. C2 simulation, balance report

Bots: `idle`, `balanced` (recruits best match monthly, invests a rotating region, researches quarterly, surveys quarterly), `housing-focused` (housing values, housing experts, few regions), `regional` (one region), `spender`. Assert the C1 invariants plus: pool/promise/organization invariants above, resources within bounds, every refused command a no-op. Produce a short balance report (in `docs/VALIDATION.md`) with ranges only: final player Current Support range, awareness, ownership by domain, cumulative recruits, solvency, by strategy over 20 seeds; compare variance across seeds (same strategy) with variance across strategies (same seed) and report honestly. These are development-seed model outputs, **not election balance or predictions**; do not tune anything to hit a target and do not claim calibration (15 of 20 initial calibration comparisons are still outside tolerance, and Phase D has not started).

## 21. Docs and CI (C2)

README "Implemented in Phase C" vs "Not implemented (Phase D/E)"; `DECISIONS.md` (generator design, name-denylist mechanism and the owner's TODO, recruitment function, promise rules, organization rules, effect-channel table, goldens old→new, limits); `VALIDATION.md`; `AGENTS.md` status → "Next: Phase D"; mark this file complete/historical. Gates unchanged and strict. Add `tests/fixtures/c2-golden.json` generated once by a documented command sequence.

## 22. Acceptance

C1 is accepted when: a player can found a party (3 values, abstraction notice), advance weeks, edit and publish positions with real costs, see Money/Staff/Slots and a ledger, commission a survey that gates the Potential/Current/Barrier view, and everything is replay-, save-, Worker-, and hash-consistent; no preview object remains.

C2 is accepted when, additionally: a player can inspect generated prospects, recruit with promises, appoint roles, invest in the 8 regions, and watch awareness/ownership/trust respond gradually through the §16 channels only; resources constrain choices; promises are tracked and honest about Phase D; all new tests, the 20-seed multi-strategy sim, strict data validation, release build, and Playwright pass; docs are updated.

## 23. Report format

When a step is done, report: what works, what is stubbed (and how the UI labels it), decisions you made where this prompt was silent (also in `DECISIONS.md`), test/sim/validation results with the new hashes, and what the next step needs. Do not describe effort; do not claim election balance, calibration, or real-world accuracy.
