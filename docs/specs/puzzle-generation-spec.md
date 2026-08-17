# dMAT Puzzle Generation Specification

Status: Draft v3

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

Version one uses these fixed rule weights:

- Rule 1 has weight `1`.
- Rules 2 and 3 have weight `K`, the number of empty cells in the selected row or column.

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

For Rules 2 and 3, the recorded evidence includes `K`, the selected unit, its missing-candidate set, the selected candidate or cell, the eliminations, and the resulting placement.

Each inference in `bestMethod` uses the following common fields:

- `rule`: one of the three internal rule identifiers.
- `weight`: the rule weight before adding the step scalar.
- `unit`: `{ "type": "row" | "column", "index": number }`, using a zero-based index.
- `k`: the number of empty cells in `unit` before the inference.
- `missingCandidates`: the unit's missing values in `A` through `E` order.
- `placement`: `{ "row": number, "column": number, "value": string }`.
- `details`: the student-facing explanation generated from the other evidence fields.

Rule-specific fields are:

- `single-missing-cell`: no additional fields. `k` is `1`, `missingCandidates` contains the placed value, and `placement` identifies the unit's only empty cell.
- `unique-candidate-position`: `selectedCandidate` contains the candidate being placed. `eliminations` is an array in row-major cell order. Each entry is `{ "row": number, "column": number, "blockedBy": { "row": number, "column": number } }`; `blockedBy` identifies where `selectedCandidate` already occurs in the intersecting unit.
- `unique-candidate-for-cell`: `selectedCell` is `{ "row": number, "column": number }`. `eliminations` is an array in `A` through `E` value order. Each entry is `{ "value": string, "blockedBy": { "row": number, "column": number } }`; `blockedBy` identifies where that value already occurs in the intersecting unit.

The inference JSON does not duplicate `row`, `column`, or `value` at its top level; those values come from `placement`. Fields are emitted in the common-field order above, with rule-specific fields after `missingCandidates` and before `placement`. Arrays use the deterministic orders stated above.

Every recorded inference also includes a `details` string written for a student. The string uses one-based row and column numbers and is generated from the recorded evidence:

- Rule 1 states which row or column has one empty cell, which value is missing, and where that value is placed.
- Rule 2 states the selected unit and its missing values, where the selected value was eliminated, and why only the resulting position remains.
- Rule 3 states the selected cell and the unit's missing values, which values were eliminated by the intersecting unit, and why only the resulting value remains.

For example: `Row 4 is missing B and E. B cannot be in column 5 because column 5 already contains B, so row 4, column 3 is B.`

The scorer must not use the stored solution to decide whether an inference is available. The solution is used only to validate the inferred result.

## 5. Difficulty scoring

A search node is a partial grid. An edge is one valid inference that fills one additional cell. Its cost is:

```text
edge cost = rule weight + 2
```

Use cost-ordered search with a priority queue, not ordinary breadth-first search, because inference weights may differ.

Use Dijkstra's algorithm to find the single minimum-cost path from the published grid to a state in which the target has been inferred.

The source node has depth `0`. A node's depth is the number of inference edges from the source. Explore nodes whose depth is less than or equal to the configured maximum depth. A node at the maximum depth may satisfy the target condition but is not expanded.

A search state is one distinct partial grid admitted to the priority queue; the source counts as the first state. Reaching the configured state limit before a target-filled node is removed from the priority queue causes the candidate to be rejected as unrated. A target-filled node succeeds when it is removed as the current minimum-cost node, which proves that its path is minimum-cost.

For each expanded node, the implementation applies the rules one at a time. Rule order, enumeration within a rule, and priority-queue tie handling are implementation-dependent, but they must remain stable within a generator version. Changing any of them requires a new generator version.

```text
puzzle score = sum of edge costs on the minimum-cost path
```

The fixed `2` in each edge cost represents the effort of deriving and retaining another intermediate result. Internal states explored by the program do not affect difficulty.

Classify the puzzle using its score:

