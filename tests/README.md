# Small UI test PoC

The test suite covers:

- `unit/session.test.js` checks four calculation and scoring examples with Node's built-in test runner.
- `unit/data-transfer.test.js` checks backup round trips, merge conflicts, limits, legacy files, validation, and storage rollback.
- `ui/data-transfer.spec.js` checks downloads, imports, replacement confirmation, error feedback, and progress refresh.
- `ui/basic-flow.spec.js` checks the home page and one short Learn interaction in Chromium.
- `ui/exam-interface.spec.js` checks physical and virtual equation input, answer retention, exam controls, submission, and mobile navigation across all three task types. It saves screenshots under `/tmp/dmat-exam-*.png`.

## Run

One-time setup:

```sh
npm install
npx playwright install chromium
```

Then run everything:

```sh
npm test
```

Use `npm run test:unit` or `npm run test:ui` to isolate a failure. The UI command starts and stops the local Python static server automatically. On a UI failure, Playwright prints the failed user action and saves a trace under `test-results/`.

## Figure Sequences

`tests/unit/figure-sequence.test.js` covers paired scoring and browser-bank validation.
`tests/ui/figure-sequences.spec.js` covers Learn, mobile layout, saved review,
backup restoration, drill navigation, mock expiry, redirects, and load/save errors.
Data-transfer tests also cover version 3 figure backups, older-backup preservation,
and rollback on a third-trainer storage failure. Run these with `npm test`.

The figure browser tests save mobile and results screenshots under `/tmp/`.
Go tests under `internal/figureseq` cover deterministic generation, ambiguous
continuations, and malformed programs/observations. Run `go test ./...`,
`go vet ./...`, and the verification command in
`docs/specs/figure-sequence-poc.md`.

Mock mix browser tests cover all four levels in Latin Squares, Mathematical Equations, and Figure Sequences, including exact counts without repeats, persistence, backup validation, repeat selection, and timeout.

Latin Squares drill tests (`unit/latin-drill.test.js` and `ui/latin-drill.spec.js`) cover 5/10-question selection, all nine fixed/mixed distributions, proportional rounding and random tie-breaking, unique puzzles, hidden difficulty during play, custom countdown expiry, stopwatch timing, explicit answer saving, URL normalization, backup restoration, repeat settings, legacy results, and mobile setup layout. Setup screenshots are saved under `/tmp/dmat-latin-drill-setup-*.png`.
