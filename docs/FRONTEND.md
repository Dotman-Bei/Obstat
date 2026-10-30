# Obstat console: frontend spec

Owner of look and stack for the web console (PRD §11, T12). The PRD owns data and behaviour; this file owns
everything a viewer sees. Written 2026-10-30 from PRD v1, following the `design-taste-frontend` skill
(app-screen run, `references/app-screens.md`).

Style dealt: **Framed sheet** (light), seed `315125889`, kind `devtools`. No redraws.

---

## 1. Who it is for, and what each screen drives

The console is a window onto one run. It never starts, pauses, approves or edits anything. People open it for
minutes, not hours, mostly on a laptop, sometimes on a screen recording at 1280×720.

| Reader | What they come for |
|---|---|
| Jury member scoring from the repo | Proof that the Critic stood in the way: where a writer was held, why, and who kept working |
| EINSTEIN staffer | A proposal they can forward, with every claim traceable to a dataset record |
| Company R&D lead, researcher | The proposal itself, and the record behind any sentence about them |
| Demo audience | A hold happening on the timeline while other writers keep moving, without reading JSON |

Each screen answers one question and drives one action. The action is always "open the next piece of evidence".

| Screen | Its one question | Main action |
|---|---|---|
| S1 Run | Where did the Critic hold a writer, and who kept working while it waited? | Open a held segment (to S2) |
| S2 Hold | Why was this write held, and what did the writer change? | Open a cited record (to S4) |
| S4 Record drawer | Does this record really carry the ID the claim names? | Follow a linked record |
| S3 Proposals and proposal | What is proposed, and does every claim stand on a cited record? | Open a claim's record (to S4) |
| Holds list | Which writes were held, and which failed? | Open a hold (to S2) |
| S5 Summary | What did the run produce, and what did it turn away? | Open an abandoned pair's last hold |

## 2. Visual direction

### Thesis

*Nihil obstat* was signed on a printed sheet before it could go to press. The console is that sheet. A pale
stone frame (the print shop) holds the navigation. The work lies on one white sheet. The only hue on the
screen is the colour of the gate: every held segment, the selected state and the mark are drawn in one deep teal.
Everything else is ink on paper. IDs are set in a monospace because the reader checks them character by character.

- **Face:** the frame is tinted stone (`#f0f0ec`), not the kit's grey. Every dataset ID is set in IBM Plex Mono.
- **Signature element:** the hold timeline. One lane per participant. Held segments are drawn in teal, and the
  Critic's review is drawn as a teal outline under them. Placing the cursor on a hold drops a line through every
  lane and names the loops still running at that moment, so the concurrency proof shows on the chart itself.
- **The mark:** a ring with a bar across it, drawn in teal: something standing in the way.

### Palette (exact values)

| Token | Value | Use |
|---|---|---|
| `--ground` | `#f0f0ec` | The stone frame: sidebar and top bar, one surface, no rule between them |
| `--surface` | `#ffffff` | The sheet, panels, the record drawer |
| `--raised` | `#f4f5f3` | Inner wells (raw JSON, key-value lists), row hover |
| `--active` | `#e6e7e3` | Active nav pill, selected row |
| `--border` | `#e8e9e6` | The sheet's edge, panel edges |
| `--rule` | `#f0f1ef` | Row rules inside tables |
| `--control` | `#cdced1` | Outlined buttons, the search field |
| `--text` | `#131416` | All running text, IDs, figures |
| `--muted` | `#5d5f60` | Labels, sublines, axis ticks (5.6:1 on the frame, 6.4:1 on white) |
| `--accent` / `--chart-1` | `#1b6c80` | Held segments, the Critic's outline, focus ring, the selected tab line, the mark |
| `--accent-tint` | `#e3eff2` | The highlighted field in a record (the author entry that carries the ID) |
| `--work` | `#d9dcd8` | A loop that is running (inference or a tool call) |
| `--positive` | `#1e7b4f` | Pass text; pill `#dcfae5` / `#04250e` |
| `--negative` | `#c4242a` | Fail text, one mark per object; pill `#ffedea` / `#831c1e` |
| `--warning` | `#92400e` | Timeouts, abandoned pairs; pill `#fffbeb` / `#92400e` |
| `--primary` | `#1d1f20` | The one filled button (Replay), near-black |

