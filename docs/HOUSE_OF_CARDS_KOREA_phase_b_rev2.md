# HOUSE OF CARDS: KOREA — Phase B Implementation (rev2)

Repository: `KINGJNU-sakayume/houseofcards`

**CURRENT STEP: B2**   <!-- Run B1 first. Stop and report. Then change to B2 for the second task. -->

Phase B is split into two steps. Execute **only the step named above**. When the step is done, stop and report; do not start the other step or any Phase C/D/E work.

- **B1 — Foundations of the simulation:** sections 1–12 and the B1 tests. (Snapshot boundary, schema v2, policy/lever data, platform vs government layers, issue engine, cohorts, Reality/Seed separation, deterministic streams.)
- **B2 — The political chain:** sections 13–28 and the B2 tests. (Voter model, Potential/Current, barriers, AI parties, government AI, polling, UI, simulations, docs, CI.)

If you run B2, first confirm B1 is merged and its tests pass.

---

# 1. First: inspect the repository

Before changing anything, read at minimum:

- `AGENTS.md`
- `README.md`
- `docs/HOUSE_OF_CARDS_KOREA_v1.0_rev2_vertical_slice.md` (the **Slice Spec**, source of truth)
- `docs/HOUSE_OF_CARDS_KOREA_codex_implementation_prompt_v1.0_rev2.md`
- `docs/DECISIONS.md`
- `docs/VALIDATION.md`

Also inspect the existing engine architecture, save codec, IndexedDB persistence, Web Worker wrapper, deterministic RNG, fixed-point math, state hashing/replay, data validation, tests, and GitHub Actions.

The current repository is a successful **Phase A foundation**. Do NOT rewrite it. Do NOT change the visual design unnecessarily. If this prompt conflicts with the Slice Spec, the Slice Spec wins; record the conflict in `docs/DECISIONS.md`.

# 2. Preserve the Phase A architecture

```text
React UI
↓ commands only
pure TypeScript simulation engine
↓
immutable GameState
↓
event log / save
```

Keep: pure engine with no React/DOM dependency; thin Worker wrapper; main-thread fallback; deterministic named RNG streams; fixed deterministic outcome math; state hash; command replay verification; Reality / Seed / Save separation; IndexedDB autosave/manual save; JSON import/export; GitHub Pages deployment (`base: /houseofcards/`, `HashRouter`); existing CI validation. Do not replace these with shortcuts.

# 3. Fix the reality snapshot boundary

```text
REAL-WORLD SNAPSHOT: through 2026-10-18
SAVE SIMULATION START: 2026-10-19
```

```ts
realityPackAsOf = "2026-10-18"
simulationStartDate = "2026-10-19"
```

Rename the foundation/reality pack if needed so it does not imply 2026-10-19 events are real. Do not alter the actual game start date. Update docs and tests.

# 4. Phase A save migration policy

- Phase A: `schemaVersion 1`. Phase B: `schemaVersion 2`.
- **Reject** Phase A saves with a clear Korean message explaining that Phase A preview saves are incompatible (offer to keep the JSON export). Do not invent missing political state.
- Test the rejection explicitly. Record the decision in `docs/DECISIONS.md`.
- Adding state fields changes golden hashes. Regenerate golden fixtures **deliberately**, once, and record why in `docs/DECISIONS.md`. New named RNG streams must be derived by *name* so existing streams' sequences are unchanged; add a regression test proving that.

# 5. Phase B objective

Implement the first real simulation chain:

```text
social conditions → issue severity / salience
published platform → cohort policy fit
→ awareness / trust / viability / loyalty / government evaluation
→ Potential Support → Current Support → noisy polling
```

Also implement non-player party policy behavior using the same policy model. Every visible support change must arise through the voter model. The result must NOT be "click policy → support +3".

# 6. Six policy domains and levers

Implement exactly: Housing, Family / Low Birth Rate, Pension, Healthcare, Industry / AI, Political Reform. Use the lever list in Slice Spec §11 (5–6 levers per domain).

Each lever: scale `0–4` with `2 = status quo`; stable ID; Korean display name; domain; axis description (what "4" means); `valueTags` (links to the ten core values, Slice Spec §14); fiscal implication; implementation-delay metadata; effect channels; uncertainty metadata. Do not reduce a domain to one left/right number.

