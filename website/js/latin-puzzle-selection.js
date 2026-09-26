const STORAGE_KEY = 'dmat-latin-puzzle-history-v1';

// Keep selection history separately from the 50 saved result records so Learn
// sessions and abandoned drills cannot make older questions look unseen again.
export function createPuzzleHistory(bank, sessions = [], storage) {
  const validIds = new Set(bank.map(puzzle => puzzle.id));
  const recent = new Map();
  let sequence = 0;
  const rememberIds = ids => {
    for (const id of ids) {
      if (!validIds.has(id)) continue;
      recent.delete(id);
      recent.set(id, sequence++);
    }
  };
  for (const session of [...sessions].reverse()) {
    if (Array.isArray(session?.puzzleIds)) rememberIds(session.puzzleIds);
  }
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) rememberIds(saved);
  } catch {
    // Practice still works with in-memory history if storage is unavailable.
  }

  return {
    select(pool, count, random = Math.random) {
      const shuffled = [...pool];
      for (let index = shuffled.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
      }
      // Unseen first, then least recently selected. Random order breaks ties.
      return shuffled.sort((a, b) => (recent.get(a.id) ?? -1) - (recent.get(b.id) ?? -1)).slice(0, count);
    },
    remember(puzzles) {
      rememberIds(puzzles.map(puzzle => puzzle.id));
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify([...recent.keys()]));
      } catch {
        // Retain the in-memory history even if the browser cannot save it.
      }
    },
    clear() {
      recent.clear();
      sequence = 0;
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Clearing in-memory history remains possible without storage access.
      }
    },
  };
}
