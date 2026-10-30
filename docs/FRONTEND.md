# Obstat frontend: the terminal and the landing page

Owner of look and stack for the web frontend (PRD §11, T12): the terminal, the read-only console onto a run, and
the landing page in front of it (§9). The PRD owns data and behaviour; this file owns everything a viewer sees.
Written 2026-10-30 from PRD v1, following the `design-taste-frontend` skill (the app-screen run for the terminal,
the page run for the landing page).

Terminal style dealt: **Framed sheet** (light), seed `315125889`, kind `devtools`. No redraws. Landing page: §9.

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

- **Vite + TypeScript, no framework.** Two pages in `ui/`: the landing page at `/` (`ui/index.html`, §9) and the
  terminal, the read-only console, at `/console.html`. The terminal uses hash routes (`#/run`, `#/holds/rv_03`,
  `#/proposals/pair-2`; `?record=R0539` on any route opens the drawer). `ui/` has its own `package.json`, so a UI
  build failure cannot break `npm start` (T12).
- **One data client** (`ui/src/data/`) reads exactly the PRD endpoints: `GET /events` (SSE, one trace line per
  event), `GET /api/summary`, `GET /api/proposals`, `GET /api/proposals/:pairId`, `GET /api/records/:id`.
- **One server-side answer to those endpoints:** `src/ui-bridge/api.ts` reads a finished run (`out/trace.jsonl`,
  `out/run.json`, `out/proposals/*.json`) and serves records from the dataset index. `npm run ui`, the Vite dev
  server and the Vite preview all use it, so every screen is built and checked against the committed run and the
  real dataset. There is no sample data.
- **Replay speed** (1×, 4×, Instant) is playback of the trace in the browser only. It does not touch the run.
  Lists, counters and the hold screens follow the playhead; the Summary shows the final figures.

### Running it

```bash
npm run ui:build           # from the project root, once: installs and builds ui/
npm run ui                 # http://127.0.0.1:4320: the landing page; the terminal is at /console.html
cd ui && npm run dev       # http://127.0.0.1:4310, for design work, same data
cd ui && npm run preview   # http://127.0.0.1:4311, the production build, same data
```

All of them need the committed run in `out/` and the dataset in `data/data` (see the README).

### Trace line the terminal expects

The PRD's line plus an optional `data` object on the events the screens need:

```json
{"t":"2026-10-30T18:25:57.229Z","type":"interception.started","producer":"W2","loopId":"<Mozaik loop UUID>",
 "summary":"write_proposal held (6 claims)","data":{"reviewId":"rv_03","pairId":"pair-2","round":1}}
```

- `claim.review.requested.data` carries `{ reviewId, writerId, pairId, round, claims[], proposal }`;
  `claim.review.completed.data` carries the verdict shape of PRD §9 plus `checks[]` (every check run, pass or fail).
- Loop IDs are Mozaik's UUIDs. The screens never show them: a loop is named by what it was for ("writing pair-1"),
  from its `loop.started` line.
- A call the gate rejected as malformed is marked `"malformed": true` on its `interception.started` line. It never
  reached the Critic, so the terminal shows it in the trace feed and does not count it as a hold.
- `loop.closing` and `loop.closed` mark a writer's loop ending after its file was written. They are not holds.

## 4. Screens, in build order

Copy below is the copy that ships. Figures in brackets are computed from the trace, never typed; the examples are
the committed run's own figures (times in Belgrade time).

### 4.0 The shell (built first, with every screen)

- **Sidebar** on the stone frame: the mark and "Obstat", which leads back to the landing page; under it the scope,
  "Run of 30 Oct 2026, 19:23 CET". Nav: **Run**, **Holds**, **Proposals**, **Summary**. No counts: nothing here
  is a queue to act on. Foot: "Read-only. Replaying out/trace.jsonl".
- **Top bar** (48px, frame tint, no rule): a centred lookup field, label "Look up a record",
  placeholder "Look up R0539, SYN-PUB-01827, C017-CH1", shortcut `/`, Esc clears it. A wrong format gets one line:
  "Type a dataset ID: a researcher (R0539), a record (SYN-PUB-01827), a company (C017) or a challenge (C017-CH1)."
  Right end: the replay clock "[19:28:16] of [19:28:16]", a segmented control **1× · 4× · Instant**, and
  **Replay** (the one primary). The lookup centres in whatever room the replay controls leave.