Colour budget: under 3% of the pixels. No hue in the chrome except the mark and the 2px selected-tab line.

### Typefaces (two, each with one job)

- **IBM Plex Sans** 400 / 500 / 600 for everything.
- **IBM Plex Mono** 400 / 500 for dataset IDs, loop IDs, review IDs, trace lines and raw records. Nothing else.

Sizes: 22 (h1) · 16 (section titles) · 28 (KPI values, 400) · 14 (body, cells, nav) · 12 (labels, ticks, meta).
The proposal document is read, not scanned: its body is 16/26 at a 68-character measure, and its title is 22.
Tabular figures on every number. Sentence case everywhere. No tracked capitals.

### Spacing scale

4px base: `4 · 8 · 12 · 16 · 24 · 32 · 48`.
One gutter: **24px** horizontally and vertically on desktop, 16px on a phone. Sheet padding 24. Panel padding 20.
Sheet inset 8px from the window's right and bottom edges, radius 16. Panels radius 8, controls 6, pills full.
Sidebar 228px. Top bar 48px. Single-line rows 48px; two-line rows 64px. Timeline lanes on a 28px pitch.

### Motion rules

App screens do not perform. Motion is feedback only.

- Press 120ms (1px down), hover 150ms (fill or colour), UI 200ms ease-out `cubic-bezier(.22,1,.36,1)`.
- The record drawer slides in from the right over 200ms. On a phone it rises from the bottom.
- In replay, a new trace line fades in over 150ms and a growing bar extends with the playhead. Nothing else moves
  on its own.
- No entrance animations, no scroll effects, no counters that tick up.
- `prefers-reduced-motion`: all travel is dropped; the drawer and new rows appear at once.

## 3. Stack and structure

- **Vite + TypeScript, no framework.** Hash routes (`#/run`, `#/holds/rv_17`, `#/proposals/pair-2`,
  `?record=R0539` on any route opens the drawer). The console lives in `ui/` with its own `package.json`,
  so a UI build failure cannot break `npm start` (T12).
- **One data client** (`ui/src/data/`) reads exactly the PRD endpoints: `GET /events` (SSE, one trace line per
  event), `GET /api/summary`, `GET /api/proposals`, `GET /api/proposals/:pairId`, `GET /api/records/:id`.
- **Replay without keys:** in development and preview, a Vite middleware serves those endpoints from a sample run
  (`ui/fixtures/`). The real UI Bridge serves the same routes on `127.0.0.1` and replaces it with no UI change.
- **Replay speed** (1×, 4×, Instant) is playback of the trace in the browser only. It does not touch the run.
  Lists, counters and the hold screens follow the playhead; the Summary shows the final figures.

### Running it

```bash
cd ui
npm install
npm run dev        # http://127.0.0.1:4310, replay of the sample run
npm run build      # type-check, then build to ui/dist
npm run preview    # http://127.0.0.1:4311, the production build with the same replay endpoints
```

The PRD's root-level `npm run ui` should call `npm --prefix ui run preview` once the agent runtime's
`package.json` exists.

### Trace line the console expects

The PRD's line plus an optional `data` object on the events the screens need:

```json
{"t":"2026-10-31T09:12:36.214Z","type":"interception.started","producer":"W2","loopId":"lp_w2_01",
 "summary":"write_proposal held (6 claims)","data":{"reviewId":"rv_04","pairId":"pair-2","round":1}}
```

`claim.review.requested.data` carries `{ reviewId, writerId, pairId, round, claims[] }`;
`claim.review.completed.data` carries the verdict shape of PRD §9 plus `checks[]` (every check run, pass or fail).

## 4. Screens, in build order

Copy below is the copy that ships. Figures in brackets are computed from the trace, never typed.

### 4.0 The shell (built first, with every screen)

- **Sidebar** on the stone frame: the mark and "Obstat"; under it the scope, "Run of 31 Oct 2026, 09:11 CET".
  Nav: **Run**, **Holds**, **Proposals**, **Summary**. No counts: nothing here is a queue to act on.
  Foot: "Read-only. Replaying out/trace.jsonl" (or "Live from 127.0.0.1:4310" in live mode).
