# Small UI test PoC

The test suite covers:

- `unit/session.test.js` checks four calculation and scoring examples with Node's built-in test runner.
- `unit/data-transfer.test.js` checks backup round trips, merge conflicts, limits, legacy files, validation, and storage rollback.
- `ui/data-transfer.spec.js` checks downloads, imports, replacement confirmation, error feedback, and progress refresh.
- `ui/basic-flow.spec.js` checks the home page and one short Learn interaction in Chromium.

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
