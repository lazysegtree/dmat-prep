export function answerComplete(question, answer) {
  return Array.isArray(answer) && answer.length === 2 && answer.every((value) => Number.isInteger(value) && value >= 0 && value < 3);
}

export function frameCorrectCount(question, answer) {
  return question.questions.filter((frame, index) => answer?.[index] === frame.answerIndex).length;
}

export function answerStatus(question, answer) {
  if (!answerComplete(question, answer)) return 'unanswered';
  return frameCorrectCount(question, answer) === 2 ? 'correct' : 'incorrect';
}

export function validateFigureBank(data) {
  if (data?.formatVersion !== 1 || data?.generatorVersion !== 2 || !Array.isArray(data.puzzles)) throw new Error('Unsupported figure bank');
  const counts = { low: 0, medium: 0, high: 0, extreme: 0 };
  const ids = new Set();
  for (const puzzle of data.puzzles) {
    const actors = puzzle?.actors;
    const validActors = Array.isArray(actors) && actors.length >= 1 && actors.length <= 4
      && actors.every((actor) => typeof actor.id === 'string' && ['arrow', 'triangle', 'corner', 'chevron'].includes(actor.shape))
      && new Set(actors.map((actor) => actor.id)).size === actors.length
      && new Set(actors.map((actor) => actor.shape)).size === actors.length;
    const validFrame = (frame) => validActors && Array.isArray(frame?.figures) && frame.figures.length === actors.length
      && frame.figures.every((figure, index) => figure.actorId === actors[index].id
        && Number.isInteger(figure.row) && figure.row >= 0 && figure.row < 4
        && Number.isInteger(figure.column) && figure.column >= 0 && figure.column < 4
        && ['teal', 'magenta', 'amber', 'ink'].includes(figure.color) && [0, 90, 180, 270].includes(figure.rotation))
      && new Set(frame.figures.map((figure) => `${figure.row},${figure.column}`)).size === actors.length;
    if (typeof puzzle?.id !== 'string' || ids.has(puzzle.id) || puzzle.kind !== 'figure-sequence' || puzzle.gridSize !== 4
      || !validActors || !Object.hasOwn(counts, puzzle.difficulty?.level)
      || !Array.isArray(puzzle.observedFrames) || puzzle.observedFrames.length !== 4 || !puzzle.observedFrames.every(validFrame)
      || !Array.isArray(puzzle.questions) || puzzle.questions.length !== 2
      || !puzzle.questions.every((frame, index) => frame.frameNumber === index + 5 && Array.isArray(frame.options) && frame.options.length === 3
        && frame.options.every(validFrame) && new Set(frame.options.map((option) => JSON.stringify(option))).size === 3
        && Number.isInteger(frame.answerIndex) && frame.answerIndex >= 0 && frame.answerIndex < 3)
      || !Array.isArray(puzzle.programs) || puzzle.programs.length !== actors.length
      || !puzzle.programs.every((program, index) => program.actorId === actors[index].id && typeof program.explanation === 'string')
      || typeof puzzle.hint !== 'string' || puzzle.validation?.predictiveUnique !== true || puzzle.validation?.generatorVersion !== 2) {
      throw new Error('Invalid figure sequence in bank');
    }
    if (puzzle.difficulty.level === 'extreme') {
      const programs = puzzle.programs;
      if (programs.length !== 4
        || !programs.every((program) => program.colors?.length > 1 && program.rotationStep !== 0)
        || programs.filter((program) => program.stepMode === 'increasing' || program.rotationIncreasing).length < 2) {
        throw new Error('Extreme figure sequence does not meet the structural gate');
      }
    }
    ids.add(puzzle.id);
    counts[puzzle.difficulty.level]++;
  }
  if (Object.values(counts).some((count) => count < 10)) throw new Error('Figure bank needs at least 10 sequences per difficulty');
  return data.puzzles;
}
