# Codex Implementation Task — HOUSE OF CARDS: KOREA v1.0 rev2

**CURRENT PHASE: A**   <!-- Change to B, C, D, E for each subsequent task. Run ONE phase per task. -->

## 0. How to use this prompt

- The attached **`HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md`** (the "Slice Spec") is the **source of truth**. This prompt summarizes it and defines how to execute it. **If they conflict, the Slice Spec wins.** If the Slice Spec is silent or ambiguous, choose the simplest option that keeps the simulation chain intact (section 7) and record the decision in `docs/DECISIONS.md`.
- Persistent rules live in the repository-root **`AGENTS.md`** (provided separately). Read it first and keep it updated if a rule changes.
- Execute **only the phase named in `CURRENT PHASE`** (see section 12). When it is complete, stop and report: what works, what is stubbed, what the next phase needs. Do not start the next phase.
- The app must remain **playable/runnable after every phase**, with stubs clearly labelled in the UI as "not implemented in this phase" rather than fake data.

## 1. Product

Build a playable vertical slice of a Korean political-party management simulation, structurally inspired by Football Manager (FM). It is NOT a historical-event replay, visual novel, quiz, morality game, election calculator, or admin dashboard.

The game starts from a real-world Korean political snapshot (**2026-10-19**). Real parties and selected real politicians exist as starting actors. The player creates and manages a new third party. Future politics are simulated, not scripted.

Core fantasy:

> Build a small political party by developing policy platforms, recruiting candidates, building regional organization, converting policy fit into real votes, and contesting the **2028-04-12** National Assembly election.

The player mostly: reads an Inbox, reviews staff reports, adjusts platform positions, scouts and recruits politicians, invests in regional organization, checks polls and data, selects candidates, runs the final-push campaign, and watches election night.

## 2. Tech stack

Vite, React, TypeScript, Tailwind CSS, Zustand (or similarly lightweight predictable store), IndexedDB (saves), Vitest, GitHub Actions, GitHub Pages.

- No backend. The core game works fully offline after the static site loads.
- No external AI/API dependencies in the core simulation.
- The simulation engine is **pure TypeScript with no React/DOM imports**. A Web Worker is a **thin wrapper** around the same engine API; the engine must also run on the main thread and in Node (tests). Use the Worker for UI responsiveness and batch runs.
- Vite `base` must match the repository path. Routing must survive refresh on GitHub Pages (`HashRouter` or `404.html` fallback). Document the choice.

## 3. Reality vs simulation (strictly separated)

- **REALITY** (read-only): real parties, selected real politicians, regions, election-law state, public statistics. Each fact has `source` and `verifiedAt`; metrics have `asOf`. Unverified legal numbers are marked `UNVERIFIED_ASSUMPTION` (see Slice Spec §7.4); development builds warn, **release builds fail CI** if any remain.
- **SIMULATION SEEDS**: game interpretations derived from reality (policy priors, organization estimates, politician ratings, issue salience seeds).
- **SAVE**: everything after 2026-10-19.

Never mutate the reality pack. Every screen showing real people/organizations must distinguish `REAL-WORLD BASELINE` from `SAVE SIMULATION`. Do not generate fictional crimes, corruption, health claims, or private-life scandals for real politicians. Use fictional poll-house names, never real polling firms or broadcasters. Polls, counts, and Election Night show a persistent "simulation" notice.

## 4. Calendar

- Weekly tick on Mondays. First tick **2026-10-19 (Mon)**; last tick before the election **2028-04-10 (Mon)** (77 ticks); election day **2028-04-12 (Wed)**.
- Heavy computation monthly (last Monday of month): issues, cohort reactions, AI party strategy, polls, organization growth. Weekly ticks stay light.
- Auto-pause when a decision needs the player; fast-forward otherwise.
- Election preparation unlock dates: **2027-07-05** target-district scouting; **2027-10-04** candidate scouting, nomination rules, primaries; **2027-12-06** proportional list. **Final Push** (12 weeks) starts **2028-01-17**. Candidate registration closes **2028-03-20**. After the election, show Election Night then Season Review, and end.
- "Final Push" (game mechanic) and the statutory 13-day official campaign (flavor only) are different; keep terminology separate.

## 5. Election Ruleset (data-driven; do not hard-code 254/46/3%)

The 2028 election law is unresolved (as of 2026-10-18): current law is semi-compensatory (2020, 2024); the Constitutional Court struck down the 3% threshold on 2026-01-29 with no replacement enacted; the People Power Party is pushing a return to the parallel system. The game uses an explicit **game-assumption Ruleset** and must never claim to predict the actual law.

Implement rulesets as data files (see Slice Spec §7.4 for the schema):

