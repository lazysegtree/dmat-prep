# Figure Sequence Generator and UI POC

Status: Working proof of concept

## Scope

The POC adds a separate Figure Sequence practice page to the static dMAT trainer. Each generated question contains:

- A 4x4 matrix.
- Four observed frames.
- Two predicted frames.
- Three answer options for each predicted frame.
- One to four figures whose position, colour, and orientation can change.
- A hint and an actor-by-actor explanation shown after submission.

The browser loads a pre-generated JSON bank. It does not generate puzzles at runtime.

## Generator

Run:

```sh
go run ./cmd/figure-sequence-generator \
  --out website/data/figure-sequences.json \
  --seed 20260818 \
  --count-low 12 \
  --count-medium 12 \
  --count-high 12
```

Verify an existing bank:

```sh
go run ./cmd/figure-sequence-generator \
  --verify \
  --out website/data/figure-sequences.json
```

The current rule templates cover horizontal, vertical, and diagonal bouncing; clockwise or counter-clockwise perimeter movement; fixed or increasing step sizes; quarter-turn rotation; increasing rotation; and colour cycles.

The verifier requires valid positions, no overlapping or disappearing figures, exactly four observed and two predicted frames, three legal distinct options per answer, deterministic program replay, canonical IDs, and exact requested difficulty counts.

## Difficulty

Difficulty is provisional and structural:

- Low: one moving figure.
- Medium: three figures, including colour or rotation tracking.
- High: four figures, at least seven changing tracks, at least two coupled actors, and at least one increasing program.

The labels are not calibrated against human timing or accuracy.

## Known POC limitation

The generator proves that its stored rule programs deterministically produce the correct fifth and sixth frames. It does not yet enumerate every alternative rule program that might also fit the first four frames. A production generator should add that predictive-uniqueness check before publishing a large bank.