- `0–6`: Easy (`easy`)
- `7–12`: Medium / Exam Standard (`exam`)
- `13–18`: Hard (`hard`)
- `19` or greater: Extreme (`extreme`)

There are no additional minimum-inference or maximum-inference conditions for a difficulty level. If the target is not reached within either search limit, the puzzle is unrated and rejected.

## 6. Initial limits

- Search states per candidate: 10,000.
- Search depth per candidate: configurable.
- Given cells: 8–15.
- Step scalar: 2.
- Generation attempts: configurable.

The generator reports rejection counts for ambiguous, unrated, duplicate, and unwanted-difficulty candidates.

## 7. Duplicate handling

Version one prevents exact duplicates only.

Create the canonical puzzle identity by writing the 25 grid cells in row-major order, using `A` through `E` for givens and `-` for empty cells, followed by `:`, the zero-based target row, `,`, and the zero-based target column. For example, the suffix is `:3,2` for row 3, column 2.

Reject a candidate when its complete canonical identity has already been accepted. Hashes may be used as an index, but equality is decided using the complete identity so a hash collision cannot remove a distinct puzzle. Similarity scoring and symmetry-aware deduplication are postponed unless repetition becomes noticeable.

## 8. JSON output

### 8.1 Puzzle bank

The puzzle-bank output has this top-level structure:

```json
{
  "formatVersion": 1,
  "generatorVersion": 1,
  "settings": {
    "seed": 42,
    "counts": { "easy": 10, "exam": 10, "hard": 10, "extreme": 10 },
    "maximumAttempts": 100000,
    "maximumSearchStates": 10000,
    "maximumSearchDepth": 12,
    "minimumGivens": 8,
    "maximumGivens": 15
  },
  "puzzles": []
}
```

It contains no wall-clock timestamp. Each puzzle contains:

```json
{
  "id": "DMAT-G1-1DC79AA45352",
  "grid": [
    ["B", "", "E", "", ""],
    ["", "D", "", "", ""],
    ["", "", "C", "", ""],
    ["D", "A", "", "C", ""],
    ["", "", "", "", "B"]
  ],
  "target": { "row": 3, "column": 2, "value": "B" },
  "answer": "B",
  "solution": [
    ["B", "C", "E", "D", "A"],
    ["E", "D", "A", "B", "C"],
    ["A", "B", "C", "E", "D"],
    ["D", "A", "B", "C", "E"],
    ["C", "E", "D", "A", "B"]
  ],
  "difficulty": {
    "targetCell": "easy",
    "score": 4,
    "level": "easy",
    "rulesVersion": 1
  },
  "bestMethod": [
    {
      "rule": "unique-candidate-position",
      "weight": 2,
      "unit": { "type": "row", "index": 3 },
      "k": 2,
      "missingCandidates": ["B", "E"],
      "selectedCandidate": "B",
      "eliminations": [
        {
          "row": 3,
          "column": 4,
          "blockedBy": { "row": 4, "column": 4 }
        }
      ],
      "placement": { "row": 3, "column": 2, "value": "B" },
      "details": "Row 4 is missing B and E. B cannot be in column 5 because column 5 already contains B, so row 4, column 3 is B."
    }
  ],
  "hints": {
    "targetCell": [
      {
        "row": 3,
        "column": 2,
        "value": "B",
        "text": "Row 4 is missing B and E. B cannot be in column 5 because column 5 already contains B, so row 4, column 3 is B."
      }
    ]
  },
  "validation": { "solutionCount": 1, "givens": 8 }
}
```

Row and column indexes are zero-based.

The target-cell compatibility fields follow the trainer's existing data contract:

- `target.value` equals `answer`.
- `difficulty.targetCell` equals `difficulty.level`.
- The 7–12 medium band uses the existing trainer identifier `exam`.
- `hints.targetCell[0]` uses the `row`, `column`, and `value` from the first inference's `placement`, and its `text` contains that inference's `details` string.

