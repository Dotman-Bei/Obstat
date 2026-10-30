# Obstat — Product Requirements Document

| | |
|---|---|
| Product | Obstat |
| One line | An EINSTEIN matchmaker where no proposal reaches the page until a separate Critic has checked every claim against the person it names. |
| Event | NTP Novi Sad Hackathon (JigJoy × NTP Novi Sad), online track |
| Track | EINSTEIN: Science-to-Business Matchmaker |
| Builder | Solo, TypeScript |
| Runtime | `@mozaik-ai/core@4.1.0` (pinned; see §12) |
| Interfaces | Terminal trace and Markdown files (primary, judged). Web console (secondary, read-only; §11; look and stack per `frontend.md`) |
| Deadline | **Sat 31 Oct 2026, 20:00 CET** (confirmed: track page, rules and schedule agree). Resubmissions allowed; the last entry counts. |
| Status | Approved idea (picked 2026-10-30). PRD v1. |

---

## 1. Name

**Obstat**, from *nihil obstat*: "nothing stands in the way". Before a book could be printed, a censor read it and signed the *nihil obstat*. Only then could the imprimatur be granted.

Drop *nihil* and the word turns around: *obstat*, "it stands in the way". That is what the gate does. It stands in front of every proposal and stays there until each claim is shown to belong to the person it names. When every check passes, nothing stands in the way and the proposal is written.

Earlier working names: Countersign, Primatur, Shibol.

---

## 2. Problem

### The person and the moment
A jury member (or an EINSTEIN staffer) opens proposal 2. It credits **"Jeremić Mirjana" (R0139)** with **SYN-PUB-01827**. That paper's author entry carries **R0539 "Mirjana Jeremić"**. They are one person stored as two records (reversed name order, faculty name in Serbian). The jury holds a hidden answer key for traps like this. One wrong attribution costs Accuracy points and the reader's trust in every other proposal.

### Why it happens
The dataset is about 7 million tokens. No single prompt holds it, so the work is split across agents. Split work loses the context needed to tell people apart. The dataset is messy on purpose:

| Trap | Count in data | Example |
|---|---|---|
| One person, two records (name order, script, "imported from a second source") | at least 10 profile-listed papers attributed to a different `researcher_id` | R0139 ↔ R0539; R0556 (Cyrillic) ↔ Latin-script Jelena Marković |
| Two people, one name | 2 pairs | Nina Mamužić R0128 (food preservation) vs R0881 (horticulture); R0191 vs R0435 |
| Stale profiles: retired, emeritus, left | 23 records | R0068 left in March 2026, profile not updated |
| Capacity or availability notes in free text | 275 of 1,047 researchers | R0001: one new collaboration from late 2026 |
| Notes or records in Cyrillic | 27 researchers, 3 companies | R0556 |
| No bio | 60 researchers | profiler may invent one |
| Challenges that are not research problems | many of 489 | C004-CH4 (licensing delay), C021-CH3 (seed round) |

Counts: Python over the dataset, 2026-10-30. Source: https://github.com/jigjoy-ai/einstein-matchmaker-data

### Why the obvious fix fails
The obvious build writes proposals, then runs a Critic over the finished files.
1. The bad claim stays in the proposal the jury reads. A report beside it does not remove it.
2. Fixing it needs a second full pass. A writer told to "verify first" can skip the call. Only a gate outside the writer, inside the writer's loop, cannot be skipped.

---

## 3. Goals and non-goals

### Goals
- **G1.** Every claim in every proposal carries dataset IDs and a Critic verdict, recorded in the trace.
- **G2.** Writers run concurrently. When one writer is held, the others keep working, and the trace proves the overlap.
- **G3.** At least 3 proposals for 3 different researcher–company pairs, shaped like the example industrial PhD topic.
- **G4.** Known traps (duplicate profile, namesake, stale profile) are caught on the run that judges see.
- **G5.** A judge can run it and check it from the repo alone.
- **G6.** A read-only web console lets anyone watch the run, open any hold, and look up any cited record, without changing the run.