| rulesetId | Status |
|---|---|
| `parallel_46_open` (**default**) | required |
| `parallel_46_threshold_3` | required (parameter change only) |
| `semi_compensatory_30` | schema and engine hooks required; UI exposure optional |

- Show on every relevant screen: "이 세이브의 선거제도: {label} — 실제 2028년 선거제도는 아직 확정되지 않았습니다."
- Save stores `rulesetId` and a snapshot of the ruleset.
- District rule: single-member plurality. List rule for `parallel`: Hare quota + largest remainder among eligible parties. `semi_compensatory`: coupling 0.5, cap 30, satellite mode `none | major_parties_neutralize`; include hand-computed test cases.
- Property tests for every ruleset: seat total = district seats + list seats; no negative seats; monotonicity (more votes never reduces list seats, all else equal).
- Party revocation, deposits, reimbursement, dual-candidacy ban and list gender rule are Ruleset parameters (several `UNVERIFIED_ASSUMPTION`).
- Policy levers in the Political Reform domain are **platform positions only**; they never change the Ruleset in v1.0.

## 6. Policy: Platform vs Government

The player party has no seats and cannot enact policy. Split policy into two layers:

- **Platform (공약)**: used by the player and all AI parties. Affects perception, identity, issue ownership, expertise, and cohort policy fit. Does NOT directly change social indicators.
- **Government policy**: the governing party's (`governingPartyId` in the reality pack) enacted levers (`enactedPolicy`), updated quarterly by its AI, with implementation delay. This and the economy and shocks drive issue severity/trend.

Rules:
- Six domains (Housing, Family/Low Birth Rate, Pension, Healthcare, Industry/AI, Political Reform), 5–6 levers each (list in Slice Spec §11), scale **0–4 where 2 = status quo**; each lever has a named axis for what "4" means.
- Platform levers have a draft state (free to change) and a published state (costs 1 Agenda Slot + Staff Capacity). Only published positions affect voters. Reversing a published lever within 6 months lowers consistency/trust.
- Never display "this policy gives +4% votes". Display qualitative forecasts ("supply ↑↑", "household debt ↑?") labelled "if enacted".
- Prevent dominant strategies (maxing every lever): fiscal-credibility perception, consistency, and Agenda Slot costs must bite.
- Each lever carries `valueTags` linking it to the ten core values (Slice Spec §14).

## 7. The simulation chain (the central requirement)

The following chains must be real code paths, not static UI:

```text
published platform → cohort policy fit → (× awareness) → utility → vote choice
   → polling → viability perception → tactical voting → district + list result → seats

organization → candidate discovery → campaign execution → viability
```

Voter model (full detail in Slice Spec §18): define symbols first, then build in steps:
1. Policy fit F = salience-weighted closeness between cohort preference and party's **published** platform.
2. Utility U = β·[fit, identity distance, trust/ownership, prior-party loyalty, **government-approval term**, viability] + noise.
3. Awareness gate: parties the cohort is unaware of are not in its choice set.
4. Choice: multinomial logit over the consideration set; scale by turnout.
5. Two ballots computed separately: **party-list vote** (no candidate/local-organization terms) and **district vote** (adds candidate, local organization, local issue fit; viability computed per district).

Track separately: **Potential Support** (awareness=1, viability equalized), **Current Support**, party-list intention, district intention. Barrier decomposition = gain when each barrier (awareness, tactical voting, prior loyalty, local organization) is removed. The UI must explain the gap.

Tactical voting is mandatory: perceived viability is an S-shaped function of local poll share and the gap to the leaders (steepest roughly between 15–30%); leakage declines non-linearly as viability rises. No explicit "momentum bonus".

## 8. Entities and scale

- **Cohorts**: 96 = 8 regions × 4 age bands (18–29, 30–44, 45–59, 60+) × 3 life profiles (Housing Pressure, Family & Work, Asset & Retirement). Profile weights are conditional on region×age (sparse; no unrealistic uniform cross product). Calibrate initial preferences separately from demographics; never hard-code "group X votes for party Y".
- **Districts**: all **254** have a Light record (region, 12-cell cohort-mix vector, 2024 baseline, incumbent, minimal candidate data). **30** are Active with detailed layers. District vote = region cohort preference × district mix + baseline residual.
- **Politicians**: Full objects (real core ≤ 20, fictional recruitable ≤ 60) with 8 attributes (Recognition, LocalBase, Campaigning, Organization, Media, Negotiation, PolicyExpertise per domain, BroadAppeal); Light records (3 attributes) for AI-party and background candidates. No intelligence/morality/honesty/corruption/mental-stability attributes. Real politicians' ratings are labelled GAME MODEL estimates.
- Fictional recruits are **seed-generated** (30 at start + 1–3/month), guaranteeing ≥ 50 cumulative available by 2027-12-06. Name generation must avoid collisions with real politicians (validator). Dual candidacy is banned by ruleset flag, so up to 45 distinct people are needed (≤ 30 districts + 10–15 list).
- **Parties**: Democratic Party of Korea, People Power Party, Reform Party, Rebuilding Korea Party, aggregated minor-party bloc, Player. AI parties use the same policy system, information, and voter model; platform priors come from reality-pack tags and evolve with leadership, issues, opinion, and election pressure. Never hard-code "party X is always Y".
- **Resources**: Money, Staff Capacity, Agenda Slots (do not add more currencies). Finance: dues income; no/limited state subsidy for a non-parliamentary party (`UNVERIFIED_ASSUMPTION`); deposits and reimbursement per ruleset create a real cost to running many candidates.
- **Party survival**: 0 seats and list vote share below the ruleset threshold ⇒ registration revoked (ending state with re-founding option). 0 seats above the threshold ⇒ extra-parliamentary survival.
- **Core values** (ten options, pick three) are identity constraints and recruitment signals, never flat stat bonuses. Every value must be measurable through lever tags or non-lever signals (candidate mix, list composition, investment distribution) per Slice Spec §14.

