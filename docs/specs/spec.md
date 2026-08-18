# dMAT Latin Squares Trainer — Product and Interface Specification

Status: Draft v4

Target platform: Static GitHub Pages website

Implementation: Plain HTML, CSS, and JavaScript with an offline Go puzzle generator

## 1. Purpose

Help students solve the Latin-square questions used by dMAT accurately and within the examination pace of 20 questions in 25 minutes.

Every trainer question follows the dMAT-style target-cell format: one empty cell is marked with `?`, and the student answers only that cell. Other empty cells cannot be filled. Intermediate values needed to reach the target must be deduced and retained mentally.

The application supports this training loop:

1. Learn individual deductions and mental deduction chains.
2. Practise generated target-cell puzzles at a selected difficulty.
3. Improve speed without sacrificing accuracy.
4. Attempt a 20-question target-cell mock.
5. Review slow and incorrect answers with the efficient deduction path and complete solution.

This is a focused dMAT Latin-square trainer, not a general puzzle platform.

## 2. Latin-square and question rules

Every published puzzle uses the same fixed rules:

- A 5×5 grid.
- Symbols A, B, C, D, and E.
- Each symbol appears exactly once in every row.
- Each symbol appears exactly once in every column.
- No Sudoku regions or additional constraints.
- Exactly one non-given cell is the target and is displayed as `?`.
- Only the target accepts A–E input.
- Other non-given cells remain empty and read-only.
- Candidate notes, pencil marks, and intermediate-cell entry are unavailable.
- The starting grid has exactly one complete solution.

Users do not configure grid size, symbols, rules, question type, or session length.

## 3. Training modes

### 3.1 Learn

Purpose: develop solving technique without time pressure.

- One generated target-cell puzzle at a time.
- No visible timer.
- The user selects a training difficulty.
- `Show a hint` reveals the generator's first deduction and identifies its placement cell. The hint may expose an intermediate value rather than the target answer.
- The user submits with `Check answer`.
- Correctness is shown immediately.
- The submitted answer and complete solution open automatically for review.

### 3.2 Speed Drill

Purpose: develop consistent speed over 10 target-cell questions.

- The user selects a training difficulty.
- All 10 puzzles are selected before the drill begins.
- A timer counts upward.
- The target is 12 minutes 30 seconds: 75 seconds per question.
- No correctness feedback is shown during the drill.
- Users can move between questions.
- Results and solutions appear only after submission.

Results include:

- Correct, incorrect, and unanswered counts.
- Total time.
- Median time per question.
- Number of questions taking more than 75 seconds.
- The three slowest questions.
- Per-question answers and complete solutions.

### 3.3 Full dMAT Mock

Purpose: simulate the Latin-square portion of the examination.

- Exactly 20 target-cell questions.
- Exactly 25 minutes.
- The difficulty mixture is 3 Easy, 11 Exam Standard, and 6 Hard puzzles, shuffled after selection.
- All questions are selected before the mock begins.
- The timer counts down and remains visible.
- Users can move forward and backward between questions.
- A navigator distinguishes the current, answered, and unanswered questions.
- No hints, solutions, or correctness feedback are available during the mock.
- The mock submits automatically when time expires.
- Manual submission requires confirmation.
- Results appear only after submission.

Mock results include:

- Score out of 20.
- Correct, incorrect, and unanswered counts.
- Total time used and time remaining.
- Per-question time.
- Median time per question and number taking more than 75 seconds.
- The three slowest questions.
- The selected answer, target answer, efficient deduction path, and complete solution for every question.

The mock mixture and `Exam Standard` label are provisional training choices and must not be described as officially calibrated.

## 4. Training difficulty

The generator assigns target-cell difficulty from the minimum-cost supported deduction path to the target. The authoritative scoring algorithm and inference rules are defined in `docs/specs/puzzle-generation-spec.md`.

The application reads `puzzle.difficulty.targetCell` and provides four levels:

- **Easy:** score 0–6; intended for learning the rules and short deductions.
- **Exam Standard:** score 7–12; a provisional training level, not an official calibration.
- **Hard:** score 13–18; longer or more expensive deduction chains.
- **Extreme:** score 19 or greater; deliberate overtraining.

Difficulty is target-specific. The application does not calculate or display full-grid difficulty, and blank-cell count alone does not determine a level.

## 5. Generated puzzle bank