# 7. Platform and government policy are separate (mandatory)

- Every party (player and AI) has a **PLATFORM**: what it advocates. It affects policy fit, party identity, consistency, issue ownership, voter perceptions. It does NOT directly change social indicators.
- The **governing party** (`governingPartyId`, Reality) also has **ENACTED GOVERNMENT POLICY** (`enactedPolicy`). Only enacted policy, structural conditions, and external shocks affect social indicators.
- **Initial `enactedPolicy` = 2 on every lever** (status quo is by definition current policy), unless a verified Reality fact says otherwise.
- The player starts outside government and cannot change national indicators by editing a manifesto.

# 8. Draft vs published platform

Each platform lever has `draftValue`, `publishedValue`, `publishedAt`.

- Drafts are free to edit and have **exactly zero** effect on any outcome (test it: changing a draft leaves state hash of simulation fields unchanged).
- Only published positions affect voters.
- Publishing will consume Phase C resources (Agenda Slot + Staff Capacity). In Phase B use a simplified publication command; mark costs "deferred" in code and docs. Do not invent resource numbers.
- **Consistency memory:** substantially reversing a recently published lever creates a consistency penalty (a decaying value) in trust. Simple, deterministic.

# 9. Issue state

Per issue: `severity`, `salience`, `trend`, `structuralPressure`, `lastUpdated` (all within defined ranges). Monthly update on the existing monthly tick. Severity and salience are different (e.g., Pension: severity high, salience medium; Housing: severity high, salience very high). Salience responds to severity level, severity change, and shocks, with inertia — it is not set equal to severity.

**Labeling:** initial severity/salience values are **SEED indices** ("save-model index"), not real statistics. Real measurements may be stored in Reality (with `source`, `asOf`, `verifiedAt`) as context, but seeds must not be presented as real data. UI shows "게임 모델 지수".

# 10. Social-state update model

Simple but real monthly dynamics (not macro realism). Each domain has: inertia; enacted-policy effects (with implementation delay; multi-year for slow domains such as housing supply and fertility); structural pressure; small deterministic shocks from named RNG streams. Domain drivers as in the original brief (housing: supply/financing/rental stress; family: housing burden, childcare, work-family, inertia; pension: contribution burden, generosity, fiscal sustainability, ageing; healthcare: regional access, essential-care pressure, workforce, spending; industry/AI: investment, R&D, energy/infrastructure, global demand shock; political reform: mainly salience, trust, institutional preferences). Avoid claiming forecasts of real Korea; these are save-model mechanics.

# 11. 96 voter cohorts

`8 regions × 4 age bands × 3 life profiles = 96`. Regions: Seoul, Gyeonggi/Incheon, Chungcheong, TK, PK, Honam, Gangwon, Jeju. Age: 18–29, 30–44, 45–59, 60+. Profiles: Housing Pressure, Family & Work, Asset & Retirement.

- **Conditional weights**, not uniform: weight(region, age, profile) = P(region, age) × P(profile | region, age). Region×age marginals come from Reality statistics (with provenance, or `UNVERIFIED_ASSUMPTION`). Profile conditionals are Seeds (e.g., Asset & Retirement is heavier among 60+ than 18–29; Housing Pressure heavier in Seoul/Gyeonggi among 18–44).
- Weights sum to exactly 1 (use a deterministic normalization), none negative. Small cells are allowed.
- Cohort preferences/salience reflect **life conditions**, not party allegiance. Do not hard-code "young Seoul = X". Party attachment calibration belongs to Seeds (stream `cohort-calibration`).

# 12. Reality / Seed / Save separation