- **The sheet**: white, inset 8px right and bottom, radius 16, 1px edge, no shadow. Content padding 24.

### 4.1 S1 Run

- **h1** "Run". **Subline (the finding):** computed from the hold that caught a wrong person (C2, C3 or C4) if
  there is one, else the longest failed hold, and led by the claim's own explanation: "The Critic held Writer 2 for
  [1.1 s] and failed claim 4 on C3, duplicate profile. Writers 1 and 3 kept working the whole time."
- **Counters**, one strip split by 1px dividers, each with a grey note: **Loops running** [0] ("Most at once: [5],
  at [19:23:22]") · **Holds** [6] ("On [3] pairs") · **Passed** [3] ("Released to write_proposal") · **Failed** [3]
  ("Sent back to the writer") · **Proposals written** [3] ("None abandoned").
- **Timeline** panel, title "Loops by participant", the legend in its header (the marks themselves): Running ·
  Held by the gate · Critic reviewing · Proposal written · Pair abandoned.
  Under the header, the **readout**, above the chart so it shares the first screen with the held bar at 1280×720.
  It is pinned to the finding's hold until the cursor moves: "[19:25:57] Writer 2 held (rv_03, pair-2 round 1).
  Running at this moment: Writer 1 (model turn), Writer 3 (model turn), Critic (checking rv_03)."
  Lanes grouped by *Reading* (Coordinator, Profiler 1–4, Industry Analyst), *Matching* (Matchmaker),
  *Writing* (Writer 1–3), *Checking* (Critic, with a second row when two reviews overlap). A hold the Critic
  settled in a second is still drawn at least 7px wide, so it can be seen and pointed at.
  Each hold is a link: click, or focus and Enter, opens S2.
  Footnote: "Trace Observer and UI Bridge record every event. They run no loops, so they have no lane."
- **Latest holds** panel (left half): the five latest, columns Hold · Writer · Pair · Round · Held for · Result.
  "View all [6]".
- **Trace** panel (right half): the last nine trace lines in mono, newest first, "Newest first, as in out/trace.jsonl".

### 4.2 S2 Hold

- **Breadcrumb** Holds / rv_03. **h1** "Writer 2 held, round 1". Right: "Proposal pair-2".
- **Subline (finding, computed):** "Failed on the proposal and claims 4, 5 and 6 (C3, duplicate profile):
  SYN-PUB-01827 is attributed to R0539. Round 2 passed [61.1 s] later." Claims are listed the way a person would
  ("claims 4, 5 and 6"), and a claim's own C3 or C4 reason leads over C2's bare mismatch. On the last round of an
  abandoned pair: "Round cap reached: pair-N was abandoned."
- **Round tabs:** "Round 1 · failed" · "Round 2 · passed", one per review of the pair.
- **Claims** panel: one row per claim: n · claim text · kind · "names R0139 · cites SYN-PUB-01827" (each ID
  opens S4 with the deciding value marked) · result pill. A failed claim shows each failing check's detail.
- **Checks** panel (384px rail): C1–C10 down, claims across, plus "All" for the whole-proposal checks (C1, C3, C7,
  C8, C9). A cell is passed (ink dot), failed (red cross) or not run on that claim (grey dash); the detail is in
  its tooltip.
- **While it waited** panel: "Held from [19:25:57.2] to [19:25:58.3]. Running meanwhile:" then each loop by what it
  was for and what it did ("writing pair-1 · running", "writing pair-3 · 1 model turn, held from 19:25:57",
  "reviewing rv_03").
- **What the writer changed** panel: the claims that differ between this round and the next (or the previous).
  When the sentence is unchanged it is shown once, with only the ID change marked ("Names ~~R0139~~ R0539"); when
  the words changed, the two rounds sit side by side, removed words struck in muted ink, added words on the
  accent tint.
- The panels are placed so the two columns end level: the waiting panel and the diff each go to the shorter
  column, and the diff runs full width when neither column has room.
- Not found: "There is no hold rv_99 in this run." Not reached yet in a replay: "rv_05 has not happened yet at
  [19:24:10] in this replay."

### 4.3 S4 Record drawer

- A native `<dialog>` over any screen, 480px on desktop, full screen on a phone. The 20% backdrop separates it;
  its own shadow stays soft.
- **Title:** the record's name or title. **Line above it:** type and ID ("Publication · SYN-PUB-01827").
- **Why it is open**, when opened from a claim: "Claim 4 in rv_03 credits R0139 with this record." then each
  failing check's detail (or the deciding passing check). For a researcher's own record: "Claim 3 in rv_08 is about
  this researcher."
- **Fields** as a key-value well, the deciding value on the accent tint (an author entry, a note).
- **In this run:** every claim that names or cites the record, by review, with its result.
- **Raw record** in mono, the line holding the deciding value on the accent tint.
- Linked IDs inside the record open their own record in the same drawer, with Back.
- Close with Esc, the close button, or a click outside. Not found: "No record R9999 in the dataset index."

### 4.4 S3 Proposals

- **List:** h1 "Proposals". Subline "[3] written." Tabs All [3] · Written [3] · Abandoned [0]. Columns: Proposal
  (title, with "pair-2 · Industrial PhD · Writer 2" under it) · Researcher · Company and challenge · Rounds ·
  Result · Time. Sorted by the time each was written or abandoned.
- **Proposal view:** breadcrumb Proposals / pair-2. h1 is the proposal's title; the status pill on the right.
  Under it: "Industrial PhD · Mirjana Jeremić (R0539) with Terramap Subotica d.o.o. on C062-CH1."
  Left: the document, in the PRD's order: The problem · Research questions · Plan · What each side brings ·
  Why this pair · Agreed up front · Claims and their records. Each claim marker in the text, the plan table
  included, jumps to its row; a marker list such as `{1, 2}` becomes one button per claim.
  The table gives each claim its records and the Critic's final verdict ("Passed 6": six checks ran, all passed).
  Right rail, sticky beside the text: **Verdict** ("Passed by the Critic in round 2." / "rv_07 · 19:26:59 ·
  written 19:26:59"), **Parties**, **Rounds**. On a phone the rail follows the document.
- **Abandoned pair:** the last submitted draft under a notice: "Abandoned after [n] rounds. [reason] This is the
  last draft the writer submitted; it was never written to out/proposals/."

### 4.5 Holds list

- h1 "Holds". Subline "[6] writes held, [3] failed and were sent back to the writer. The longest hold lasted
  [40.2 s]."
- Tabs All [6] · Failed [3] · Passed [3]. Columns: Hold · Writer · Pair · Round · Claims · Failed checks
  ("claim 4: C2, C3") · Held at · Held for · Result. Rows open S2.

### 4.6 S5 Summary

- h1 "Summary". Subline "[3] proposals for [3] different researchers and [3] different challenges. [135]
  challenges of [489] turned away before matching."
- **Pairs proposed** [3]: pair, researcher, company and challenge, format.
- **Abandoned** [0]: "No pair was abandoned." When there is one: the pair, its reason, its rounds, and its
  replacement.
- **Failed checks by type** [10]: bars in the gate's teal: C3 Duplicate profile [4], C2 Attribution [3],
  C5 Availability [2], C6 Capacity [1]. Note: attribution (C2) fails alongside the duplicate or namesake check that
  explains it.
- **Holds per writer** [6]: Writer 1, 2 and 3 [2 / 1 failed] each, with a split bar.
- **Turned away before matching** [135] ("134 not_research · 1 no_uns_fit"): counts by the kind of work (grey
  bars: legal, tax or compliance [43], funding [38], hiring [36], and the rest) beside twelve of them with the
  Analyst's own reasons. "[12] of [135] shown. Every one, with its reason, is in out/no-match.md."

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

## 7. Data

There is no sample data. The terminal and the landing page both show the committed run:

- `out/trace.jsonl`, `out/run.json` and `out/proposals/*.json` from the last `npm start -- --demo`;
- dataset records from `data/data`, read into the same in-memory index the runtime uses.

`src/ui-bridge/api.ts` turns those into the five endpoints for `npm run ui`, the dev server and the preview alike.
The landing page's figures, IDs, quotes and reasons are copied from the same run and dataset; if the committed run
changes, its copy must be checked against the new `out/`.

## 8. Review log

### 2026-10-30: the terminal on a sample run

Checked with the skill's `lint.mjs --app` and `inspect.mjs --app` at 1440, 768 and 390 on the production build,
and with a 21-step input script (hover, keyboard focus, 4× replay, lookup, drawer Back and Esc, round tabs, claim
markers, unknown IDs, the phone menu) at 1280×720. Result: 0 FAIL on every screen, 21 of 21 steps pass, no console
errors. Warnings left, each defended:

- `hero-void` on Proposals: a short list shrinks to its rows; nothing pads it.
- `numeric-align` at 390 on Holds: below 640px the table becomes two-line rows, where figures sit in the second line.
- `radius-mix` with the drawer open: the fourth "radius" is the claim rows' top rules (0), not a panel.
- Lint `em-dash`: the grey dash in empty cells (§11 of the skill), not prose. Lint `mono`: the spec's second face.

Fixed during the build, from the screenshots: uneven bottom panels on Run; table cells breaking words on a phone;
a jumbled word diff and uneven columns on Hold; the drawer opening before the trace arrived, a year printed as
"2,021" and double-spaced raw JSON; numberless research questions and a rail leaving the right side empty on the
proposal; the replay controls sliding under the search at 1280px; the readout below the fold at 1280×720.

### 2026-10-30: the terminal on the committed run

Connected to the real trace through `src/ui-bridge/`. Fixed from the screenshots of real data:

- The Run finding picked the longest failed hold (a missing quote) instead of the R0139 trap; it now prefers a hold
  that caught a wrong person.
- "While it waited" showed Mozaik's loop UUIDs; it now names each loop by its task.
- A 1.1 s hold was a sliver on the timeline; held bars now have a minimum width.
- The round diff repeated unchanged sentences in two narrow columns; an unchanged sentence now shows once, with the
  ID change marked.
- `{n}` markers were raw text in the plan table, and `{1, 2}` lists were not parsed.
- Malformed calls the gate rejected were counted as holds.
- The turned-away table printed full challenge texts.

Re-inspected: 0 FAIL on Run, the hold, the holds list, proposals, a proposal and the summary at all three widths.

## 9. The landing page

Built with the skill's page run (not the app-screen run), at `ui/index.html` with `ui/site/site.css` and
`ui/site/site.ts`. It keeps the terminal's palette and type (`--keep palette,type`).

- **Direction dealt:** "Dressed as something else" (borrowed category), seed `925220181`, no redraws.
- **Idea:** *nihil obstat* is the line a censor printed in a book before it could go to press, so the page is
  dressed as a book's front matter with the Critic as its censor: title page (hero), the censor's statement,
  how it was examined, the index of checks, contents (the proposals), the errata sheet (what was turned away),
  the imprimatur (the OPEN band) and the colophon (footer).
- **One action:** **Open terminal**, in the navigation and as the OPEN band, to `console.html#/run`.
- **Sections, in order:**
  - the hero, "NO PROPOSAL / LEAVES UNCHECKED", with the plain sentence under it and the real hold screen for
    rv_03 rising beneath;
  - the censor's statement on an ink field, with the two records of one person (R0139 and R0539) and an 1897
    imprimatur page;
  - four steps as a staircase, closed by a film of a platen press;
  - the ten checks as the product's command menu;
  - the three proposals as big names beside a picture of each one's world;
  - the turned-away challenges on a printed sheet over Novi Sad's main square;
  - the OPEN band;
  - the colophon, with the name at full width.
- **Live thing:** the check menu. Type "c3", "c4" or "namesake", move with the arrow keys or tap a row, and read
  what each check fails on, with the committed run's real failure where there was one. Without script it is a
  plain list with every sentence shown.
- **Type:** IBM Plex Sans only (Plex Mono only for the commands in the colophon), five sizes: 14, 18, 32, 66
  and the headline, which is sized from the measured width of "LEAVES UNCHECKED" to about two thirds of the page
  (the full width on a phone).
- **Pictures:** six real pictures and one film from Wikimedia Commons, stored in `ui/public/landing/`. The page
  carries no captions and no credit line; the credits the licences require are in `docs/CREDITS.md`.
- **Motion:** the headline's lines rise from behind their baseline on load; each section's parts rise in once as
  it enters; the press film loops muted, and the Novi Sad photograph drifts with the scroll. Under
  `prefers-reduced-motion` nothing travels and the film stays on its poster frame.
- **Checked:** `inspect.mjs` 0 FAIL, 0 WARN at 1440, 768 and 390 on the production build; `lint.mjs` 0 FAIL;
  an input script (filtering, arrow keys, hover on the proposals, Open terminal reaching the terminal, the
  terminal's mark leading back) passes with no console errors. Last critique: 7.9 overall (design 7.5, usability
  8, creativity 8, content 8.5). Still short: a stretch of ink between the statement and the records on desktop;
  the book is carried by structure and real artefacts, not by type, because the brand fixes the type.