Version one uses the checked-in, offline-generated `website/data/latin-squares/puzzles.json` bank. The browser never generates puzzles.

The top-level document contains:

- `formatVersion`: JSON contract version. The application accepts version `1`.
- `generatorVersion`: generator behavior version.
- `settings`: the seed, requested counts, search limits, and givens range used for the run.
- `puzzles`: generated target-cell puzzle records.

Each puzzle record contains:

- `id`: stable content-derived puzzle ID.
- `grid`: starting 5×5 grid, using empty strings for blanks.
- `target`: zero-based `row`, zero-based `column`, and correct `value`.
- `answer`: the target answer, equal to `target.value`.
- `solution`: validated complete Latin square.
- `difficulty`: `targetCell`, numeric `score`, matching `level`, and `rulesVersion`.
- `bestMethod`: the scored deduction sequence that reaches the target.
- `hints.targetCell`: target-compatible hint records; version one emits the first `bestMethod` placement as one hint.
- `validation`: `solutionCount` and number of `givens`.

Before showing Home, the application rejects a bank when:

- `formatVersion` is unsupported;
- the puzzle array is missing or empty;
- a record lacks a supported target-cell difficulty, target, valid non-empty `bestMethod`, or at least one target-cell hint;
- any difficulty has fewer than 10 puzzles; or
- the bank cannot supply the configured mock mixture.

The checked-in version-one bank contains 48 puzzles: 12 each at Easy, Exam Standard, Hard, and Extreme. Every puzzle has exactly one solution and one generated target-cell hint.

The offline generator and verifier are the only supported way to replace this bank. Its full generation, reproducibility, validation, catalogue, CLI, and JSON requirements are defined in `docs/specs/puzzle-generation-spec.md`.

## 6. Progress tracking

Version one has no accounts, authentication, backend, or cloud synchronization.

Progress is stored only in the user's browser using local storage. Store at most the most recent 50 completed sessions and the values needed to display:

- Latest and best mock scores.
- Recent target-cell accuracy.
- Median target-cell solving time.
- Percentage of target-cell questions completed within 75 seconds.
- Recent sessions with date, mode, score, difficulty, and time.

Users can export progress and delete all locally stored data. The interface states that progress remains on the current browser and device.

Streaks are not a primary metric because readiness depends on accuracy and speed, not merely opening the application.

## 7. Screen and control specification

The screen copy may be tightened for small displays, but the controls and decisions below must remain available.

### 7.1 Global header

- `dMAT Latin Squares` brand button: returns to Home.
- Leaving an active Speed Drill or Full Mock through this button requires confirmation.

### 7.2 Home

Home presents exactly four primary actions:

- `Learn`
- `Speed Drill`
- `Full Mock`
- `Progress`

### 7.3 Learn and Speed Drill setup

- A notice explains that each generated puzzle asks for one `?` cell and intermediate deductions remain mental.
- `Training difficulty` selector: Easy, Exam Standard, Hard, or Extreme.
- `Start Learn` or `Start Speed Drill` button.
- `Back` button.
- No question-type selector.

### 7.4 Full Mock introduction

- Clearly states `20 Find the ? questions` and `25 minutes`.
- `Start Mock` button.
- `Back` button.
- No configuration controls.

### 7.5 Puzzle screen

- 5×5 grid.
- Only the target cell accepts input and displays `?` until answered.
- A–E answer buttons.
- `Clear` button.
- Keyboard A–E enters a value; Backspace or Delete clears it.
- Learn adds `Show a hint` and `Check answer`.
- Timed modes add the question navigator, `Previous`, `Next`, and `Submit Speed Drill` or `Submit Full dMAT Mock`.
- Every mode includes `Leave session`.

### 7.6 Results and review

- Summary metrics defined by the selected mode.
- One review row per question with status, puzzle ID, time, and `Review` button.
- Review shows the ordered `bestMethod` as `Efficient solution path`, including deduction count, difficulty, score, each inferred placement, its student-facing explanation, and a visibly identified target step.
- The path is described as the lowest-effort chain supported by the trainer's rules; it is not described as the fewest possible deductions.
- Review shows the submitted grid and complete solution side by side.
- The target cell remains visually identified.
- `New Learn`, `New Speed Drill`, or `Take another mock` button.
- `Home` button.

### 7.7 Progress

- Examination-readiness summary metrics.
- Recent target-cell session list.
- `Export progress` button.
- `Delete all progress` button with confirmation.
- `Home` button.

