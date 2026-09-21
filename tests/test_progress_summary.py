"""Run with python3 -B -m unittest discover -s tests -p 'test_*.py'."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tools.progress_summary import combine_files, parse_backup, render_summary


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "progress_summary.py"


def session(identity="one"):
    return dict(id=identity, date="2026-09-21T09:00:00.000Z", mode="learn",
                questionType="target", questionCount=1, correct=1,
                totalTime=30, questionTimes=[30])


def legacy(sessions, task="latin-squares"):
    return {"version": 1, "task": task, "sessions": sessions}


class ProgressSummaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def write(self, name, data):
        path = Path(self.temp.name) / name
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def run_script(self, *paths):
        return subprocess.run([sys.executable, "-B", str(SCRIPT), *map(str, paths)],
                              capture_output=True, text=True)

    def test_mixed_exports_deduplicate_per_trainer_without_modifying_files(self):
        a = self.write("legacy.json", {"version": 1, "sessions": [session()]})
        b = self.write("combined.json", {"version": 2, "format": "dmat-progress", "progress": {
            "latin-squares": [session(), session("two")],
            "mathematical-equations": [session()],
        }})
        before = [path.read_bytes() for path in (a, b)]
        result = self.run_script(a, b)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Unique sessions: 3", result.stdout)
        self.assertIn("Duplicate records skipped: 1", result.stdout)
        self.assertIn("Mathematical Equations", result.stdout)
        self.assertEqual(before, [path.read_bytes() for path in (a, b)])

    def test_conflicts_keep_first_file_and_warn(self):
        a = self.write("a.json", legacy([session()]))
        different = {**session(), "correct": 0}
        b = self.write("b.json", legacy([different]))
        result = self.run_script(a, b)
        self.assertEqual(result.returncode, 0)
        self.assertIn("Correct answers: 1/1", result.stdout)
        self.assertIn("Conflicting latin-squares session", result.stderr)
        self.assertIn(f"keeping {a}", result.stderr)

    def test_no_fifty_session_cap(self):
        path = self.write("many.json", legacy([session(str(i)) for i in range(75)]))
        progress, duplicates, warnings = combine_files([path, path])
        self.assertEqual(len(progress["latin-squares"]), 75)
        self.assertEqual(duplicates, 75)
        self.assertEqual(warnings, [])

    def test_weighted_accuracy_chronological_mock_and_separate_full_grid(self):
        old = {**session("old"), "mode": "mock", "date": "2026-09-20T09:00:00Z",
               "questionCount": 3, "correct": 2, "questionTimes": [60, 90, 120], "totalTime": 270}
        recent = {**session("new"), "mode": "mock", "correct": 0}
        full = {**session("full"), "questionType": "full"}
        output = render_summary({"latin-squares": [old, full, recent]}, 1, 0)
        self.assertIn("Correct answers: 2/4 (50.0%)", output)
        self.assertIn("Median question time: 1:15", output)
        self.assertIn("Within 75 seconds: 50.0%", output)
        self.assertIn("Latest mock: 0/1", output)
        self.assertIn("Best mock (correct answers): 2/3", output)
        self.assertIn("Latin Squares — Complete the grid", output)

    def test_empty_and_figure_exports(self):
        path = self.write("empty.json", legacy([]))
        result = self.run_script(path)
        self.assertEqual(result.returncode, 0)
        self.assertIn("No completed sessions.", result.stdout)
        figures = parse_backup(legacy([{**session(), "frameCorrect": 1, "correct": 0}], "figure-sequences"))
        self.assertIn("Correct frames: 1/2 (50.0%)", render_summary(figures, 1, 0))

    def test_invalid_input_stops_without_a_partial_summary(self):
        good = self.write("good.json", legacy([session()]))
        for invalid in ({}, {"version": 99}, legacy([{}]), legacy([], "unknown"),
                        legacy([{**session(), "correct": True}]),
                        legacy([{**session(), "questionTimes": [-1]}]),
                        legacy([{**session(), "totalTime": float("nan")}]),
                        legacy([{**session(), "date": "2026-02-30T09:00:00Z"}])):
            bad = self.write("bad.json", invalid)
            result = self.run_script(good, bad)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertIn(str(bad), result.stderr)
        bad.write_text("{broken", encoding="utf-8")
        self.assertEqual(self.run_script(bad).returncode, 2)
        self.assertEqual(self.run_script(Path(self.temp.name) / "missing.json").returncode, 2)
        self.assertEqual(self.run_script().returncode, 2)


if __name__ == "__main__":
    unittest.main()