### Non-goals
- The web console is not the main output and never controls the run: in v1 it has no control that starts, pauses, approves or edits anything.
- No visual design decisions in this PRD. `frontend.md` owns them.
- No outreach emails, no funding-call search, no OpenAlex/ORCID enrichment.
- No mem0 (adapter is unreleased in the version we pin).
- No scoring or ranking of people by worth. Ever. (Track rule.)

---

## 4. Users

| User | What they need from Obstat |
|---|---|
| Jury member (scoring from the repo) | A trace showing where the Critic stepped in; proposals whose claims they can check by ID |
| EINSTEIN staffer | Pairs they can forward without checking every fact by hand |
| Company R&D lead | A concrete proposal: problem with numbers, research questions, plan, what each side brings |
| Researcher | Not proposed for things their own note rules out; not confused with a namesake |
| Anyone watching the demo | Sees agents overlap and a hold happen without reading JSON |

---

## 5. How it maps to the judging card

| Criterion | Points | What Obstat shows |
|---|---|---|
| Multi-agent architecture: roles, coordination, review loops | 30 | Eight participants (seven doing the work, one UI observer); Critic is its own participant woken by an event, not called; holds any of N writers mid-turn; failures return into that writer's loop; the console timeline shows the overlap |
| Proposals a company and researcher would use | 25 | Writer follows the example PhD shape; the gate rejects any proposal missing a section |
| Accuracy and transparency | 20 | Claim→ID table per proposal; every hold and verdict in `trace.jsonl`; the console opens any cited record |
| Potential for real use in EINSTEIN | 15 | README section: Obstat as the review step before staff see a pair |
| Responsible use of data | 10 | Availability claims must cite the person's own note; no ranking language passes the gate |

Event-wide rules also require genuine concurrency (2+ concurrent agents; "one agent with a pile of tools doesn't count").

---

## 6. System overview

```
                 ┌──────────────── RuntimeState (shared) ─────────────────┐
                 │ index · identities · shortlist · commitments · reviews │
                 └────────────────────────────────────────────────────────┘
Profilers P1..Pn ──► identity hints, profiles          (concurrent, per shard)
Industry Analyst ──► challenge classes                 (concurrent)
Matchmaker      ──► shortlist of pairs (with IDs)      (reacts to profiles + classes)
Writers W1..W3  ──► write_proposal(...)                 (concurrent, one per pair)
                      │
                      ▼  InterceptionHandler.isSatisfiedBy(function_call write_proposal)
                   HOLD W_k only ── sendEvent("claim.review.requested") ──► Critic
                      ▲                                                     │
                      └──── await verdict ◄── "claim.review.completed" ─────┘
                   pass → tool runs → proposals/*.md
                   fail → FunctionCallOutputItem(failures) → nextStateId "inference" → W_k revises
Trace Observer  ──► trace.jsonl (every event, loop IDs, holds, verdicts)
UI Bridge       ──► SSE /events ──► web console (read-only; same line format as trace.jsonl)
```

Behaviors compose by reaction. No participant calls another. Every hand-off is an event.

---

## 7. Participants

