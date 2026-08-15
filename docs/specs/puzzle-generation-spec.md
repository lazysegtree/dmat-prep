# dMAT Puzzle Generation Specification

Status: Draft v2

Implementation language: Go

## 1. Goal

Build an offline command-line program that generates a static JSON bank of 5×5 dMAT Latin-square questions and a separate JSON catalogue of all 56 reduced 5×5 Latin squares.

Each question contains an incomplete grid with one target cell displayed as `?`. The generator stores the target answer, complete solution, approximate difficulty, and a human-readable inference method.

The scoring only needs to create broadly useful practice levels. Small errors between neighbouring levels are acceptable.

## 2. Puzzle requirements

- Grid size: 5×5.
- Symbols: A, B, C, D, and E.
- Each symbol occurs exactly once in every row and column of the complete square.
- Every published incomplete grid has exactly one complete solution.
- The target is empty in the published grid.
- The target answer matches the stored complete solution.

## 3. Generation pipeline

For each candidate:

1. Generate a random complete Latin square using randomized backtracking.
2. Randomly remove values, initially leaving 8–15 givens.
3. Select one removed cell as the target.
4. Reject the candidate unless the incomplete grid has exactly one solution.
5. Score the target using weighted inference search.
6. Reject candidates that exceed the search limit or do not fit a needed difficulty level.
7. Reject exact duplicates and add accepted puzzles to the output bank.

The number of givens is a generation setting, not the difficulty score. The range can be adjusted after observing acceptance rates.

### Reduced-square catalogue

Before generating puzzle candidates, enumerate all reduced 5×5 Latin squares. In every reduced square, both the first row and first column are exactly `A, B, C, D, E`.

The catalogue contains each of the 56 reduced squares exactly once in deterministic lexicographic order. Its contents do not depend on the random seed.

## 4. Inference rules

Use the following three sound rules. Each rule proves one empty cell, has a manually assigned positive weight, and records the evidence used. Rows and columns are treated symmetrically.

These are the complete inference rules for version one. The scorer may chain deductions made by these rules, but it must not fill a cell using any other inference method.

Comment: Add weights. Rule 1 -> 1, Rule 2/3 -> 'K' 

### Rule 1: Single Missing Cell

Internal identifier: `single-missing-cell`

1. Select a row or column with exactly one empty cell.
2. Determine which one of `A`, `B`, `C`, `D`, and `E` is absent from that row or column.
3. Place the absent value in the empty cell.

### Rule 2: Unique Candidate Position

Internal identifier: `unique-candidate-position`

1. Select a row or column with `K` empty cells, where `K` is from 2 through 5.
2. Build its missing-candidate set `M`. The set contains exactly `K` values.
3. Select one candidate value `v` from `M`.
4. For each empty cell in the selected row or column, inspect its intersecting column or row. Eliminate the cell as a position for `v` if that intersecting unit already contains `v`.
5. If exactly one eligible cell remains, place `v` in that cell.

This rule asks: “Where can this candidate go within the selected row or column?”

### Rule 3: Unique Candidate for a Cell

Internal identifier: `unique-candidate-for-cell`

1. Select a row or column with `K` empty cells, where `K` is from 2 through 5.
2. Build its missing-candidate set `M`. The set contains exactly `K` values.
3. Select one empty cell `c` in that row or column.
4. Inspect the intersecting column or row for `c`. Eliminate from `M` every candidate value already present in that intersecting unit.
5. If exactly one eligible candidate remains, place it in `c`.

Equivalently:

```text
eligible candidates for c = M - values in the intersecting row or column
```

The rule applies only when the eligible-candidate set has size one. It asks: “Which candidate can go in this selected cell?” Candidate sets need only be computed for the cell currently being examined; they are not persistent puzzle state.

For Rules 2 and 3, the recorded evidence includes `K`, the selected unit, its missing-candidate set, the selected candidate or cell, the eliminations, and the resulting placement. Rule weights are configuration values. Within either rule, the weight increases with `K` to represent the greater difficulty of considering more empty cells and candidates. The exact weights can be tuned by reviewing generated examples.

The scorer must not use the stored solution to decide whether an inference is available. The solution is used only to validate the inferred result.

Comment: Use a simple method to explore the graph till a given max depth, and given max number of nodes, while assiging every edge a weight, that is weight of rule + fixed lambda '2'

Comment: Then we just find minimum weighted path from source to target. Via dijsktra.
For now, just use that one weight of shortest path alone to detemine hardness. Remove all this unecessary details.