- **Reality:** party names, official platform tags, relevant verified metrics, `governingPartyId`, election-law state (see below). Each fact: `source`, `verifiedAt`; metrics also `asOf`. Use official or authoritative sources; do not copy unverified numbers from older design documents. If a value cannot be verified use `UNVERIFIED_ASSUMPTION` (release CI must fail until resolved). **Do not fabricate facts to make the validator pass.** If you have no network access, say so in the report and mark items accordingly.
- **Do NOT load current party leadership names** in Phase B; they are not needed and are error-prone. (Optional later, with verification.)
- **Reality additions needed by Phase B:** the real parties included; `governingPartyId`; official platform tags per party; a government-approval metric if verifiable (else `UNVERIFIED_ASSUMPTION`); `calibrationTargets` (latest election results by region and, where verifiable, a recent aggregate of public polling) with provenance.
- **Election-law state (pre-checked by the human reviewer on 2026-10-18 from news reports; store with source URLs and `sourceQuality: "secondary_news"`, and upgrade to primary sources — Constitutional Court / National Election Commission — if you can reach them):**
  - Current law is semi-compensatory proportional representation (applied in 2020 and 2024); constituency seats 254 + list seats 46.
  - The Constitutional Court ruled the 3% list-seat threshold unconstitutional on 2026-01-29 (7–2); no replacement threshold had been enacted.
  - The People Power Party announced (2026-09) it will push to return to the parallel system; the Democratic Party's position was undecided. 2028 constituency boundaries unsettled.
  - The 2028 National Assembly election is scheduled for 2028-04-12 (Wed).
  - Status of the 2028 law: `UNRESOLVED`. Phase B only needs `electionDate` for the countdown; the ruleset engine is Phase D.
- **Seeds:** initial awareness, issue-ownership seed, party attachment calibration, policy-prior weights, identity vectors, severity/salience seed indices, opposition alignment. Never put Seed interpretation into Reality records.
- **Save:** everything after 2026-10-19 (platform changes, polls, issue movements, AI decisions).
- **Labeling real parties:** the lever positions of real parties are **GAME MODEL estimates derived from official platform tags** (cite the tag source). The UI must show them as such, never as official positions. No ideology scores, no moral ratings.

## B1 tests

- Snapshot/start-date separation; schema v2 round-trip hash equality; Phase A save rejection (Korean message); RNG-stream-name regression; golden-fixture regeneration recorded.
- Exactly 96 cohorts; weights sum to 1; no negatives; Asset & Retirement weight higher among 60+ than 18–29 in the same region; profile conditionals not uniform.
- Lever data validity (IDs unique, ranges, tags reference valid core values, every core value reachable via at least one lever tag or declared non-lever signal).
- Draft edits do not change simulation outcomes; opposition platform changes do not change social state; enacted policy changes affect issue state only after its delay.
- Issue values stay in range over 77 weeks × 20 seeds.
- Data validator: no Seed fields in Reality; no real polling firms or broadcasters' names anywhere in data (maintain a forbidden-names list).

**B1 ends here. Stop and report if CURRENT STEP is B1.**

---

# 13. Voter model (B2) — defined in stages

Define symbols first, then build step by step. Implement with deterministic fixed-point math; **no sampling of individual voters** and no Monte Carlo inside the cohort model, so responses are smooth and testable.