All created with `createAgent` / `createHuman`, joined with `join`, reacting through `SituationHandler`s. Each agent loop gets its own `ModelContext.create()`; two live turns must not share one memory (provider returns HTTP 400, found by last edition's winner Separation).

| Participant | Kind | Wakes on | Does | Model |
|---|---|---|---|---|
| **Coordinator** | human-type participant | start | Loads the index, sends `run.started` with shard plan | none |
| **Research Profiler ×N** (N=4 default) | agent | `run.started` (own shard) | Reads its shard of researchers; writes normalized profiles and identity hints (possible duplicates, namesakes, stale status, capacity text) to state; emits `profiles.ready` | small model; most work is code |
| **Industry Analyst** | agent | `run.started` | Classifies each challenge: `research`, `not_research`, `no_uns_fit`, with reason and IDs; emits `challenges.ready` (streams in batches) | small model |
| **Matchmaker** | agent | `profiles.ready` + `challenges.ready` batches | Proposes pairs (researcher, challenge) with evidence IDs; emits `pair.shortlisted` | mid model |
| **Proposal Writer ×3** | agent | `pair.shortlisted` (one pair each, different pairs) | Writes one proposal by calling `write_proposal`; revises when the gate returns failures | strong model |
| **Critic** | agent | `claim.review.requested` | Runs the check catalogue (§9); emits `claim.review.completed` with a verdict per claim | code first; small model only for the support check |
| **Trace Observer** | observer (handlers only) | every event | Appends one JSON line per event to `out/trace.jsonl`; prints a readable line to the terminal | none |
| **UI Bridge** | observer (handlers only) | every event | Pushes each event to connected browsers over Server-Sent Events (§11). Never sends messages or events, never starts loops, never writes state | none |

Default models are config values (`gpt-5.5`, `gpt-5.4-mini`), both listed in v4.1.0 `supportedModels`.

---

## 8. The gate (core mechanism)

### 8.1 Interception handler

One handler instance is passed as the 4th argument of `runLoop` for every writer loop.

```ts
class ObstatGate implements InterceptionHandler {
  isSatisfiedBy(t: ExecutableTransition) {
    return t.nextStateId === "function_call" && t.input.call.name === "write_proposal"
  }
  async handle(t: ExecutableTransition): Promise<ExecutableTransition> {
    const { call, inferenceInput } = t.input
    const reviewId = newId()
    // sendEvent throws unless the sender is a joined participant, so the held writer is the producer
    sendEvent(SemanticEvent.create("claim.review.requested", writerId, { reviewId, writerId, call }), writerId)
    const verdict = await waitForVerdict(reviewId, { timeoutMs: CRITIC_TIMEOUT_MS }) // fails closed
    if (verdict.pass) return t                                   // tool runs
    const out = FunctionCallOutputItem.create(call.callId, renderFailures(verdict))
    inferenceInput.context.addContextItems([call, out])
    return { nextStateId: "inference", input: inferenceInput }  // NEVER "idle" (issue #113)
  }
}
```

Facts this relies on, verified in Mozaik source at tag v4.1.0:
- `AgentLoop.run()` (`src/domain/agentic-environment/loop/agent-loop.ts`) awaits `handle()` inside one loop. Only that writer waits.
- `interception.started` and `interception.finished` are published around the hold.
- `runLoop(agentId, message, inferenceInput, interceptionHandler?)` is fire-and-forget (`src/application/use-cases/run-loop.ts`).
- `FunctionCallOutputItem.create(callId, output)` exists; the USER-FED human-in-the-loop example returns `{ nextStateId: "inference", input }` after adding the call and output to context.

### 8.2 Waiting for the verdict
- `waitForVerdict` resolves a Promise kept in `RuntimeState.reviews[reviewId]` when a `claim.review.completed` event with that `reviewId` arrives. The Critic's handler writes the verdict to state, then emits the event.
- Do not rely on event order across participants (issue #115). Match by `reviewId` only.
- Timeout (default 90 s): fail closed. Return to `inference` with "Critic did not answer; claims unverified; resubmit." Log `gate.timeout`.
- Revision cap: 3 rounds per writer. After 3 failed rounds the writer is told to drop the failing claims; if a required section is still missing, the pair is marked `abandoned` with reasons and the Matchmaker is asked for a replacement pair.

### 8.3 What the trace must show
For the demo pair, in order and with overlapping timestamps:
`W2 interception.started` → `claim.review.requested` → `W1 function_call.started` (W1 still working) → `claim.review.completed (fail: claim 3, attribution)` → `W2 interception.finished → inference` → `W2 write_proposal` → `claim.review.completed (pass)` → file written.

---

## 9. Critic check catalogue

Each claim the writer submits has a `kind`. The Critic runs the checks for that kind. Checks C1–C5 and C8–C9 are plain code. Only C10 calls a model.

| ID | Check | Applies to | Fails when | Priority |
|---|---|---|---|---|
| C1 | ID exists | all | Any cited ID is not in the dataset | P0 |
| C2 | Attribution | `authored`, `patent`, `project` | The cited record's author/inventor/participant entries do not carry the named `researcher_id` | P0 |
| C3 | Duplicate profile | any claim naming a researcher | The record is attributed to another `researcher_id` that the identity hints mark as the same person (name order, Latin↔Cyrillic transliteration, "imported from a second source"). Verdict tells the writer which ID is canonical. | P0 |
| C4 | Namesake | any claim naming a researcher | Another researcher has the same normalized name, and the cited evidence belongs to the other one | P0 |
| C5 | Availability | `available_for` | No quote from the researcher's own `notes` / `open_to` supports the role; or the profile says retired, emeritus or left; or a date in the note is in the past and the claim relies on it | P0 |
| C6 | Capacity | `available_for` | Commitments already passed by the gate exceed what the note allows (read once per researcher, cached) | P1 |
| C7 | Research problem | `challenge` | The Analyst classified the challenge `not_research` or `no_uns_fit` | P1 |
| C8 | Sections complete | proposal | Missing any of: problem with numbers, research questions, plan (3-year table or short-project plan), what each side brings, why this pair, agreed up front | P0 |
| C9 | No ranking of people | all text | Comparative worth language about people ("best researcher", "top-ranked", scores of people) | P0 |
| C10 | Support | all | A small model, given only the cited records, judges that they do not support the sentence | P1 |

### Verdict shape
```json
{ "reviewId": "rv_17", "writerId": "W2", "pass": false,
  "claims": [
    { "n": 3, "check": "C3", "pass": false,
      "detail": "SYN-PUB-01827 is attributed to R0539. R0139 and R0539 look like one person (reversed name order, same faculty). Cite R0539 or state both IDs." } ] }
```

---

## 10. Data contracts

### `write_proposal` tool input (JSON Schema, strict)
```json
{
  "pairId": "string",
  "researcherIds": ["R0539"],
  "companyId": "C0xx",
  "challengeId": "C0xx-CHn",
  "format": "industrial_phd | joint_project | contract_research",
  "sections": {
    "title": "string",
    "problem": "string",
    "researchQuestions": ["string"],
    "plan": "string",
    "eachSideBrings": { "company": "string", "faculty": "string" },
    "whyThisPair": "string",
    "agreedUpFront": "string"
  },
  "claims": [
    { "n": 1, "kind": "authored | patent | project | available_for | challenge | company_fact | other",
      "text": "string", "researcherId": "R0539", "ids": ["SYN-PUB-01827"] }
  ]
}
```
Every factual sentence in `sections` must map to a claim `n`. The tool's `invoke` renders `out/proposals/<pairId>.md` with a claim→ID table at the end.

### Shared state (subclass of `RuntimeState`)
```ts
class ObstatState extends RuntimeState {
  index: DataIndex                 // researchers, pubs, projects, patents, companies (loaded once)
  identities: Map<string, IdentityHint>   // R-id -> {sameAs[], namesakes[], status, capacityText}
  challengeClass: Map<string, ChallengeClass>
  shortlist: Pair[]
  commitments: Map<string, string[]>      // R-id -> pairIds passed by the gate
  reviews: Map<string, PendingReview>     // reviewId -> resolver + verdict
  loops: Map<string, LoopStatus>          // for liveness (issue #114)
}
```

### Trace line (`out/trace.jsonl`)
```json
{"t":"2026-10-31T09:12:03.412Z","type":"interception.started","producer":"W2","loopId":"…","summary":"write_proposal held (6 claims)"}
```

---

## 11. Web console (secondary UI)

**Role.** A window onto the run, not part of it. The terminal trace and the Markdown files stay the primary output and the artifacts judges score. Removing the console changes nothing about the run.

**Design source.** `frontend.md` owns the stack, visual design, typography, components and layout. This section owns what each screen shows, where its data comes from, and how it behaves. Where they conflict, `frontend.md` wins on look and stack; this PRD wins on data and behavior. (Not yet reconciled: see §19.)

### 11.1 How it connects
- **UI Bridge** is an observer participant: `createHuman` with handlers only. This is the pattern the Mozaik README itself names: add a transcript observer and you get a UI stream. Its situation handler matches every event and pushes one compact JSON line per event to connected browsers over Server-Sent Events, in the same format as `trace.jsonl`.
- It never calls `sendMessage`, `sendEvent` or `runLoop`, and never writes `RuntimeState`.
- **Live mode:** `npm start -- --ui` serves the console on `127.0.0.1` and streams `/events` during the run.
- **Replay mode:** `npm run ui` plays a committed `out/trace.jsonl` at 1×, 4× or instant. No API key, no model calls. This is the mode judges and the demo use.
- **Read endpoints** (local only):
  - `GET /events` (SSE)
  - `GET /api/summary`
  - `GET /api/proposals`, `GET /api/proposals/:pairId`
  - `GET /api/records/:id` (researcher, publication, project, patent, company or challenge, served from the in-memory index)

### 11.2 Screens

| # | Screen | Shows | Data | Priority |
|---|---|---|---|---|
| S1 | Run timeline | One lane per participant; a bar per loop (`loopId`); held segments marked between `interception.started` and `interception.finished`. Placing the cursor on a hold shows which other loops were active at that moment, which is the concurrency proof drawn. Counters: loops active now, holds, passes, fails. | `/events` or replayed trace | P1 |
| S2 | Hold detail | Opened from a held segment: writer, round number, each claim's text and cited IDs, the result of every check (C1–C10) with the Critic's detail, and what changed in the claims between rounds | `claim.review.*` events | P1 |
| S3 | Proposal view | The rendered proposal and its claim→ID table; every ID opens S4 | `/api/proposals/:pairId` | P1 |
| S4 | Record drawer | The raw dataset record, with the field that decided the check highlighted (e.g. the author entry that carries R0539) | `/api/records/:id` | P1 |
| S5 | Summary | Pairs proposed, pairs abandoned with reasons, no-match list, failed checks by type | `/api/summary` | P2 |

### 11.3 Rules
- **Read-only.** No control that changes the run in v1.
- **No ranking of people anywhere:** no leaderboards, no scores next to researcher names, no "best" sort. Lists sort by time, ID or name only. C9 applies to UI copy too.
- **Dataset fields only;** no outside data.
- **Must not slow the run.** SSE writes are fire-and-forget. With no browser connected, the bridge drops events; `trace.jsonl` stays complete.
- **Works in replay without keys.**
- The demo hold (§8.3) must be legible at 1280×720 for a screen recording.

### 11.4 Role in the demo
The 30-second demo (§16) can be recorded in the console: timeline → held bar → hold detail with the C3 failure → revision passes → record drawer showing R0539. The terminal version stays as the fallback.

---

## 12. Technical requirements

| ID | Requirement | Priority |
|---|---|---|
| T1 | Pin `@mozaik-ai/core@4.1.0`. At startup, assert `InterceptionHandler`'s runtime pieces exist (e.g. `FunctionCallOutputItem.create`) and exit with a clear message if not. Interception code is absent from the `main` and `development` branches; whether published 4.2.0 keeps it is unverified. | P0 |
| T2 | Load the dataset once into an in-memory index (`publications.jsonl` is ~20 MB); agents get IDs and slices, never whole files. | P0 |
| T3 | Name normalization in code: lowercase, strip diacritics, Cyrillic→Latin transliteration (Serbian table), token sort to catch reversed order. | P0 |
| T4 | Each loop gets its own `ModelContext`. | P0 |
| T5 | Every tool `invoke` wraps its body in try/catch and returns `{ error }` rather than throwing; the Observer marks loops with no event for 120 s as `stalled` (issue #114). | P0 |
| T6 | Never return `idle` from an interception handler (issue #113). | P0 |
| T7 | Writers ≥ 3 running at once; profilers ≥ 2 at once. Concurrency proof: `npm run proof` prints max concurrent loops and the overlap window during each hold, computed from `trace.jsonl`. | P0 |
| T8 | **Replay mode**: record every inference result on a live run; `npm run replay` runs the same Mozaik runtime with a custom `InferenceRunner` (supported via `initializeRuntime({ inferenceRunnerConfig: { runner } })`) that serves recorded outputs. Judges can run it without API keys. | P1 |
| T9 | Config file for models, shard count, writer count, timeouts. | P1 |
| T10 | Cost guard: stop after a configurable token budget; log usage from `inference.completed` `tokenUsage`. | P2 |
| T11 | UI Bridge is an observer only (see §11.1); server binds to `127.0.0.1`; a slow or absent browser never blocks a participant. | P1 |
| T12 | Console stack, build and styling follow `frontend.md`; the console builds and runs separately from the agent runtime, so a UI build failure cannot break `npm start`. | P1 |

---

## 13. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | One command (`npm start`) runs a full pass and writes `out/proposals/*.md`, `out/trace.jsonl`, `out/summary.md`. | P0 |
| F2 | At least 3 proposals for 3 different pairs (no researcher and no challenge repeated across the 3). | P0 |
| F3 | Every proposal ends with a claim→ID table and the Critic's final verdict per claim. | P0 |
| F4 | The gate holds every `write_proposal` call; no proposal file is written without a passing verdict. | P0 |
| F5 | The run includes at least one pair touching a known trap (R0139/R0539 or a namesake pair), so the hold is visible on the judged run. Chosen by the Matchmaker on evidence, not hard-coded; if the Matchmaker does not pick one, a `--demo` flag seeds that pair. | P0 |
| F6 | `out/summary.md`: pairs proposed, pairs abandoned with reasons, holds per writer, checks failed by type. | P0 |
| F7 | `out/no-match.md`: challenges the Analyst classified `not_research` / `no_uns_fit`, with one-line reasons. | P1 |
| F8 | Capacity check C6 across writers. | P1 |
| F9 | Support check C10. | P1 |
| F10 | `npm run ui` replays the committed trace in the console (S1–S4) with no API key. | P1 |
| F11 | `npm start -- --ui` shows the live run in the console. | P1 |
| F12 | Summary screen (S5). | P2 |

---

## 14. Repository layout

```
obstat/
  README.md
  docs/architecture.md (+ diagram)
  src/
    main.ts  runtime.ts  config.ts
    data/      index.ts  normalize.ts  identities.ts
    gate/      obstat-gate.ts  wait-for-verdict.ts
    critic/    checks/{c1..c10}.ts  critic.ts
    participants/{coordinator,profiler,analyst,matchmaker,writer,observer}/
      index.ts  situations/*.ts  tools.ts
    replay/    recording-runner.ts  replay-runner.ts
    proof/     concurrency-proof.ts
    ui-bridge/ bridge.ts  server.ts  (SSE + read endpoints)
  ui/          console app (structure per frontend.md)
  out/   (committed example run: proposals, trace.jsonl, summary.md)
```

---

## 15. README requirements (judged from the repo)

The top of the README, in this order:
1. One sentence: "No proposal leaves a writer until a separate Critic has checked every claim against the person it names."
2. Architecture diagram (§6).
3. A 12-line trace excerpt of the demo hold (§8.3).
4. How to run: `npm i`, `.env` with one key, `npm start`; or `npm run replay` with no key.
5. Links to the 3 committed proposals and the full `trace.jsonl`.
6. One screenshot or GIF of the console's hold detail (S2), plus `npm run ui` to open it.

Then, required by the brief:
- What it does; architecture and roles; how agents run concurrently (with `npm run proof` output).
- **How Obstat plugs into the EINSTEIN network and EINSTEIN Stars.** (What "EINSTEIN Stars" is: not yet known; ask in Discord before writing this section.)
- Responsible data: proposes collaborations, never ranks people; every claim cites a dataset ID; no data beyond the dataset.
- Known limits.

---

## 16. Demo (optional, under 30 seconds)

1. Terminal shows three writers starting (three loop IDs).
2. `W2 HELD write_proposal (6 claims)`.
3. W1 and W3 keep printing tool calls.
4. `CRITIC claim 3 FAIL C3: SYN-PUB-01827 belongs to R0539; R0139 is the same person`.
5. `W2 → inference (revising)` … `W2 PASS` … `proposals/pair-2.md written`.
6. Cut to the proposal's claim→ID table.

Console version (§11.4): same beats on the timeline and hold detail, ending in the record drawer.

---

## 17. Acceptance criteria

The build is done when all P0 items pass:
- [ ] `npm start` completes on the full dataset and writes 3+ proposals for 3 different pairs.
- [ ] 100% of claims in committed proposals have IDs and a passing verdict in `trace.jsonl`.
- [ ] The committed trace contains at least one hold that failed and was revised, on a known trap.
- [ ] `npm run proof` shows at least 2 writer loops active during at least one hold.
- [ ] No committed proposal names a retired, emeritus or departed researcher for a role their note rules out.
- [ ] No committed proposal contains ranking language about people (C9).
- [ ] The interception handler never returns `idle`; a forced Critic timeout returns the writer to `inference` and the run continues.
- [ ] README top section matches §15.

Console (P1), checked separately so it never blocks the P0 list:
- [ ] `npm run ui` opens the committed run with no API key and shows S1–S4.
- [ ] Placing the cursor on the demo hold in S1 shows at least 2 other active loops.
- [ ] Every ID in S3 opens its record in S4.
- [ ] With the console closed, `npm start` output is identical.

---

## 18. Risks and kill criteria

| Risk | Signal | Response |
|---|---|---|
| Pinned 4.1.0 conflicts with something the event requires | Organizers require 4.2.0 | Check 4.2.0 exports; if interception is gone, fall back to a Critic that reacts to `function_call.started` and revokes the written file (weaker; say so in README) |
| Deadline is 14:00 CET | Confirmed in Discord | Cut order below |
| Critic too slow | > 2 min per proposal | Drop C10; keep code checks only |
| Matchmaker picks no trap pair | Demo hold not on a trap | Use `--demo` seed (F5) |
| Identity hints wrong (false merges) | Critic flags correct claims | Require two signals for "same person" (name match + same faculty or shared co-author) |
| Judges cannot run with keys | Rules: unrunnable entries may be excluded | Replay mode (T8) |
| Console eats build time | P0 list not green by the halfway point | Ship console in replay mode only; cut S5, then the live mode |

### Cut order if time runs short (cut from the top)
1. T10 cost guard
2. F12 / S5 summary screen
3. F9 / C10 support check
4. F7 no-match file
5. F11 live console (keep the replay console)
6. F8 / C6 capacity check
7. Round-to-round diff in S2
8. Analyst streaming in batches (run it once, up front)
9. T8 replay mode (commit the live run's outputs instead)
10. The console (F10); the terminal demo remains

Never cut: the gate (F4), C1–C5, C8, C9, the trace, 3 concurrent writers, the README top section.

---

## 19. Open questions
1. Resolved: the deadline is Saturday 31 October, 20:00 CET.
2. What is "EINSTEIN Stars", and what does "plug into the EINSTEIN network" mean to the EINSTEIN team?
3. Does published `@mozaik-ai/core@4.2.0` still export `InterceptionHandler`? Is pinning 4.1.0 acceptable?
4. Validation message to JigJoy (pending): see `07-attack-and-final-checks.md` §5.
5. `frontend.md`: not yet read. Share it so §11, T12 and the repo layout can be reconciled with its stack, routes and component names.

---

## 20. Sources
- Event: https://build.jigjoy.ai/ · Track brief and judging card: https://build.jigjoy.ai/tracks/einstein · Rules: https://build.jigjoy.ai/rules
- Dataset, data quirks, example PhD topic, APIs guide: https://github.com/jigjoy-ai/einstein-matchmaker-data
- Mozaik docs (USER-FED): https://docs.jigjoy.ai/ · Examples (USER-FED): https://github.com/jigjoy-ai/mozaik-examples · Source at tag v4.1.0, README (observer → UI stream pattern) and issues #113–115: https://github.com/jigjoy-ai/mozaik
- Past winners (USER-FED): https://build.jigjoy.ai/winners · Separation: https://build.jigjoy.ai/gallery/separation-c7ef86 · BountyProof: https://build.jigjoy.ai/gallery/bountyproof-94cfcf · Claimswarm: https://build.jigjoy.ai/editions/build-2026/gallery/claimswarm-308d00
- Research phase files: `00-constraints.md` through `07-attack-and-final-checks.md`, `FINAL_IDEA.md`
