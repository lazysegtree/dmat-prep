# dMAT Puzzle Generation Specification

Status: Draft v1

Implementation language: Go

## 1. Goal

Build an offline command-line program that generates a static JSON bank of 5×5 dMAT Latin-square questions.

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

## 4. Inference rules

Use a small, explicit set of sound rules. Each rule proves one empty cell, has a manually assigned positive weight, and records the evidence used.

Initial rules:

- A cell has only one possible value.
- A missing value has only one possible position in a row.
- A missing value has only one possible position in a column.

More rules may be added later. Rule weights are configuration values and can be tuned by reviewing generated examples.

The scorer must not use the stored solution to decide whether an inference is available. The solution is used only to validate the inferred result.

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
    { "rule": "single-position-row", "row": 3, "column": 2, "value": "B", "weight": 2 }
  ],
  "validation": { "solutionCount": 1, "givens": 8 }
}
```

Row and column indexes are zero-based.

Puzzle IDs are derived from the canonical puzzle identity and generator version. The actual complete solution is stored; no separate completed-square ID is needed.

## 9. Command-line behavior

The program accepts at least:

- Output path.
- Random seed.
- Requested count or count per difficulty level.
- Maximum generation attempts.
- Search-state limit.

The same program version, settings, and seed produce the same output. Progress and rejection statistics go to standard error; the output file contains valid JSON only.

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

Before producing the main bank, manually solve a small sample from every level and adjust weights or boundaries if the classification is obviously wrong.

## 11. Out of scope

- Enumerating every incomplete Latin-square state.
- Browser-side puzzle generation.
- Academically precise cognitive modelling.
- Fine-grained measures such as candidate count or attention switching.
- Sophisticated similarity scoring or human-performance calibration.
