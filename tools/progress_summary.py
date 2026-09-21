#!/usr/bin/env python3
"""Print combined statistics from dMAT JSON exports without changing any files."""

import argparse
from collections import Counter
from datetime import datetime
import json
import math
from pathlib import Path
import re
from statistics import median
import sys


TASKS = {
    "latin-squares": "Latin Squares",
    "mathematical-equations": "Mathematical Equations",
    "figure-sequences": "Figure Sequences",
}


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value
    ):
        raise ValueError("date must be a UTC ISO timestamp")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def nonnegative(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def validate_session(session, task):
    if not isinstance(session, dict):
        raise ValueError("session must be an object")
    if not isinstance(session.get("id"), str) or not session["id"].strip():
        raise ValueError("session ID must be a nonempty string")
    timestamp(session.get("date"))
    if session.get("mode") not in ("learn", "drill", "mock"):
        raise ValueError("unknown session mode")
    if session.get("task", task) != task:
        raise ValueError("session task does not match its trainer")
    if task == "latin-squares" and session.get("questionType", "full") not in ("target", "full"):
        raise ValueError("unknown Latin Squares question type")
    count, correct = session.get("questionCount"), session.get("correct")
    if type(count) is not int or count < 1:
        raise ValueError("questionCount must be a positive integer")
    if type(correct) is not int or not 0 <= correct <= count:
        raise ValueError("correct must be an integer between zero and questionCount")
    times = session.get("questionTimes")
    if not nonnegative(session.get("totalTime")):
        raise ValueError("totalTime must be a finite nonnegative number")
    if not isinstance(times, list) or len(times) != count or not all(map(nonnegative, times)):
        raise ValueError("questionTimes must contain one finite nonnegative time per question")
    if task == "figure-sequences":
        frames = session.get("frameCorrect")
        if type(frames) is not int or not 0 <= frames <= 2 * count:
            raise ValueError("frameCorrect must be between zero and twice questionCount")


def parse_backup(data):
    if not isinstance(data, dict) or type(data.get("version")) is not int:
        raise ValueError("expected a versioned dMAT export object")
    if data["version"] == 1:
        task = data.get("task", "latin-squares")
        if not isinstance(task, str) or task not in TASKS:
            raise ValueError("unsupported trainer")
        progress = {task: data.get("sessions")}
    elif data["version"] == 2 and data.get("format") == "dmat-progress":
        progress = data.get("progress")
        if not isinstance(progress, dict) or not progress:
            raise ValueError("missing trainer session lists")
    else:
        raise ValueError("unsupported export format or version")
    for task, sessions in progress.items():
        if task not in TASKS:
            raise ValueError(f"unsupported trainer: {task}")
        if not isinstance(sessions, list):
            raise ValueError(f"{task}: sessions must be a list")
        for index, session in enumerate(sessions, 1):
            try:
                validate_session(session, task)
            except (ValueError, OverflowError) as error:
                raise ValueError(f"{task}, session {index}: {error}") from error
    return progress


def combine_files(paths):
    """Deduplicate by (trainer, session ID), preserving the first occurrence."""
    combined, sources, warnings = {}, {}, []
    duplicates = 0
    for path in paths:
        try:
            progress = parse_backup(json.loads(Path(path).read_text(encoding="utf-8-sig")))
        except (OSError, ValueError, OverflowError) as error:
            raise ValueError(f"{path}: {error}") from error
        for task, sessions in progress.items():
            records = combined.setdefault(task, {})
            for session in sessions:
                identity = (task, session["id"])
                if session["id"] in records:
                    duplicates += 1
                    if records[session["id"]] != session:
                        warnings.append(
                            f"Conflicting {task} session {session['id']!r}: "
                            f"keeping {sources[identity]}, ignoring {path}."
                        )
                else:
                    records[session["id"]] = session
                    sources[identity] = path
    return {task: list(records.values()) for task, records in combined.items()}, duplicates, warnings


def duration(seconds):
    minutes, seconds = divmod(math.floor(seconds + 0.5), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes}:{seconds:02d}"


def summary_lines(title, sessions, frames=False):
    lines = [title]
    if not sessions:
        return lines + ["  No completed sessions."]
    ordered = sorted(sessions, key=lambda item: timestamp(item["date"]), reverse=True)
    modes = Counter(item["mode"] for item in ordered)
    count = sum(item["questionCount"] for item in ordered)
    correct = sum(item["correct"] for item in ordered)
    times = [time for item in ordered for time in item["questionTimes"]]
    mocks = [item for item in ordered if item["mode"] == "mock"]
    lines += [
        f"  Sessions: {len(ordered)} (Learn: {modes['learn']}, Drill: {modes['drill']}, Mock: {modes['mock']})",
        f"  Dates (UTC): {ordered[-1]['date']} to {ordered[0]['date']}",
        f"  {'Complete sequences' if frames else 'Correct answers'}: {correct}/{count} ({correct / count:.1%})",
        f"  Total training time: {duration(sum(item['totalTime'] for item in ordered))}",
        f"  Median question time: {duration(median(times))}",
        f"  Within 75 seconds: {sum(time <= 75 for time in times) / len(times):.1%}",
    ]
    if frames:
        frame_correct = sum(item["frameCorrect"] for item in ordered)
        lines.append(f"  Correct frames: {frame_correct}/{2 * count} ({frame_correct / (2 * count):.1%})")
    if mocks:
        latest = mocks[0]
        best = max(mocks, key=lambda item: item["correct"])
        lines += [
            f"  Latest mock: {latest['correct']}/{latest['questionCount']} ({latest['date']})",
            f"  Best mock (correct answers): {best['correct']}/{best['questionCount']} ({best['date']})",
        ]
    else:
        lines.append("  Latest / best mock: none")
    return lines


def render_summary(progress, file_count, duplicates):
    lines = [
        "Combined dMAT progress",
        f"Files: {file_count}",
        f"Unique sessions: {sum(len(sessions) for sessions in progress.values())}",
        f"Duplicate records skipped: {duplicates}",
        "All unique sessions included; no 50-session limit.",
    ]
    for task, title in TASKS.items():
        if task not in progress:
            continue
        sessions = progress[task]
        if task == "latin-squares" and sessions:
            # Full-grid practice has different timing/scoring from target-cell practice.
            for question_type, label in (("target", "Find the ?"), ("full", "Complete the grid")):
                selected = [item for item in sessions if item.get("questionType", "full") == question_type]
                if selected:
                    lines += [""] + summary_lines(f"{title} — {label}", selected)
        else:
            lines += [""] + summary_lines(title, sessions, frames=task == "figure-sequences")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog="Supports v1 single-trainer and v2 combined exports. Duplicate IDs within a trainer count once; first file wins conflicts. No session limit is applied.",
    )
    parser.add_argument("files", nargs="+", type=Path, help="one or more exported JSON progress files")
    args = parser.parse_args(argv)
    try:
        progress, duplicates, warnings = combine_files(args.files)
    except ValueError as error:
        parser.exit(2, f"error: {error}\n")
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    print(render_summary(progress, len(args.files), duplicates))
    return 0


if __name__ == "__main__":
    sys.exit(main())
