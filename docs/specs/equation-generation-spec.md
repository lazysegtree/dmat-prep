# dMAT Mathematical Equations — Generation and Difficulty Specification

Status: Version 3

## 1. Official task contract

The generated trainer follows the Mathematical Equations section in the 16 July 2026 General Academic preparatory materials:

- each question is a system of several equations;
- each letter has exactly one solution;
- every letter is an integer from 1 through 20;
- the task has 20 systems in 25 minutes; and
- no notes or helping tools are allowed.

The official material labels two examples each as low, medium, and high. It does not publish an item-generation algorithm, a numeric difficulty formula, or the real exam's difficulty distribution. The trainer's grammar, score, and mock mixture are independently designed training models, not official calibration.

## 2. Generation strategy

The browser never invents or mutates equations. `cmd/equation-generator` creates a deterministic checked-in bank offline.

For every candidate, the generator:

1. samples an equation family without regard to the requested difficulty;
2. chooses integer answers in a deliberately narrow mental-arithmetic range;
3. works backward from those answers to construct expressions and constants;
4. builds the displayed expression and standard-form coefficients from the same internal expression tree;
5. records a hint and a machine-readable mental solution path;
6. scores that path and accepts the candidate only if the resulting band is currently needed;
7. enumerates assignments in `1..20` and accepts the system only when exactly one assignment satisfies every equation;
8. derives a stable `DMAT-EQ-<digest>` ID from the equation coefficients, constants, and variable order; and
9. rejects duplicate systems.

The checked-in bank uses SplitMix64 seed `20260819` and contains 20 Low, 20 Medium, 20 High, and 20 Extreme questions.

## 3. Independent equation grammar

The grammar is broader than the six worked examples. It currently combines these reusable families:

- independent anchors;
- anchored dependency chains;
- affine dependency chains;
- sum-and-difference systems;
- substitution pairs;
- variables on both sides;
- shared-term cancellation;
- near-cancellation with an extra adjustment;
- scaled sums;
- three pairwise sums;
- cyclic differences;
- two-branch coupled systems; and
- cross-coupled pair sums with a weighted constraint.

Families vary their variable roles, equation order, coefficients, signs, and constants. They are not assigned difficulty labels. A simple instance of a family may be Low while an arithmetically awkward instance of the same family may be Medium or High.

The official exercises are used only as task constraints and human review anchors. The generator does not implement a one-to-one progression corresponding to those six exercises.

## 4. Mental-work difficulty score

Difficulty is calculated from the recorded solution path after a system is generated:

```text
(variable count - 1)
+ transformation count
+ substitution count
+ elimination count
+ peak working-memory load
+ signed-term cost
+ arithmetic load
```

Bands:

- `0..9`: Low
- `10..17`: Medium
- `18+`: High unless the Extreme gate below is also satisfied
- `26+` plus the Extreme structural gate: Extreme

Extreme is a trainer-only stretch tier, not an official label. A question qualifies only when its four two-letter equations form a connected four-variable cycle with at least one scaled term, and its recorded path has at least four transformations, peak working-memory load of at least three, two coupled solution branches, at least three substitutions or eliminations in total, and substantial signed-term handling or arithmetic load. The graph and coupled-branch requirements prevent a difficult-looking system with a small core and trivial dependent letters from becoming Extreme.

Each solution step declares its kind (`isolate`, `substitute`, `eliminate`, or `simplify`), the number of values or expressions held at once, signed-term handling, coupled-branch count, and the concrete arithmetic operations. This makes the factor calculation inspectable rather than inferring difficulty from a family name.

Arithmetic load deliberately recognizes mental anchors:

- multiplication by `0` or `1` is nearly free;
- factors `2`, `5`, `10`, `11`, and `20` are cheap anchors;
- one-digit multiplication has moderate cost;
- multiples of `5` remain cheaper than two awkward non-round factors; and
- addition or subtraction becomes more expensive when neither operand is small or round.

Consequently, round arithmetic such as `20 × 20` can score lower than `13 × 17`. This heuristic is transparent and deterministic, but it is still a model. It scores the generator's recorded path, not a proven minimum-cost path, and should eventually be refitted using response-time and error data from real users.

## 5. Bank contract and verification

`website/data/mathematical-equations/questions.json` contains:

- format and generator versions;
- seed and requested counts;
- stable question ID and grammar-family name;
- ordered variables;
- a display string plus standard-form coefficients and constant for every equation;
- the complete answer;
- a non-answer strategy hint;
- ordered solution steps with step kind, memory load, signed-term count, coupled-branch count, and arithmetic operations;
- difficulty score, band, and factor breakdown; and
- independent solution-count validation for the inclusive range `1..20`.

The Go verifier recomputes answer satisfaction, solution count, ID, difficulty metadata, versions, uniqueness, and requested counts. The browser separately validates the data shape, range, step metadata, score, band, and minimum bank supply before showing a question.

Generate and verify the published bank with:

```text
GOCACHE=/tmp/dmat-equation-go-cache GOENV=off go run ./cmd/equation-generator \
  --out website/data/mathematical-equations/questions.json \
  --seed 20260819 --count-low 20 --count-medium 20 --count-high 20 --count-extreme 20

GOCACHE=/tmp/dmat-equation-go-cache GOENV=off go run ./cmd/equation-generator \
  --verify --out website/data/mathematical-equations/questions.json
```

Generation writes to a temporary file and replaces the destination only after full verification.

## 6. Session behavior

- Learn: one untimed system at Low, Medium, High, or Extreme, with a strategy hint and immediate review.
- Speed Drill: 10 systems at one selected difficulty, including Extreme, target `12:30`, no mid-session feedback.
- Full Mock: 20 systems in `25:00`; training mix 6 Low, 8 Medium, and 6 High; automatic submission on expiry.
- Progress: equation-only accuracy, median time, within-75-second rate, and mock scores in local browser storage.

The interface supplies answer fields but no scratchpad, intermediate-work field, calculator, or notes area.