### 7.8 URLs and direct navigation

Browser-delivered files live under `website/`. The repository root is served or published directly, so public URLs include the `website` directory name.

- `/website/` or `/website/index.html`: trainer Home.
- `/website/latin-squares/learn/`: Learn setup.
- `/website/latin-squares/learn/?difficulty=hard`: Learn setup with the selected difficulty.
- `/website/latin-squares/learn/?puzzle=DMAT-G1-296A8A48AD3F`: immediately opens that exact untimed puzzle.
- `/website/latin-squares/speed-drill/?difficulty=hard`: Speed Drill setup with the selected difficulty.
- `/website/latin-squares/mock/`: Full Mock introduction.
- `/website/latin-squares/progress/`: locally stored Latin-square progress.

The supported `difficulty` values are `easy`, `exam`, `hard`, and `extreme`. An invalid difficulty is removed and falls back to `exam`. An unknown puzzle ID produces a visible error and never silently substitutes another puzzle. When both `puzzle` and `difficulty` are present, the exact puzzle takes precedence. Opening a Speed Drill or Full Mock URL never starts its timer; the user must explicitly start the session.

Starting a random Learn puzzle replaces the setup URL with its exact `puzzle` URL so it can be refreshed or shared. Random Drill and Mock selections are not encoded in the URL, and results remain transient session screens rather than shareable routes.

## 8. Interface principles

- Starting a mock requires no configuration.
- The grid works with mouse, touch, and keyboard input.
- Non-target cells cannot receive accidental input.
- Controls have accessible labels and visible keyboard focus.
- The interface is responsive on phones and desktop browsers.
- Visual effects never delay input or obscure remaining time.
- Refreshing or leaving an active drill or mock triggers a warning.
- Loading failures and incompatible generated-bank formats produce a visible error rather than a broken session.

## 9. Technical shape

The deployed application remains static and compatible with GitHub Pages. Everything delivered to the browser is contained under `website/`:

```text
website/
  index.html
  assets/styles.css
  js/app.js
  js/puzzle-ui.js
  js/session.js
  data/latin-squares/puzzles.json
  latin-squares/
    learn/index.html
    speed-drill/index.html
    mock/index.html
    progress/index.html
```

The development-only generator is a Go command and package:

```text
cmd/puzzle-generator/
internal/puzzlegen/
data/reduced-latin-squares.json
docs/specs/puzzle-generation-spec.md
```

- `website/` is the browser-delivered subtree and remains visible in public URLs.
- Each clean route is backed by a thin directory `index.html` and loads the same shared CSS and JavaScript.
- `app.js` loads and validates the generated bank, reads the entry page and query parameters, then controls navigation and application state.
- `puzzle-ui.js` renders the target-cell grid and handles input.
- `session.js` controls timers, target scoring, and progress storage.
- `website/data/latin-squares/puzzles.json` contains the validated generated puzzle bank and solutions.
- `cmd/puzzle-generator` generates or verifies the two JSON data files; it is not a runtime dependency.

Local development serves the repository root directly:

```text
python3 -m http.server 4173
```

No build step or custom deployment process is required. A static host can publish the repository root and serve the application from `/website/`.

No frontend framework, package manager, browser build process, database, or server is required for deployment.

## 10. Explicitly out of scope for version one

- Full-grid completion sessions.
- Filling intermediate cells during target-cell questions.
- Candidate notes or scratchpads.
- Browser-side puzzle generation.
- User accounts or profiles.
- Cloud synchronization.
- Public leaderboards.
- Multiplayer competition.
- User-created puzzles.
- Daily challenges.
- Social login or sharing.
- Detailed analytics dashboards.
- General Sudoku, Futoshiki, or other puzzle formats.
- General GRE preparation.

## 11. Version-one success criteria

The first release is successful when a student can:

- Learn direct deductions and longer mental deduction chains from generated evidence.
- Practise generated single-target puzzles without filling intermediate cells.
- Measure whether target questions are consistently solved within 75 seconds.
- Take a 20-question, 25-minute target-cell mock without early feedback.
- Review the target answer, efficient deduction path, and complete solution for every question.
- Return later on the same browser and see recent progress.
- Receive a clear load error if the deployed bank does not match the supported generated-data contract.

The product remains deliberately small: learn, drill, mock, review, and repeat.