## 9. UI

Desktop-first (1440px), neutral charcoal/off-white; party colors identify parties only (do not style as red-vs-blue).

Navigation (8): Home (Inbox), Korea, Policy, Party, Politicians, Organization, Election, Data Hub (includes Polls tab). Special modes (2): Election Night, Season Review.

- **Home**: answers "What should I do now?"; at most **5** high-priority items; date, election countdown, support range, seats, key issue, Inbox.
- **Inbox**: 3–7 meaningful messages per week from fictional staff roles; priorities Critical / Action Required / Important / Report / FYI; reports may contain uncertainty.
- **Korea**: six issue cards (severity, salience, trend, recent change) with drill-down.
- **Policy**: six domains, levers (draft/published), expertise, issue ownership, "if enacted" forecasts; no good/bad rating.
- **Party / Politicians / Organization / Election**: as in Slice Spec §20–§27. Real politicians show separate REAL-WORLD BASELINE and SAVE SIMULATION sections.
- **Data Hub Lite** (exactly 4 views): Potential vs Current (with barrier breakdown), support by age, support by region, vote-flow. Always confidence ranges; include "save-model estimate" notice. Subgroup ranges are wider than the topline.
- **Polls**: ranges, an explicit "none/undecided" category, fictional poll houses with house effects, wider subgroup errors. Never expose the exact hidden electorate state. Potential/Current/Barrier come from paid internal surveys (Money + Staff Capacity).
- **Election Night**: distinct UI; sequence polls close 18:00 → exit poll (separate error) → counting → district leaders change → projected seats → list vote → final allocation; speed controls and instant skip. The biggest emotional payoff.
- **Season Review**: national list vote, district seats, list seats, total, best/weakest region, strongest voter growth, strongest policy, best recruit, closest loss, biggest organizational weakness, a ruleset explanation ("why this vote share became these seats"), revocation branch, and next-season unlocks by seat count.

## 10. Persistence and determinism

- Autosave, manual save, IndexedDB, JSON export/import.
- Save includes at least: `schemaVersion`, seed, per-stream `rngState`, realityPackId + asOf, `rulesetId` + snapshot, date, player party (draft/published platform, values, expertise, ownership), resources and finance, Full politicians, Light candidates, promises, AI party states (platforms, enactedPolicy), issues, cohorts, districts, polls, inbox, event log, election/campaign state, optional `commandLog`.
- Same save + same choices + same seed ⇒ same outcome.
  - Split RNG into independent named streams derived from `(seed, subsystem, date)`.
  - Do not rely on engine-dependent math (`Math.exp/log/pow`, trig) for outcome-affecting values; use your own deterministic implementations or fixed tables and fixed rounding.
  - Iterate in sorted-ID order.
  - Verify with a state **hash**: hash(save→load) equals hash(original), and equals hash(replay of `commandLog`).

## 11. Architecture

```text
Reality Pack → Seed Builder → Simulation State → Command → Reducer/Engine → Event Log → UI
```

Explicit commands (extend as needed): `CREATE_PARTY`, `ADVANCE_WEEK`, `SET_PLATFORM_DRAFT`, `PUBLISH_PLATFORM`, `RESPOND_INBOX`, `RECRUIT_POLITICIAN`, `MAKE_PROMISE`, `INVEST_REGION`, `COMMISSION_POLL`, `SELECT_TARGET_DISTRICT`, `SET_NOMINATION_MODE`, `NOMINATE_CANDIDATE`, `SET_LIST`, `SET_CAMPAIGN_MESSAGE`, `ALLOCATE_CAMPAIGN_RESOURCES`. React components never mutate simulation data.