- **Top bar** (48px, frame tint, no rule): a centred lookup field, label "Look up a record",
  placeholder "Look up R0539, SYN-PUB-01827, C017-CH1", shortcut `/`, Esc clears it. A wrong format gets one line:
  "Type a dataset ID: a researcher (R0539), a record (SYN-PUB-01827), a company (C017) or a challenge (C017-CH1)."
  Right end: the replay clock "[09:14:34] of [09:14:34]", a segmented control **1× · 4× · Instant**, and
  **Replay** (the one primary). The lookup centres in whatever room the replay controls leave.
- **The sheet**: white, inset 8px right and bottom, radius 16, 1px edge, no shadow. Content padding 24.

### 4.1 S1 Run

- **h1** "Run". **Subline (the finding, computed from the longest failed hold):** "The Critic held Writer 2 for
  [8.1 s] and failed claim 3 on C3, duplicate profile. Writers 1 and 3 kept working the whole time."
- **Counters**, one strip split by 1px dividers, each with a grey note: **Loops running** [0] ("Most at once: [5],
  at [09:11:02]") · **Holds** [9] ("On [5] pairs") · **Passed** [4] ("Released to write_proposal") · **Failed** [5]
  ("Sent back to the writer") · **Proposals written** [4] ("[1] pair abandoned").
- **Timeline** panel, title "Loops by participant", the legend in its header (the marks themselves): Running ·
  Held by the gate · Critic reviewing · Proposal written · Pair abandoned.
  Under the header, the **readout**, above the chart so it shares the first screen with the held bar at 1280×720.
  It is pinned to the longest failed hold until the cursor moves: "[09:12:36] Writer 2 held (rv_01, pair-2 round 1).
  Running at this moment: Writer 1 (tool call, lookup_company), Writer 3 (model turn), Critic (checking rv_01)."
  Lanes grouped by *Reading* (Coordinator, Profiler 1–4, Industry Analyst), *Matching* (Matchmaker),
  *Writing* (Writer 1–3), *Checking* (Critic, with a second row when two reviews overlap).
  Each hold is a link: click, or focus and Enter, opens S2.
  Footnote: "Trace Observer and UI Bridge record every event. They run no loops, so they have no lane."
- **Latest holds** panel (left half): the five latest, columns Hold · Writer · Pair · Round · Held for · Result.
  "View all [9]".
- **Trace** panel (right half): the last nine trace lines in mono, newest first, "Newest first, as in out/trace.jsonl".

### 4.2 S2 Hold

- **Breadcrumb** Holds / rv_01. **h1** "Writer 2 held, round 1". Right: "Proposal pair-2".
- **Subline (finding, computed):** "Failed on claim 3 (C3, duplicate profile): SYN-PUB-01827 is attributed to
  R0539. Round 2 passed [29.3 s] later." On the last round of an abandoned pair: "Round cap reached: pair-4 was
  abandoned."
- **Round tabs:** "Round 1 · failed" · "Round 2 · passed", one per review of the pair.
- **Claims** panel: one row per claim: n · claim text · kind · "names R0139 · cites SYN-PUB-01827" (each ID
  opens S4 with the deciding value marked) · result pill. A failed claim shows each failing check's detail.
- **Checks** panel (384px rail): C1–C10 down, claims across, plus "All" for the whole-proposal checks (C8, C9).
  A cell is passed (ink dot), failed (red cross) or not run on that claim (grey dash); the detail is in its tooltip.
- **While it waited** panel: "Held from [09:12:36.2] to [09:12:44.3]. Running meanwhile:" then each loop with its
  ID and what it did ("1 tool call, 1 model turn", "held from 09:12:48", "reviewing rv_01").
- **What changed** panel: the claims that differ between this round and the next (or the previous), round by
  round side by side, removed words struck in muted ink, added words on the accent tint.
- The panels are placed so the two columns end level: the waiting panel and the diff each go to the shorter
  column, and the diff runs full width when neither column has room.
- Not found: "There is no hold rv_99 in this run." Not reached yet in a replay: "rv_05 has not happened yet at
  [09:11:40] in this replay."

### 4.3 S4 Record drawer

- A native `<dialog>` over any screen, 480px on desktop, full screen on a phone. The 20% backdrop separates it;
  its own shadow stays soft.
- **Title:** the record's name or title. **Line above it:** type and ID ("Publication · SYN-PUB-01827").
- **Why it is open**, when opened from a claim: "Claim 3 in rv_01 credits R0139 with this record." then each
  failing check's detail (or the deciding passing check). For a researcher's own record: "Claim 3 in rv_08 is about
  this researcher."
- **Fields** as a key-value well, the deciding value on the accent tint (an author entry, a note).
- **In this run:** every claim that names or cites the record, by review, with its result.
- **Raw record** in mono, the line holding the deciding value on the accent tint.
- Linked IDs inside the record open their own record in the same drawer, with Back.
- Close with Esc, the close button, or a click outside. Not found: "No record R9999 in the dataset index."

### 4.4 S3 Proposals

- **List:** h1 "Proposals". Subline "[4] written, [1] abandoned after the round cap." Tabs All [5] · Written [4] ·
  Abandoned [1]. Columns: Proposal (title, with "pair-2 · Industrial PhD · Writer 2" under it) · Researcher ·
  Company and challenge · Rounds · Result · Time. Sorted by the time each was written or abandoned.
- **Proposal view:** breadcrumb Proposals / pair-2. h1 is the proposal's title; the status pill on the right.
  Under it: "Industrial PhD · Mirjana Jeremić (R0539) with Panonija Mlin a.d. on C017-CH1."
  Left: the document, in the PRD's order: The problem · Research questions · Plan · What each side brings ·
  Why this pair · Agreed up front · Claims and their records. Each claim marker in the text jumps to its row.
  The table gives each claim its records and the Critic's final verdict ("Passed 5": five checks ran, all passed).
  Right rail, sticky beside the text: **Verdict** ("Passed by the Critic in round 2." / "rv_05 · 09:13:13 ·
  written 09:13:14"), **Parties**, **Rounds**. On a phone the rail follows the document.
- **Abandoned pair:** the last submitted draft under a notice: "Abandoned after 3 rounds. C5 failed in all 3
  rounds: R0068 left the faculty in March 2026. … This is the last draft the writer submitted; it was never
  written to out/proposals/."

### 4.5 Holds list

- h1 "Holds". Subline "[9] writes held, [5] failed and were sent back to the writer. The longest hold lasted [8.1 s]."
- Tabs All [9] · Failed [5] · Passed [4]. Columns: Hold · Writer · Pair · Round · Claims · Failed checks
  ("claim 3: C2, C3") · Held at · Held for · Result. Rows open S2.

### 4.6 S5 Summary

- h1 "Summary". Subline "[4] proposals for [4] different researchers and [4] different challenges. [118]
  challenges of [489] turned away before matching."
- **Pairs proposed** [4]: pair, researcher, company and challenge, format.
- **Abandoned** [1]: the pair, its reason, its three rounds, and "The Matchmaker replaced it with pair-5."
- **Failed checks by type** [7]: bars in the gate's teal: C5 Availability [3], C2 Attribution [2], C3 Duplicate
  profile [1], C4 Namesake [1]. Note: attribution (C2) fails alongside the duplicate or namesake check that explains it.
- **Holds per writer** [9]: Writer 1 [5 / 3 failed], Writer 2 [2 / 1], Writer 3 [2 / 1], with a split bar.
- **Turned away before matching** [118]: counts by reason (grey bars) beside a sample of challenges with their
  one-line reasons. "[8] of [118] shown. Every one, with its reason, is in out/no-match.md."

## 5. Components

| Component | Desktop | Phone (≤ 860px) |
|---|---|---|
| Shell | Stone L-frame, 228px sidebar, 48px top bar, white sheet inset 8px | Frame disappears; 48px bar with menu, screen name, lookup icon; nav opens a full-screen sheet |
| Replay control | Clock, segmented speed, Replay button in the top bar | Moves into the menu sheet; the clock stays in the bar |
| Counter strip | 5 equal cells split by 1px rules | 2 columns; the fifth cell takes the full width |
| Timeline | Label column 168px, plot fills the panel, 30s ticks | Label column 64px with short names (P1, W2), 60s ticks, plot fits the width; tapping a hold opens S2 |
| Hold rows / tables | Columns, numbers right-aligned, 48px rows | Two-line rows: ID and result on line 1, the rest in 12px grey on line 2 |
| Trace feed | Mono, one line per event, newest first | Same, wraps at word boundaries |
| Check grid | 10 rows × claims, in a 384px rail | Under the claims, full width |
| Claim row | n · text · IDs · kind · result | Text first, IDs and result on line 2 |
| Record drawer | 480px right sheet over the screen | Full-screen sheet from the bottom |
| Proposal document | 68ch column + 320px rail | Rail moves above the document as a short verdict strip; table scrolls inside its frame |
| Tabs | Underline, 2px ink line | Scroll sideways in their own row |
| States | Loading: grey bars at the real size, no shimmer. Empty: framed dashed box with one sentence. Error: inside the failed block, "Couldn't reach /api/proposals. Retry." | Same |

## 6. Avoid

- A dark terminal or neon-on-black "AI agent" look. This is a sheet of paper, not a cockpit.
- KPI tiles with icons in tinted circles, sparklines, or "+12%" pills.
- A gradient anywhere; glass, blur or glowing borders; shadows on panels at rest.
- Eyebrows, pill badges above headings, tracked uppercase labels, 01/02/03 numbering.
- Monospace outside IDs, trace lines and raw records.
- A rainbow of hues per agent. Lanes are told apart by their labels, not by colour.
- Any ranking of people: no scores beside names, no "top", no sort by anything but time, ID or name (C9).
- Any control that looks like it changes the run (approve, retry pair, pause agent).
- Placeholder names, invented totals, counts typed in instead of computed from the trace.
- A greeting, a hero banner, a welcome illustration, or an empty-state picture.

## 7. Sample data to replace

The console ships with a sample run in `ui/fixtures/` so it works with no backend and no key. Its researchers,
companies, papers and proposals are invented in the dataset's shape. The PRD's trap IDs (R0139/R0539,
SYN-PUB-01827, R0128/R0881, R0068, C004-CH4, C021-CH3) are used as the PRD describes them. Replace the
fixture with a committed `out/trace.jsonl` and the UI Bridge's endpoints before submission.

What is invented and where:

- `ui/fixtures/records.ts`: every researcher, publication, project, patent, company and challenge record,
  including names, faculties, notes and company figures (31,400 motors, 420 t a day, 140 ha, 2,300 ha).
- `ui/fixtures/proposals.ts`: the five proposals (titles, problems, plans, terms) and their claims per round;
  the turned-away sample and its counts by reason (118 of 489).
- `ui/fixtures/run.ts`: the schedule (times, shards, batch counts, token counts). Its verdicts are not typed in:
  a small Critic runs C1–C10 against the records, and assertions fail the build if a total disagrees.

## 8. Review log (2026-10-30)

Checked with the skill's `lint.mjs --app` and `inspect.mjs --app` at 1440, 768 and 390 on the production build,
and with a 21-step input script (hover, keyboard focus, 4× replay, lookup, drawer Back and Esc, round tabs, claim
markers, unknown IDs, the phone menu) at 1280×720. Result: 0 FAIL on every screen, 21 of 21 steps pass, no console
errors. Warnings left, each defended:

- `hero-void` on Proposals: a five-row list shrinks to its rows; nothing pads it.
- `numeric-align` at 390 on Holds: below 640px the table becomes two-line rows, where figures sit in the second line.
- `radius-mix` with the drawer open: the fourth "radius" is the claim rows' top rules (0), not a panel.
- Lint `em-dash`: the grey dash in empty cells (§11 of the skill), not prose. Lint `mono`: the spec's second face.

Fixed during the build, from the screenshots: uneven bottom panels on Run; table cells breaking words on a phone;
a jumbled word diff and uneven columns on Hold; the drawer opening before the trace arrived, a year printed as
"2,021" and double-spaced raw JSON; numberless research questions and a rail leaving the right side empty on the
proposal; the replay controls sliding under the search at 1280px; the readout below the fold at 1280×720.

Against the app-screen critique: each screen's question is answered by its biggest block (the timeline, the
claims, the document); colour sits only on the gate's data (holds, failed checks) and status; every count is
computed from the trace and the totals agree across screens (9 holds = 4 passed + 5 failed; 7 failed checks).
Still short: the Run screen's counters are the largest figures, though the finding is a duration (8.1 s) set in
the subline; and the Summary's "Turned away" shows a sample, not the full list, until a real `no-match.md` exists.
