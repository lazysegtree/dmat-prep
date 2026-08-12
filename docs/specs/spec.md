# dMAT Latin Squares Trainer — Product and Interface Specification

Status: Draft v2

Target platform: Static GitHub Pages website

Implementation: Plain HTML, CSS, and JavaScript

## 1. Purpose

Help students solve the Latin-square questions used by dMAT accurately and within the examination pace of 20 questions in 25 minutes.

In the dMAT format, the student is not asked to complete the grid. One empty cell is marked with `?`, and the student answers only that cell. Other empty cells cannot be filled in. Any intermediate values needed to reach the target must therefore be deduced and retained mentally. Longer chains of such deductions are a central source of difficulty.

Completing an entire Latin square remains useful foundational practice, so the trainer supports it as a separate practice variety. It must never be confused with the examination format.

The application supports this training loop:

1. Learn individual deductions and mental deduction chains.
2. Practise either the real target-cell format or full-grid completion.
3. Improve target-cell speed without sacrificing accuracy.
4. Attempt a realistic target-cell mock.
5. Review slow and incorrect answers with the complete solution.

This is a focused dMAT Latin-square trainer, not a general puzzle platform or general GRE-preparation website.

## 2. Latin-square rules

Every puzzle uses the same fixed rules:

- A 5×5 grid.
- Symbols A, B, C, D, and E.
- Each symbol appears exactly once in every row.
- Each symbol appears exactly once in every column.
- No Sudoku regions or additional constraints.
- Every published starting grid has exactly one complete solution.
- Candidate notes or pencil marks are not available.

Users do not configure grid size, symbols, rules, or session length.

## 3. Question types

### 3.1 Find the `?`

This is the examination-style question type and the default in practice modes.

- Exactly one non-given cell is designated as the target and displayed as `?`.
- The user can enter A–E only in the target cell.
- All other empty cells remain visible but cannot be filled.
- The target can require deductions about several other cells before its value is known.
- Difficulty is based on the work required to determine the target, including intermediate deductions and search effort, not merely the total number of empty cells.

### 3.2 Complete the grid

This is supplementary foundational practice, not the dMAT examination format.

- Every non-given cell is editable.
- The user completes the entire 5×5 Latin square.
- Difficulty is based on the work required to complete the grid, not merely the number of empty cells.

## 4. Training modes

### 4.1 Learn

Purpose: develop solving technique without time pressure.

- One puzzle at a time.
- No visible timer.
- The user selects `Find the ?` or `Complete the grid`.
- The user selects a training difficulty.
- An optional hint is available.
- In target-cell practice, a hint may expose a useful intermediate deduction rather than the target answer itself.
- The user submits when ready.
- Correctness is shown immediately after submission.
- The submitted answer and complete solution open automatically for review.

### 4.2 Speed Drill

Purpose: develop consistent speed over 10 questions.

- The user selects `Find the ?` or `Complete the grid`.
- The user selects a training difficulty.
- All 10 puzzles are selected before the drill begins.
- A timer counts upward.
- The target for `Find the ?` is 12 minutes 30 seconds: 75 seconds per question.
- `Complete the grid` has no claimed examination-time target because it is supplementary practice.
- No correctness feedback is shown during the drill.
- Users can move between questions.
- Results and solutions are shown only after submission.

Results include:

- Correct, incorrect, and unanswered counts.
- Total time.
- Median time per question.
- For `Find the ?`, the number of questions taking more than 75 seconds.
- The three slowest questions.
- Per-question answers and complete solutions.

### 4.3 Full dMAT Mock

Purpose: simulate the Latin-square portion of the examination.

- Exactly 20 `Find the ?` questions.
- Exactly 25 minutes.
- The question type and difficulty are controlled internally and cannot be configured.
- All questions are selected before the mock begins.
- The timer counts down and remains visible.
- Users can move forward and backward between questions.
- A navigator distinguishes the current, answered, and unanswered questions.
- No hints, solutions, or correctness feedback are available during the mock.
- The mock submits automatically when time expires.
- Manual submission requires confirmation.
- Results are shown only after submission.

Mock results include:

- Score out of 20.
- Correct, incorrect, and unanswered counts.
- Total time used and time remaining.
- Per-question time.
- The selected answer, target answer, and complete solution for every question.

The mock mixture must not be described as officially calibrated until sufficient official dMAT examples have been analysed.

## 5. Training difficulty

Practice modes provide four levels:

- **Easy:** frequent immediately forced placements; intended for learning the rules.
- **Exam Standard:** intended to approximate official examination difficulty after calibration.
- **Hard:** fewer obvious placements and longer deduction chains.
- **Extreme:** deliberate overtraining above expected examination difficulty.

Each puzzle has separate difficulty metadata for `Find the ?` and `Complete the grid`, because a target cell can be easy to determine even when completing the remaining grid is difficult, or vice versa.

Difficulty considers solver deductions or search effort. It is not determined only by blank-cell count. The current `Exam Standard` label is provisional.

## 6. Puzzle source and validation

Version one uses a static, pre-generated puzzle bank rather than generating puzzles in the browser.

Each puzzle record contains:

- Stable puzzle ID.
- Starting grid.
- Complete solution.
- Target-cell row and column.
- Separate target-cell and full-grid difficulty labels and scores.
- Validation metadata.
- Optional deduction or hint steps.

Before inclusion, every starting grid is checked by a solver that counts solutions and rejects grids with zero or multiple solutions. The target must be an empty cell in the starting grid, and its expected answer must match the validated complete solution.

A stable puzzle ID makes reported problems reproducible. Consistent symbol, row, and column transformations may create equivalent variants from validated puzzles.

Runtime generation remains out of scope until generation, uniqueness checking, target-specific difficulty, and human-oriented difficulty rating are demonstrably reliable.

## 7. Progress tracking

Version one has no accounts, authentication, backend, or cloud synchronization.

Progress is stored only in the user's browser using local storage. Store at most the most recent 50 completed sessions and the values needed to display:

- Latest and best mock scores.
- Recent `Find the ?` accuracy.
- Median `Find the ?` solving time.
- Percentage of `Find the ?` questions completed within 75 seconds.
- Recent sessions with date, mode, question type, score, and time.

Full-grid sessions appear in recent sessions but are excluded from the examination-readiness timing aggregates.

Users can export progress and delete all locally stored data. The interface states that progress remains on the current browser and device.

Streaks are not a primary metric because readiness depends on accuracy and speed, not merely opening the application.

## 8. Screen and control specification

The screen copy may be tightened for small displays, but the controls and decisions below must remain available.

### 8.1 Global header

- `dMAT Latin Squares` brand button: returns to Home.
- Leaving an active Speed Drill or Full Mock through this button requires confirmation.

### 8.2 Home

Home presents exactly four primary actions:

- `Learn`
- `Speed Drill`
- `Full Mock`
- `Progress`

Question-type choices do not appear on Home.

### 8.3 Learn and Speed Drill setup

- `Question type` selector:
  - `Find the ? — exam-style mental solving` (default)
  - `Complete the grid — foundational practice`
- `Training difficulty` selector: Easy, Exam Standard, Hard, or Extreme.
- `Start Learn` or `Start Speed Drill` button.
- `Back` button.

### 8.4 Full Mock introduction

- Clearly states `20 Find the ? questions` and `25 minutes`.
- `Start Mock` button.
- `Back` button.
- No configuration controls.

### 8.5 Puzzle screen

- 5×5 grid.
- A–E answer buttons.
- `Clear` button.
- Keyboard A–E enters a value; Backspace or Delete clears it.
- In `Find the ?`, only the target cell accepts input and displays `?` until answered.
- In `Complete the grid`, all non-given cells accept input; the active cell, row, and column remain identifiable.
- Learn adds `Show a hint` and `Check answer` or `Check puzzle`.
- Timed modes add the question navigator, `Previous`, `Next`, and `Submit Speed Drill` or `Submit Full dMAT Mock`.
- Every mode includes `Leave session`.

### 8.6 Results and review

- Summary metrics defined by the selected mode and question type.
- One review row per question with status, puzzle ID, time, and `Review` button.
- Review shows the submitted grid and complete solution side by side.
- The target cell remains visually identified in target-cell review.
- `New Learn`, `New Speed Drill`, or `Take another mock` button.
- `Home` button.

### 8.7 Progress

- Examination-readiness summary metrics.
- Recent session list with question type.
- `Export progress` button.
- `Delete all progress` button with confirmation.
- `Home` button.

## 9. Interface principles

- Starting a mock requires no configuration.
- The grid works with mouse, touch, and keyboard input.
- Non-editable cells cannot receive accidental input.
- Controls have accessible labels and visible keyboard focus.
- The interface is responsive on phones and desktop browsers.
- Visual effects never delay input or obscure remaining time.
- Refreshing or leaving an active drill or mock triggers a warning.
- The interface explicitly distinguishes supplementary full-grid practice from the dMAT format.

## 10. Technical shape

The deployed application remains static and compatible with GitHub Pages:

```text
index.html
styles.css
js/app.js
js/puzzle-ui.js
js/session.js
data/puzzles.json
tools/generate-puzzles.mjs
```

- `app.js` controls navigation and application state.
- `puzzle-ui.js` renders the two grid interaction types and handles input.
- `session.js` controls timers, scoring, and progress storage.
- `puzzles.json` contains the validated puzzle bank and solutions.
- `generate-puzzles.mjs` is a developer-only generator and validator; it is not a runtime dependency.

No frontend framework, package manager, build process, database, or server is required for deployment.

## 11. Explicitly out of scope for version one

- Filling intermediate cells during `Find the ?` questions.
- Candidate notes or scratchpads.
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

## 12. Version-one success criteria

The first release is successful when a student can:

- Learn rules, direct deductions, and longer mental deduction chains.
- Practise the real single-target format without filling intermediate cells.
- Optionally practise completing full grids without mistaking it for the exam format.
- Measure whether target questions are consistently solved within 75 seconds.
- Take a faithful 20-question, 25-minute target-cell mock without early feedback.
- Review the target answer and complete solution for every question.
- Return later on the same browser and see recent progress.

The product remains deliberately small: learn, drill, mock, review, and repeat.
