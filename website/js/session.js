export const SYMBOLS = ['A', 'B', 'C', 'D', 'E'];
export const TARGET_SECONDS = 75;
const STORAGE_KEY = 'dmat-latin-progress-v1';

export function emptyAnswer(puzzle) {
  return puzzle.grid.map((row) => [...row]);
}

export function editableComplete(puzzle, answer, questionType = 'target') {
  if (questionType === 'target') {
    return Boolean(answer[puzzle.target.row][puzzle.target.column]);
  }
  return puzzle.grid.every((row, rowIndex) =>
    row.every((given, columnIndex) => given || Boolean(answer[rowIndex][columnIndex])),
  );
}

export function answerStatus(puzzle, answer, questionType = 'target') {
  if (!editableComplete(puzzle, answer, questionType)) return 'unanswered';
  if (questionType === 'target') {
    return answer[puzzle.target.row][puzzle.target.column] === puzzle.target.value
      ? 'correct'
      : 'incorrect';
  }
  const correct = puzzle.solution.every((row, rowIndex) =>
    row.every((value, columnIndex) => answer[rowIndex][columnIndex] === value),
  );
  return correct ? 'correct' : 'incorrect';
}

export function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class SessionClock {
  constructor({ duration = null, onTick, onExpire }) {
    this.duration = duration;
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.startedAt = Date.now();
    this.interval = window.setInterval(() => this.tick(), 250);
    this.tick();
  }

  elapsed() {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  tick() {
    const elapsed = this.elapsed();
    const display = this.duration === null ? elapsed : Math.max(0, this.duration - elapsed);
    this.onTick?.(display, elapsed);
    if (this.duration !== null && elapsed >= this.duration) {
      this.stop();
      this.onExpire?.();
    }
  }

  stop() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
    return this.elapsed();
  }
}

function readSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const progressStore = {
  all() {
    return readSessions();
  },
  add(session) {
    const sessions = [session, ...readSessions()].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
  export() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), sessions: readSessions() }, null, 2);
  },
};

export function summarizeProgress(sessions) {
  const targetSessions = sessions.filter((session) => session.questionType === 'target');
  const mocks = targetSessions.filter((session) => session.mode === 'mock');
  const questionTimes = targetSessions.flatMap((session) => session.questionTimes || []);
  const totalQuestions = targetSessions.reduce((sum, session) => sum + (session.questionCount || 0), 0);
  const totalCorrect = targetSessions.reduce((sum, session) => sum + (session.correct || 0), 0);
  return {
    latestMock: mocks[0]?.correct ?? null,
    bestMock: mocks.length ? Math.max(...mocks.map((session) => session.correct)) : null,
    accuracy: totalQuestions ? (totalCorrect / totalQuestions) * 100 : null,
    medianTime: questionTimes.length ? median(questionTimes) : null,
    withinTarget: questionTimes.length
      ? (questionTimes.filter((time) => time <= TARGET_SECONDS).length / questionTimes.length) * 100
      : null,
  };
}