## 13.1 Symbols
- `c` cohort, `p` party, `d` policy domain.
- `s_cd`: salience cohort `c` gives domain `d` (from issue salience and cohort sensitivity).
- `fit_cpd ∈ [0,1]`: closeness between cohort preference and party's **published** platform in domain `d`.
- `A_cp ∈ [0,1]`: share of cohort `c` that is aware of party `p`.
- `I_cp`: identity proximity (cohort identity vector vs party identity vector over the ten core-value axes; party identity is derived from its published platform's `valueTags` and declared values, not hand-set).
- `T_cp`: trust / issue ownership (ownership in the domains the cohort cares about, scaled by consistency).
- `L_cp`: prior-party attachment (Seed calibration).
- `G_cp`: government-evaluation term (see 13.4).
- `V_p`: national viability perception (see 13.5).
- `U_cp`: utility; `U_c0`: utility of "none / undecided".

## 13.2 Steps
1. **Policy fit:** `F_cp = Σ_d s_cd · fit_cpd / Σ_d s_cd`.
2. **Utility:** `U_cp = β_F·F_cp + β_I·I_cp + β_T·T_cp + β_L·L_cp + β_G·G_cp + β_V·V_p` (coefficients are configuration; document defaults). Include a deterministic party-specific baseline only if justified in `DECISIONS.md`.
3. **Consideration set (exact, no sampling):** a cohort considers a random subset `S` of parties; with six parties there are at most 64 subsets.
   - `P(S) = ∏_{p∈S} A_cp · ∏_{q∉S} (1 − A_cq)`
   - Within `S ∪ {none}`: `σ_S(p) = e^{U_cp} / (e^{U_c0} + Σ_{q∈S} e^{U_cq})`
   - `share_cp = Σ_{S∋p} P(S) · σ_S(p)`; undecided share is the remainder (so **undecided arises from the model**, not a constant).
   - Use the existing deterministic fixed-point exp (or extend it carefully).
4. **Turnout-weighted aggregation** over cohort weights to national and subgroup values.

This is the **party-list-style national intention** only. District intention and tactical district voting are Phase D. Name it `currentSupport` (national party support).

## 13.3 Dynamics inputs (must be defined, not left implicit)
- **Awareness `A_cp`:** rises with exposure from *published* platform content weighted by domain salience, with diminishing returns and a cap; decays slowly without exposure; seeded start (player party low). No instant jumps.
- **Expertise:** fixed from Seeds in Phase B (research resources arrive in Phase C).
- **Ownership / trust `T_cp`:** moves slowly toward a credibility target built from consistent publication, seeded expertise, and governing/opposition status; consistency penalty from reversals decays over months.
- **Identity `I_cp`:** follows the party's platform aggregate with inertia.
- **Loyalty `L_cp`:** slow decay/erosion influenced by long dissatisfaction; never auto-flips.

## 13.4 Government evaluation `G_cp`
Mid-term elections are heavily shaped by evaluation of the government. Let `a_t ∈ [−1,1]` be a government-approval index (from the Reality metric if verified, else a Seed flagged `UNVERIFIED_ASSUMPTION`; it then evolves from issue conditions in the save). Let `g_c ∈ [0,1]` be the cohort's sensitivity. Then `G_cp = g_c · a_t · s_p`, with `s_p = +1` for the governing party and negative values for non-governing parties distributed by a Seed "opposition alignment" so the total effect is roughly zero-sum. Document in `DECISIONS.md`.

## 13.5 Viability `V_p` (avoid circularity)
- Input is the **previous published poll average** (lagged), not the same-tick Current Support.
- S-shaped response with the knee configurable; **couple the knee to the election ruleset's effective list threshold** (default ruleset: about 1/46 ≈ 2.2%; the old 3% preset moves it) plus a general "electability" perception. Parameters in configuration.
- Cap month-over-month change to prevent runaway or collapse.
- District viability is Phase D.

# 14. Potential vs Current (mandatory)

- **Current Support:** the model as above with real `A`, `V`, `T`, `L`, `G`.
- **Potential Support:** counterfactual with `A_cp = 1` for the party and `V_p` set to a **neutral value = the median of the top two parties' V**. Trust, loyalty, identity, and government evaluation are **retained**.
- Potential ≥ Current is expected for a small new party but is not enforced by clamping. For major parties Potential may be lower than Current; that is acceptable. If a result looks wrong, inspect the model.

# 15. Barrier decomposition

Expose an engine/API function that estimates the Potential – Current gap contributions from: awareness, viability, prior loyalty (extra gain when loyalty is also neutralized), policy mismatch / weak ownership. Method: marginal change when each barrier is removed one at a time (report that interactions mean parts do not sum exactly). Label it a **save-model estimate**. The Data Hub UI can stay minimal; the data must be exposed.

# 16. Party model

Parties: Democratic Party of Korea, People Power Party, Reform Party, Rebuilding Korea Party, aggregated Minor Parties, and a **temporary player-party test object** seeded only to exercise the voter model. Define a fixed, documented **development-preview player platform** (e.g., housing-centric) and label it "개발 프리뷰" in the UI. Do not build player-party creation (Phase C). Do not let the temporary object become product UI.

# 17. AI party policy behavior

AI parties use the same platform data model. Monthly strategy update considers: existing platform, Seed priors from official tags, issue salience, voter opportunity, consistency cost, current support, governing/opposition status.

- Most months make **no change or one small change**; set a configurable cap on lever changes per month and per quarter.
- Do not script "party X always moves in direction Y". Identity is multidimensional.
- Priors are broad distributions with deterministic seed-based perturbation, not single hand-assigned points.
- Test: platform diversity (mean pairwise distance) stays above a configured floor; platforms do not converge to a centroid; all lever values stay in range.

# 18. Government policy AI

Quarterly, the governing party may adjust a limited number of enacted levers based on its platform, issue severity, structural pressure, and fiscal credibility. Keep it simple; its purpose is to ensure social indicators respond to the government, not to opposition platforms.

# 19. Polling

Fictional polling houses only (no real firm or broadcaster names; validator-enforced). Each poll: date, fictional pollster, sample size, **persistent house effect** (drawn once per house from a seeded stream and reused), sampling noise, and an undecided / none category derived from the model. Polls derive from **Current Support**, never from Potential, and never reveal hidden state.

- Margins are derived from sample size and a design effect (e.g., at n≈1,000 a 6% share is roughly ±1.5 points), not hard-coded.
- **Subgroup (age, region) margins are wider** because subgroup samples are smaller.
- Monthly or twice-monthly polls. Player-facing output is a range (e.g., `34–38`); the underlying point estimate may be stored.
- Internal Potential/Current/Barrier analysis is not a public poll. In Phase B expose it in Data Hub as an "internal analysis (save-model estimate)"; its resource cost is deferred to Phase C.

# 20. Determinism and math

Use existing named streams and add independent ones: `issue-shocks`, `party-ai`, `poll-house-effects`, `poll-sampling`, `cohort-calibration`. No `Math.random()`, no wall-clock time in the engine. Use the deterministic fixed-point utilities (extend them carefully) for all outcome-affecting nonlinear math. Ordinary floats only outside outcome logic (display). Same seed + command log ⇒ same state hash.

# 21. Commands

Only as needed: `ADVANCE_WEEK`, `SET_PLATFORM_DRAFT`, `PUBLISH_PLATFORM`, `RESPOND_INBOX`. No Phase C commands. React dispatches commands; it never mutates state.

# 22. Inbox

Report Phase B systems only: monthly issue report, poll release, AI party policy shift, consistency warning. Keep weekly messages meaningful and limited (at most 5 high-priority items on Home). No fake candidate/recruitment/organization messages.

# 23. Minimal Phase B UI

- **Home:** current date; election countdown (from Reality `electionDate`); latest support poll range; top issues; meaningful Inbox.
- **Korea:** six issue cards (severity, salience, trend, monthly change), labelled "게임 모델 지수".
- **Policy:** party platforms across the six domains; real-party positions labelled "게임 모델 추정"; the editable player platform inside the clearly labelled development preview.
- **Data Hub / Polls:** national poll with undecided; Potential vs Current with barrier breakdown; support by age; support by region. Always ranges, "save-model estimate" notice.
- Phase C/D pages remain honest stubs. No Phase E polish.

# 24. No fake numbers

Every visible political number comes from Reality or the simulation engine, with its label (REAL-WORLD BASELINE / SEED INDEX / GAME MODEL / SAVE SIMULATION). No decorative percentages.

# 25. B2 tests

**Policy fit:** exact match beats distant match; high-salience domain matters more.
**Potential/Current:** lowering awareness lowers Current more than Potential; lowering viability lowers Current; raising fit generally raises Potential; Current reacts gradually, not one-for-one, after a publication; unpublished drafts change nothing.
**Consideration-set math:** shares + undecided sum to 1 for every cohort; shares are monotone in awareness of that party; with all `A=1` the formula reduces to plain softmax (hand-computed example).
**Viability:** lagged input; month-over-month cap; knee shifts with ruleset threshold parameter.
**Government evaluation:** with `a_t = 0` the term vanishes; sign and zero-sum behavior as documented.
**Calibration:** at the start date, simulated national and regional support for the major parties fall within configured tolerance of the Reality `calibrationTargets`, or the test reports which targets are `UNVERIFIED`.
**Polling:** same seed reproduces the same poll; different stream states vary; house effect persistent across a house's polls; undecided present; subgroup margins > national margin; empirical coverage of the displayed ranges over many seeds is within a configured band.
**AI parties:** deterministic; not all identical; monthly cap respected; platforms in range; diversity floor holds.
**Save:** schema 2 hash equality; replay equality.

# 26. Simulation smoke tests

Update `npm run sim` so it is no longer only a calendar replay. Run **at least 20 deterministic seeds**, 2026-10-19 → 2028-04-10, with three player-seat strategies: `balanced` bot (default), `idle`, and a fixed `housing-focused` publisher.

Verify: no NaN or Infinity; all probabilities valid; issue values in range; support + undecided = 1; no party near 100% or 0% absurdly; cohort weights valid; month-over-month support change within a configured cap; replay hash matches; the housing-focused bot's Potential responds to publication while Current responds gradually.

Do NOT describe this as election-balance testing (Phase D). Update the nightly 500-seed workflow to run the Phase B model.

# 27. Documentation

Update `README.md`, `docs/DECISIONS.md` (schema decision, golden fixtures, G term, viability, awareness dynamics, Potential neutral value, unresolved items), `docs/VALIDATION.md`, and `AGENTS.md` only if persistent rules change.

README: **Implemented in Phase B** — issue simulation, policy/platform model, 96 cohorts, Potential vs Current, AI party policy, simulated polling. **Not implemented** — full party creation, recruitment, regional organization, nominations, district election, proportional election, Election Night, Season Review. Do not oversell.

# 28. CI

Keep and strengthen: `npm ci` → typecheck → lint → unit tests → data validation → Phase B multi-seed simulation → release build → Playwright E2E → Pages deploy. Deployment must fail if tests fail, a `REAL_FACT` lacks provenance, a release contains `UNVERIFIED_ASSUMPTION`, the smoke simulation fails, or replay determinism fails. Preserve `base: /houseofcards/` and `HashRouter`; verify refresh, save reload, and advancing multiple months on the deployed preview.

# 29. Do not implement yet

Politician recruitment, promises, regional organization, district candidates, tactical district voting, nomination, proportional list, election seat allocation, ruleset engine, Election Night, Season Review, parliament, factions, mergers, presidential or local elections, LLM outcomes, party creation UI, resource system.

# 30. Product test (illustrative — do NOT tune the model to these numbers)

By the end of B2 I should be able to observe qualitatively:

```text
Player party (dev preview) policy fit among young metropolitan renter cohorts: high
Potential Support clearly higher than Current Support
Why the gap? awareness / viability: major barriers; prior attachment: moderate
```

After changing and publishing Housing policy: Potential changes gradually; Current does not jump one-for-one; polls move noisily; other parties may respond. Assert **relationships** in tests (Potential ≥ Current for the new party, monotonicity, gradual response), not specific percentages.

# 31. Acceptance criteria

**B1 complete when:** (1) 2026-10-18 snapshot and 2026-10-19 start are separated; (2) schema v2 and Phase A rejection implemented and tested; (3) six domains and all levers exist with metadata; (4) platform/government separation with drafts inert; (5) six issues evolve monthly; (6) exactly 96 weighted cohorts; (7) Reality/Seed/Save separation validated; (8) streams/hash/replay intact; (9) tests/CI pass; (10) docs accurate.

**B2 complete when additionally:** (11) policy fit uses published platform only; (12) awareness, trust, loyalty, government evaluation, viability affect Current; (13) Potential computed with the specified neutral value; (14) barrier analysis exposed; (15) AI parties use the same model with caps and diversity floor; (16) government enacted policy affects social state, opposition platform does not; (17) polls have persistent house effects, derived margins, undecided; (18) all player-facing numbers come from the engine and are correctly labelled; (19) 20-seed, three-strategy simulation passes; (20) calibration test passes or reports `UNVERIFIED` targets; (21) E2E and Pages deploy succeed; (22) Phase C/D pages remain honest stubs; (23) docs accurate.

# 32. Final instruction

Do not optimize for feature count. Phase B builds the political simulation heart:

```text
published platform → policy fit → Potential Support
→ awareness / trust / viability / loyalty / government evaluation
→ Current Support → noisy polling
```

Simplify UI breadth if needed so this chain is coherent, deterministic, testable, and inspectable. When the current step is complete, stop. Report: files changed; model implemented; important design decisions; tests and results; remaining stubs; anything the next step or Phase C must know; any facts you could not verify.