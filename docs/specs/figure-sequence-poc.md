# Figure Sequences trainer

Status: Integrated task type. Difficulty remains provisional.

## Routes and modes

The task card opens `website/figure-sequences/`, with `learn/`,
`speed-drill/`, `mock/`, and `progress/` routes. The former
`website/figure-sequences.html` URL redirects to the new task home.

- Learn: one untimed sequence, an optional hint, and immediate review after
  submitting both answers. A `?question=ID` link opens a specific sequence.
- Speed Drill: 5 or 10 distinct sequences, using the same setup as Latin Squares and Mathematical Equations. Choose Single difficulty (All Easy, Medium, Hard, or Extreme) or Mixed (All difficulties, Easy, Medium, Hard, or Extreme). Easy/Hard map to Low/High; named mixes reuse Full Mock proportions, with Medium using Normal. All difficulties balances the four tiers. Percentages appear before starting, with whole-question rounding and shuffled order. Difficulty and feedback stay hidden until submission. Time options are 75 seconds per question, custom 0.25–180 minutes in 0.25-minute steps, or an unlimited stopwatch. Default: 5 mixed sequences and a 6:15 countdown. Custom Minutes stays within Time limit; expiry scores only saved answers. Settings persist in URLs, results, backups, and repeats. Legacy drills without timer metadata retain stopwatch timing when repeated.
- Full Mock: 20 distinct sequences in 25 minutes; selectable mixes: Easy (10 Low, 8 Medium, 2 High), Normal (default: 6 Low, 8 Medium, 6 High), Hard (8 Medium, 10 High, 2 Extreme), and Extreme (5 Medium, 10 High, 5 Extreme). Free navigation preserves both selections. Timeout
  submits once. Hints and correctness feedback are withheld until submission.
- Progress: recent sessions, complete-sequence and individual-frame accuracy,
  latest/best mock scores, timing, and saved-session review.

Mock level is retained in the URL, results, history, backups, and repeat attempts. Old mocks without a level display Normal. Learn and Speed Drill also offer the new Extreme question tier. Existing Low, Medium, and High question IDs are preserved.

Each sequence has four observed 4x4 matrices and two predicted frames (5 and 6),
with three options each. One complete-sequence point requires both answers to be
correct. Individual-frame accuracy gives credit for a correct frame even if its
partner is unanswered. A partially answered sequence is classified as unanswered.
The displayed scoring and difficulty mix are training conventions.

## Rendering and sessions

The figure-specific SVG renderer and paired-answer scorer remain separate from
Latin Squares and Mathematical Equations. Shared clock, time formatting, and
backup utilities are reused. Options have descriptive accessible labels and
selected states. Review shows the submitted and correct choices plus an
explanation for each figure. Timed sessions warn before leaving.

The figure library has 18 silhouettes. The supplied sample-paper figures are
square, hexagon, diamond with a cross, arrow, triangle, bent corner, trapezoid,
and arch. The existing solid corner and chevron are retained. Additional practice
figures are flag, lightning, teardrop, crescent, notched square, hook, semicircle,
and fork. White (outlined) and yellow join teal, magenta, amber, and ink.
The silhouettes follow the supplied references; generated sequences are new
practice questions, not copies of the sample exercises.

Generation balances shape exposure separately at each difficulty and varies
the assignment of shapes to motion, colour, and rotation roles. Rotating roles
use shapes with four visibly different quarter-turn orientations. Square and
diamond-cross are unchanged by quarter-turns; hexagon repeats after a half-turn.
These symmetric shapes practise movement/colour in Low, Medium, and High.
Extreme retains its requirement that every figure visibly rotates, so uses the
15 directional shapes. Each drill and mock difficulty group prefers the least
represented shapes in the session, then prefer less-practised movement paths,
step patterns, rotations, and colour cycles among equally varied silhouettes.
Randomized ties keep sessions fresh. Single-difficulty Easy/Low drills show five or ten different silhouettes, matching the selected question count. Mixed drills retain this selection strategy within each difficulty group and shuffle the combined selection.

Completed sessions are stored under `dmat-figures-progress-v1`, newest first,
limited to 50. They include IDs, mode, difficulty, paired choices, per-sequence
times and statuses, complete-sequence and individual-frame counts, hint use,
and automatic-submission state. Storage failures display an error while keeping
results visible. If a saved question is absent from a later bank, its score
remains available and review states that the question is unavailable.

Backups use `dmat-progress` version 3 and include all three trainers. Versions 1
(legacy single trainer) and 2 (Latin Squares and Mathematical Equations) remain
readable; Replace changes only trainers present in that version. Merge preserves
local ID conflicts, deduplicates, and keeps the newest 50 sessions per trainer.
Figure-session validation covers paired choices, frame-count bounds, session
lengths, and review fields before any storage mutation. Existing import rollback
also covers failure while saving the third trainer.

## Generator and verification

