# Progress summary

Run with Python 3.9 or newer; no packages need to be installed:

```sh
python3 tools/progress_summary.py ~/Downloads/dmat-progress-2026-09-21.json
python3 tools/progress_summary.py ~/Downloads/localhost.json ~/Downloads/github-pages.json
python3 tools/progress_summary.py ~/Downloads/dmat-progress-*.json
```

The script reads one or more version 1 single-trainer or version 2 combined JSON
exports and prints a combined summary. It does not modify the input files, create
a merged export, or change browser progress.

- Sessions are deduplicated by trainer and session ID. If records with the same
  ID differ, the first file's record wins and a warning is printed to stderr.
- All unique sessions are included, even when there are more than 50 per trainer.
- Each trainer's summary includes session and mode counts, UTC date range,
  accuracy, total training time, median question time, percentage within 75
  seconds, and latest/best mock scores. Best mock means most correct answers,
  matching the website; the actual question count is shown as the denominator.
- Latin Squares target-cell and full-grid results are reported separately.
  Figure Sequences exports report both complete-sequence and individual-frame
  accuracy.
- An empty export is valid. Missing files, invalid JSON, unsupported formats, or
  invalid session statistics produce an error and exit code 2, with no partial
  summary.

Run the script's tests from the repository root:

```sh
python3 -B -m unittest discover -s tests -p 'test_*.py'
```
