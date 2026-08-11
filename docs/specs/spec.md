# dMAT Latin Squares Trainer — Product Specification

Status: Draft v1  
Target platform: Static GitHub Pages website  
Implementation: Plain HTML, CSS, and JavaScript

## 1. Purpose

Help students progress from being able to solve a 5×5 Latin square eventually to solving 20 questions accurately within the dMAT time limit of 25 minutes.

The application must support a complete training loop:

1. Learn how to make deductions.
2. Practise repeatedly.
3. Improve speed without sacrificing accuracy.
4. Attempt a realistic mock.
5. Review slow and incorrect answers.

This is a focused dMAT Latin-square trainer, not a general puzzle platform or general GRE-preparation website.

## 2. Puzzle format

Every puzzle uses the same fixed format:

- A 5×5 grid.
- Symbols A, B, C, D, and E.
- Each symbol appears exactly once in every row.
- Each symbol appears exactly once in every column.
- No Sudoku regions or additional constraints.
- Every published puzzle has exactly one solution.
- Candidate notes or pencil marks are not available.

The fixed format is intentional. Users do not configure grid size, symbols, rules, or question count.

## 3. Training modes

### 3.1 Learn

Purpose: Develop solving technique without time pressure.

- One puzzle at a time.
- No visible timer.
- The user selects a training difficulty.
- Optional hints are available.
- The user submits the puzzle when ready.
- Correctness and incorrect cells are shown immediately after submission.
- The user can inspect the completed solution.
- Where supported by the puzzle data, the application explains a useful deduction rather than showing only the answer.

### 3.2 Speed Drill

Purpose: Develop consistent speed over multiple questions.

- A fixed set of 10 puzzles.
- The user selects a training difficulty.
- A timer counts upward.
- The target completion time is 12 minutes 30 seconds.
- No correctness feedback is shown during the drill.
- Users can move between questions.
- Results and solutions are shown only after submission.

The results include:

- Correct, incorrect, and unanswered counts.
- Total time.
- Median time per question.
- Number of questions taking more than 75 seconds.
- The three slowest questions.
- Per-question answers and solutions.

### 3.3 Full dMAT Mock

Purpose: Simulate the Latin-square portion of the examination.

- Exactly 20 questions.
- Exactly 25 minutes.
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
- Answers and complete solutions for every question.

Mock difficulty is controlled internally and is not configurable. Its question mixture should eventually be calibrated against official dMAT examples.

## 4. Training difficulty

Practice modes provide four levels:

- **Easy:** Frequent immediately forced placements; intended for learning the rules.
- **Exam Standard:** Intended to approximate the official examination level after calibration.
- **Hard:** Fewer obvious placements and longer chains of deductions.
- **Extreme:** Deliberate overtraining above expected examination difficulty.

Difficulty must not be determined only by the number of blank cells. It should consider the deductions or search effort required to solve the puzzle.

The application must not imply that a level is officially calibrated until it has been compared with sufficient official examples.

## 5. Puzzle source and validation

Version one uses a static, pre-generated puzzle bank rather than generating puzzles in the user's browser.

Each puzzle record contains:

- Stable puzzle ID.
- Starting grid.
- Complete solution.
- Training difficulty.
- Validation metadata.
- Optional deduction or hint steps.

Before inclusion, every puzzle must be checked by a solver that counts solutions and rejects any puzzle with zero or multiple solutions.

A stable puzzle ID makes reported problems reproducible. Consistent symbol, row, and column transformations may be used to create additional equivalent variants from validated puzzles.

Runtime puzzle generation is postponed until generation, uniqueness checking, and human-oriented difficulty rating are demonstrably reliable.

## 6. Progress tracking

Version one has no accounts, authentication, backend, or cloud synchronization.

Progress is stored only in the user's browser using local storage. Store at most the most recent 50 completed sessions and the summary values needed to display:

- Latest and best mock scores.
- Recent-question accuracy.
- Median solving time.
- Percentage of questions completed within 75 seconds.
- Recent sessions with date, mode, score, and time.

Users must be able to export their progress and delete all locally stored data. The interface must state that progress remains on the current browser and device.

Streaks are not a primary metric because examination readiness depends on accuracy and speed, not merely opening the application.

## 7. Interface principles

- The home screen presents only Learn, Speed Drill, Full Mock, and Progress.
- Starting a mock requires no configuration.
- The grid must work with mouse, touch, and keyboard input.
- Selecting A–E enters a value; Backspace or Delete clears an editable cell.
- Given cells are visually distinct and cannot be edited.
- The active cell, its row, and its column remain identifiable.
- The interface must be responsive on phones and desktop browsers.
- Visual effects must never delay input or obscure the remaining time.
- Refreshing or leaving an active drill or mock should trigger a warning.

## 8. Technical shape

The deployed application remains static and compatible with GitHub Pages.

Suggested structure:

```text
index.html
styles.css
js/app.js
js/puzzle-ui.js
js/session.js
data/puzzles.json
```

- `app.js` controls navigation and application state.
- `puzzle-ui.js` renders the grid and handles input.
- `session.js` controls timers, question navigation, scoring, and progress storage.
- `puzzles.json` contains the validated puzzle bank and solutions.

No frontend framework, package manager, build process, database, or server is required for the deployed application.

Developer-only scripts may be added later to generate and validate the static puzzle bank. They must not become runtime dependencies.

## 9. Explicitly out of scope for version one

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

## 10. Release order

1. Establish the puzzle data format and validate a small puzzle bank.
2. Build the accessible 5×5 puzzle interface.
3. Add Learn mode and review.
4. Add Speed Drill and session results.
5. Add the complete mock workflow.
6. Add browser-only progress tracking.
7. Test keyboard, touch, timing, refresh, and mobile behaviour.
8. Publish through GitHub Pages.

## 11. Version-one success criteria

The first release is successful when a student can:

- Learn the rules and request useful assistance.
- Complete repeated practice without unnecessary configuration.
- Measure whether they consistently solve questions within 75 seconds.
- Take a faithful 20-question, 25-minute mock without receiving early feedback.
- Review exactly where time and accuracy were lost.
- Return later on the same browser and see recent progress.

The product remains deliberately small: learn, drill, mock, review, and repeat.
