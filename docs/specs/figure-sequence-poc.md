# Figure Sequences trainer

Status: Integrated task type. Difficulty remains provisional.

## Routes and modes

The task card opens `website/figure-sequences/`, with `learn/`,
`speed-drill/`, `mock/`, and `progress/` routes. The former
`website/figure-sequences.html` URL redirects to the new task home.

- Learn: one untimed sequence, an optional hint, and immediate review after
  submitting both answers. A `?question=ID` link opens a specific sequence.
- Speed Drill: 10 distinct sequences at the selected difficulty, elapsed time,
  and a 12:30 target. Review appears after session submission.
- Full Mock: 20 distinct sequences in 25 minutes; a training mix of 6 low,
  8 medium, and 6 high. Free navigation preserves both selections. Timeout
  submits once. Hints and correctness feedback are withheld until submission.
- Progress: recent sessions, complete-sequence and individual-frame accuracy,
  latest/best mock scores, timing, and saved-session review.

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
Generate the current 36-puzzle bank:

```sh
go run ./cmd/figure-sequence-generator \
  --out website/data/figure-sequences.json --seed 20260818 \
  --count-low 12 --count-medium 12 --count-high 12
```

Verify independently:

```sh
go run ./cmd/figure-sequence-generator \
  --verify --out website/data/figure-sequences.json
```

Generator version 2 verifies legal positions and appearances, stable actor
identities, no overlap/disappearance, four observed and two predicted frames,
three legal distinct options per answer, replay of both observed and correct
frames, canonical IDs, difficulty metadata, and requested counts. Generation
rejects ambiguous candidates and retries duplicate IDs within a finite limit.

### Predictive-uniqueness boundary

The finite rule grammar is:

- Horizontal/vertical bounce on every row/column, both diagonals, and the outer
  perimeter; every starting path index and both directions.
- Constant or increasing movement, with initial steps of 1 or 2 cells.
- Initial rotations of 0/90/180/270 degrees; fixed or increasing rotation steps
  of -90, 0, or 90 degrees.
- Repeating cycles of 1–3 distinct colours drawn from the four-colour palette,
  with all possible phases.

For each visually identifiable figure, verification checks every motion rule
that matches the four observed positions and requires it to predict the same
positions in frames 5 and 6. Rotation candidates and colour periods are checked
independently in the same way. Stored programs must belong to this grammar.
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

Labels describe structural load and have not been calibrated against human
accuracy or timing. Sessions do not repeat a puzzle internally; the small bank
can repeat puzzles between sessions.

## Validation

Run `go test ./...`, `go vet ./...`, the bank verifier above, and `npm test`.
Tests cover deterministic generation, ambiguity and corruption rejection,
paired scoring, import compatibility and rollback, mobile learn/review and
backup restoration, drill navigation, mock timeout, legacy URLs, and visible
bank/storage errors. Existing trainer and transfer browser tests also run.