The static browser loads a pre-generated bank; Go is not required at runtime.
Generate the current 576-puzzle bank (144 per difficulty), retaining the existing
288 questions byte-for-byte at the puzzle level for saved-result review:

```sh
go run ./cmd/figure-sequence-generator \
  --out website/data/figure-sequences.json --seed 20260924 \
  --retain data/figure-sequences-v3.json \
  --count-low 144 --count-medium 144 --count-high 144 --count-extreme 144
```

Verify independently:

```sh
go run ./cmd/figure-sequence-generator \
  --verify --out website/data/figure-sequences.json
```

Counts specify final totals, including retained questions. The retained source
is the frozen version-3 bank (including its original version-2 questions);
omitting `--retain` generates a wholly new bank.

Generator version 4 verifies legal positions and appearances, stable actor
identities, no overlap/disappearance, four observed and two predicted frames,
three visually distinct options per answer, replay of both observed and correct
frames, canonical IDs, difficulty metadata, and requested counts. Generation
rejects ambiguous candidates and retries duplicate IDs within a finite limit.
All 288 version-2/3 questions are retained unchanged, including their IDs, and
are rechecked against the expanded rule grammar. Rotation-equivalent distractors
are rejected in both Go verification and browser validation.

### Predictive-uniqueness boundary

The finite rule grammar is:

- Horizontal/vertical bounce on all four rows and columns.
- Both diagonal directions on all ten diagonal lines containing at least two
  cells, including off-centre lines. A bounce retraces the same diagonal.
- Clockwise/counter-clockwise traversal of the outer perimeter and all nine
  squares of four neighbouring cells, including the central square.
- Stationary figures in any cell. Generation uses these for visible rotation
  in Medium and High; a fixed position is not counted as a changing track.
- Every starting path index and both travel directions are considered.
- Constant or increasing movement, with initial steps of 1 or 2 cells.
- Initial rotations of 0/90/180/270 degrees; fixed or increasing rotation steps
  of -90, 0, or 90 degrees.
- Repeating cycles of 1–3 distinct colours drawn from the six-colour palette,
  with all possible phases.

The movement inventory follows the rules, diagrams, and worked examples on
pages 6–15 of the [official September 2026 preparatory material](https://www.d-mat.de/wp-content/uploads/2026/09/260902_dMAT_General-Academic-Module_Preparatoy-Materials_EN.pdf).
Increasing counter-clockwise rotation is the directional counterpart of the
worked clockwise example, rather than a separate official example. The PDF
permits `x + 1` colour changes but does not demonstrate their mechanism; the
trainer keeps constant colours and the demonstrated two-/three-colour cycles
instead of choosing an unspecified interpretation.

Path, direction, and initial step are selected independently, balancing path
exposure for each step pattern. The published-bank regression check requires
every row/column/diagonal, both directions at every small-square location, both
perimeter directions, stationary positions, all four step patterns per moving
family, both rotation directions (constant and increasing), and all three colour
cycle lengths. Constant two-step jumps on two-cell diagonals are excluded from
generation because their observed positions never change. The ambiguity checker
still considers them as alternative explanations.

For each visually identifiable figure, verification checks every motion rule
that matches the four observed positions and requires it to predict the same
positions in frames 5 and 6. Rotation candidates and colour periods are checked
independently in the same way, comparing rotations modulo each shape's visual
period. Stored programs must belong to this grammar.
Different programs are allowed when their next two frames agree.

This is predictive uniqueness within the stated grammar, not proof against all
imaginable patterns. The test is conservative: a conflicting track rejects the
puzzle even if that alternative would collide with another figure. The browser
validates the bank schema and version; the Go verifier supplies the exhaustive
rule check. A top-row sequence that could turn around or continue along the
perimeter is a regression fixture and must be rejected.

## Difficulty

- Low: one moving figure.
- Medium: three figures, including colour or rotation tracking.
- High: four figures, at least seven changing tracks, at least two figures with
  multiple changing properties, and at least one increasing program.

- Extreme: four figures, all changing position, colour, and rotation (12 tracks),
  with at least two figures using increasing movement or rotation. The verifier
  rejects relabelled High puzzles that do not meet this gate.

Labels describe structural load and have not been calibrated against human
accuracy or timing. Sessions do not repeat a puzzle internally; the bank
can repeat puzzles between sessions.

## Validation

Run `go test ./...`, `go vet ./...`, the bank verifier above, and `npm test`.
Tests cover deterministic generation, ambiguity and corruption rejection,
paired scoring, import compatibility and rollback, mobile learn/review and
backup restoration, drill navigation, mock timeout, legacy URLs, and visible
bank/storage errors, coverage across generator seeds, complete published movement
coverage, stationary and off-centre path replay, both increasing rotation
directions, symmetric-shape distractor rejection, retained-question identity,
varied drill selection, and rendering and
scoring all 18 silhouettes. Existing trainer and transfer browser tests also run.