## 5. Difficulty scoring

A search node is a partial grid. An edge is one valid inference that fills one additional cell and carries that rule's weight.

Use cost-ordered search with a priority queue, not ordinary breadth-first search, because inference weights may differ.

Find up to three lowest-cost distinct paths that reach the target. For each path:

```text
path score = sum of rule weights + step scalar × inference count
```

Start with a step scalar of `2`. The puzzle score is the average of the available lowest three path scores.

The inference count represents intermediate results the student must derive and remember. Internal states explored by the program do not affect difficulty.

Minimum safeguards:

- A target provable in one inference is Easy.
- Extreme requires every retained route to contain at least four inferences.
- Reaching the search limit means unrated and rejected, not Extreme.

Difficulty boundaries remain configurable and will be adjusted after manually solving a sample from each level.

## 6. Initial limits

- Search states per candidate: 10,000.
- Given cells: 8–15.
- Paths used for scoring: up to 3.
- Step scalar: 2.
- Generation attempts: configurable.

The generator reports rejection counts for ambiguous, unrated, duplicate, and unwanted-difficulty candidates.

## 7. Duplicate handling

Version one prevents exact duplicates only.

Create a canonical string from the 25 grid cells plus target coordinates, hash it, and reject hashes already accepted. Similarity scoring and symmetry-aware deduplication are postponed unless repetition becomes noticeable.

## 8. JSON output

### 8.1 Puzzle bank

The output contains a format version, generator settings, and a puzzle list. Each puzzle contains:

```json
{
  "id": "DMAT-G1-A7F32C",
  "grid": [
    ["B", "", "E", "", ""],
    ["", "D", "", "", ""],
    ["", "", "C", "", ""],
    ["D", "A", "", "C", ""],
    ["", "", "", "", "B"]
  ],
  "target": { "row": 3, "column": 2 },
  "answer": "B",
  "solution": [
    ["B", "C", "E", "D", "A"],
    ["E", "D", "A", "B", "C"],
    ["A", "B", "C", "E", "D"],
    ["D", "A", "B", "C", "E"],
    ["C", "E", "D", "A", "B"]
  ],
  "difficulty": {
    "score": 4.0,
    "level": "easy",
    "rulesVersion": 1,
    "pathScores": [4.0]
  },
  "bestMethod": [
    { "rule": "unique-candidate-position", "row": 3, "column": 2, "value": "B", "weight": 2 }
  ],
  "validation": { "solutionCount": 1, "givens": 8 }
}
```

Row and column indexes are zero-based.

Puzzle IDs are derived from the canonical puzzle identity and generator version. The actual complete solution is stored; no separate completed-square ID is needed.

### 8.2 Reduced-square catalogue

The separate catalogue JSON contains a format version, the symbol list, and a `squares` array with exactly 56 entries. Each entry contains a stable sequential ID and one complete grid:

```json
{
  "id": "DMAT-REDUCED-001",
  "grid": [
    ["A", "B", "C", "D", "E"],
    ["B", "C", "D", "E", "A"],
    ["C", "D", "E", "A", "B"],
    ["D", "E", "A", "B", "C"],
    ["E", "A", "B", "C", "D"]
  ]
}
```

## 9. Command-line behavior

The program accepts at least:

- Puzzle-bank output path.
- Reduced-square catalogue output path.
- Random seed.
- Requested count or count per difficulty level.
- Maximum generation attempts.
- Search-state limit.

The same program version, settings, and seed produce the same outputs. Progress and rejection statistics go to standard error; both output files contain valid JSON only.

## 10. Acceptance checks

Automated tests verify:

- Generated complete grids obey Latin-square rules.
- Zero-solution and multiple-solution grids are rejected.
- Every inference rule is sound.
- Direct target deductions are Easy.
- A puzzle is not Extreme if a route shorter than four inferences exists.
- Stored answers match complete solutions.
- Identical settings and seed reproduce output.
- Exact duplicate grid-and-target pairs are absent.
- The reduced-square catalogue contains exactly 56 distinct grids.
- Every catalogue grid is a valid complete Latin square with its first row and first column fixed to A–E.
- Catalogue order and IDs are deterministic.

Before producing the main bank, manually solve a small sample from every level and adjust weights or boundaries if the classification is obviously wrong.

## 11. Out of scope

- Enumerating every incomplete Latin-square state.
- Browser-side puzzle generation.
- Academically precise cognitive modelling.
- Fine-grained measures such as candidate count or attention switching.
- Sophisticated similarity scoring or human-performance calibration.