Puzzle IDs are derived by calculating SHA-256 over the UTF-8 string `G<generatorVersion>|<canonicalIdentity>`, taking the first 12 hexadecimal characters in uppercase, and formatting the result as `DMAT-G<generatorVersion>-<digest>`. If two distinct canonical identities produce the same truncated ID, generation fails rather than emitting duplicate IDs. The actual complete solution is stored; no separate completed-square ID is needed.

### 8.2 Reduced-square catalogue

The separate catalogue JSON has this top-level structure:

```json
{
  "formatVersion": 1,
  "symbols": ["A", "B", "C", "D", "E"],
  "squares": []
}
```

The `squares` array contains exactly 56 entries. Each entry contains a stable sequential ID and one complete grid:

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

The program accepts these version-one flags:

- `--puzzles-out <path>`: required puzzle-bank output path.
- `--catalogue-out <path>`: required reduced-square catalogue output path.
- `--seed <uint64>`: required unsigned 64-bit random seed.
- `--count-easy <uint>`, `--count-exam <uint>`, `--count-hard <uint>`, and `--count-extreme <uint>`: required requested counts per level. At least one count must be positive.
- `--max-attempts <uint>`: required positive generation-attempt limit.
- `--max-search-states <uint>`: optional positive state limit; default `10000`.
- `--max-search-depth <uint>`: required positive search-depth limit.
- `--min-givens <uint>` and `--max-givens <uint>`: optional inclusive given-cell range; defaults `8` and `15`.

Invalid or conflicting values fail before generation with a non-zero exit status.

Version one uses SplitMix64 initialized directly from `--seed`. Each generated 64-bit value applies the standard SplitMix64 state increment `0x9E3779B97F4A7C15` and mixing constants `0xBF58476D1CE4E5B9` and `0x94D049BB133111EB`. Random selection from a range uses rejection sampling rather than a remainder operation that introduces modulo bias. Every randomized choice uses this single PRNG stream.

The same generator version, settings, and seed produce byte-identical JSON. JSON arrays use their specified deterministic order, object fields use the order shown in this specification, indentation is two spaces, and each file ends with one newline.

Generation is all-or-nothing. The generator must produce every requested difficulty count within `--max-attempts`. If it cannot, it exits non-zero and does not create or replace either output file. Both complete JSON documents are prepared and validated before temporary files in the destination directories are renamed over the requested paths. Progress and rejection statistics go to standard error; standard output is empty, and both output files contain valid JSON only on success.

## 10. Acceptance checks

Automated tests verify:

- Generated complete grids obey Latin-square rules.
- Zero-solution and multiple-solution grids are rejected.
- Every inference rule is sound.
- Rule 1 uses weight 1, and Rules 2 and 3 use weight `K`.
- Every search edge costs its rule weight plus 2.
- Scores at 6, 7, 12, 13, 18, and 19 receive the expected boundary classifications.
- Recorded `details` strings describe the evidence and resulting placement using one-based row and column numbers.
- Every `details` string can be regenerated exactly from the structured evidence in its inference record.
- A serialized `bestMethod` can be replayed from the published grid and reaches the target with the stored score.
- Stored answers match complete solutions.
- Identical settings and seed reproduce output.
- Depth and search-state boundaries follow the specified inclusion and rejection behavior.
- Exhausting generation attempts produces no partial output or replacement.
- Puzzle IDs follow the specified canonicalization and hashing procedure and are unique.
- Exact duplicate grid-and-target pairs are absent.
- The reduced-square catalogue contains exactly 56 distinct grids.
- Every catalogue grid is a valid complete Latin square with its first row and first column fixed to A–E.
- Catalogue order and IDs are deterministic.

Before producing the main bank, manually solve a small sample from every level. Any later change to rule weights or score boundaries requires a new rules version.

## 11. Out of scope

- Enumerating every incomplete Latin-square state.
- Browser-side puzzle generation.
- Academically precise cognitive modelling.
- Fine-grained measures such as candidate count or attention switching.
- Sophisticated similarity scoring or human-performance calibration.