## 12. Phases (run only CURRENT PHASE)

Each phase ends playable. Each has its own tests and acceptance.

### Phase A — Foundation
Repo scaffold, Tailwind, routing (Pages-safe), Zustand, IndexedDB persistence + JSON export/import, seeded RNG with named streams, deterministic math helpers, state hash, thin Worker wrapper, Vitest, `AGENTS.md`, `docs/DECISIONS.md`, reality-pack types + **validator** (CI-failing rules from Slice Spec §33), GitHub Actions (checkout → Node → `npm ci` → typecheck/lint → test → data validation → build → deploy), a stub Home with the date advancing weekly.
**Accept:** deploys to GitHub Pages, refresh works on a sub-route, RNG/hash/save-load determinism tests pass, validator catches seeded violations.

### Phase B — Core simulation
Calendar, issue engine (monthly), platform/government policy layers with lever data and value tags, cohort model (96, conditional weights), voter utility chain, AI parties (same engine), polling (noise, undecided, fictional houses), finance basics.
**Accept:** AI-only run 2026-10-19 → 2028-04-10 for ≥ 20 seeds without NaN/impossible values; published-platform change visibly moves Potential Support but not Current Support one-for-one; unit tests for fit, utility, polling error.

### Phase C — Party management
Party creation (three values), politicians (Full/Light, seed generator, name-collision check), recruitment + promises, regional organization (8 regions), resources, Inbox, Politician/Party/Organization/Policy screens.
**Accept:** player can found a party, recruit, invest, publish positions; resources constrain choices; promises tracked.

### Phase D — Election
Ruleset loader + three presets, 254 Light + 30 Active districts, target selection, nomination, proportional list, Final Push, tactical voting, district and list results, seat allocation, party revocation.
**Accept:** full run to election day for the player; ruleset property tests; tactical-voting leakage declines non-linearly with viability; same seed + choices ⇒ same seats.

### Phase E — Experience and balance
Election Night, Season Review, Data Hub Lite, polish, accessibility, bot-player balance harness.
**Accept:** the 15 acceptance steps below, plus the balance report.

## 13. Tests

Unit: seeded RNG, deterministic math, policy effects, cohort utility, polling error, tactical voting, district vote, seat allocation (all rulesets), save/load determinism (hash), validator.

Simulation:
- **AI-only**: a default balanced bot plays the third-party seat. A small seed set (≈ 20) runs in PR CI; a full run (≈ 500) is a nightly/manual workflow. Check: no NaN, seat totals exact, first-party distribution not collapsed to 100% one side, majority probability plausible, third-party seats neither always 0 nor always dominant.
- **Bot players**: `idle`, `balanced`, `specialist` (housing + a few regions), `regional` (one region). Report outcome distributions by ruleset. Compare variance across seeds (same strategy) with variance across strategies (same seed); most variance should come from choices, not RNG.
- Initial balance targets (default ruleset, to be recalibrated): fail 0–1 seats, survive 2–6, success 7–12, great 13+. They are calibration goals, not forced probabilities. Third-party history (2016 People's Party, 2020 Justice Party, 2024 Rebuilding Korea and Reform Party) is a sanity anchor; verify figures before using.

## 14. Do not overbuild

Do NOT implement: parliamentary committee simulation, filibuster, audits, presidential or local elections, detailed factions, merger/split, newgen history, every Korean politician, live web data, LLM-generated outcomes. Leave clean interfaces.

If a subsystem cannot be implemented deeply enough, **simplify its breadth rather than substituting fake static UI.**

## 15. Final acceptance criteria (after Phase E)

The task is complete only when I can:

1. open the GitHub Pages site (and refresh a sub-route),
2. create a new party,
3. select three founding values,
4. advance the calendar,
5. change and publish policy positions,
6. recruit politicians,
7. invest in regions,
8. observe noisy polls (with an undecided category),
9. choose target districts,
10. nominate candidates,
11. create a proportional list,
12. run the 2028 election under the selected ruleset,
13. watch Election Night,
14. see a Season Review (including a ruleset explanation and the 0-seat branch),
15. save/export and reload the exact same save (hash-equal).

## 16. Quality bar

Do not deliver a toy dashboard with buttons that directly add support. The user must be able to inspect *why* outcomes changed without seeing every hidden formula. Prioritize a coherent, replayable loop over feature count: the first playable version of a serious political Football Manager, not a mockup.

## 17. Release checklist (before any public launch; not part of Phase A–E)

1. Remove or verify every `UNVERIFIED_ASSUMPTION`.
2. Confirm that all real-person election outcomes are clearly marked as simulation.
3. Obtain expert review on election-law implications of publishing simulated polls/results near the real 2028 election. This prompt is not legal advice.
4. Confirm data source terms of use.
