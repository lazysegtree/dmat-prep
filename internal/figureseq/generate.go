package figureseq

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
)

var (
	shapes = []string{"arrow", "triangle", "corner", "chevron"}
	colors = []string{"teal", "magenta", "amber", "ink"}
)

type splitMix64 struct{ state uint64 }

func (r *splitMix64) next() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

func (r *splitMix64) rangeN(n int) int {
	if n <= 0 {
		panic("rangeN requires a positive bound")
	}
	return int(r.next() % uint64(n))
}

func mod(value, divisor int) int {
	result := value % divisor
	if result < 0 {
		result += divisor
	}
	return result
}

func pathFor(kind string, lane int) []Position {
	switch kind {
	case "horizontal-bounce":
		return []Position{{lane, 0}, {lane, 1}, {lane, 2}, {lane, 3}, {lane, 2}, {lane, 1}}
	case "vertical-bounce":
		return []Position{{0, lane}, {1, lane}, {2, lane}, {3, lane}, {2, lane}, {1, lane}}
	case "diagonal-bounce":
		if lane%2 == 0 {
			return []Position{{0, 0}, {1, 1}, {2, 2}, {3, 3}, {2, 2}, {1, 1}}
		}
		return []Position{{3, 0}, {2, 1}, {1, 2}, {0, 3}, {1, 2}, {2, 1}}
	case "perimeter":
		return []Position{
			{0, 0}, {0, 1}, {0, 2}, {0, 3},
			{1, 3}, {2, 3}, {3, 3}, {3, 2},
			{3, 1}, {3, 0}, {2, 0}, {1, 0},
		}
	default:
		panic("unknown motion path: " + kind)
	}
}

func stepAt(program Program, transition int) int {
	if program.StepMode == "increasing" {
		return program.StepSize + transition - 1
	}
	return program.StepSize
}

func pathIndexAt(program Program, frame int) int {
	steps := 0
	for transition := 1; transition <= frame; transition++ {
		steps += stepAt(program, transition)
	}
	return mod(program.StartIndex+program.Direction*steps, len(program.Path))
}

func rotationAt(program Program, frame int) int {
	rotation := program.RotationStart
	for transition := 1; transition <= frame; transition++ {
		step := program.RotationStep
		if program.RotationIncreasing {
			step *= transition
		}
		rotation += step
	}
	return mod(rotation, 360)
}

func stateAt(program Program, frame int) FigureState {
	position := program.Path[pathIndexAt(program, frame)]
	color := program.Colors[mod(program.ColorStart+frame, len(program.Colors))]
	return FigureState{
		ActorID: program.ActorID,
		Row:     position.Row, Column: position.Column,
		Color: color, Rotation: rotationAt(program, frame),
	}
}

func frameAt(programs []Program, frame int) Frame {
	figures := make([]FigureState, len(programs))
	for index, program := range programs {
		figures[index] = stateAt(program, frame)
	}
	return Frame{Figures: figures}
}

func framesValid(frames []Frame, actorCount int) bool {
	for _, frame := range frames {
		if len(frame.Figures) != actorCount {
			return false
		}
		positions := map[Position]bool{}
		actors := map[string]bool{}
		for _, figure := range frame.Figures {
			if figure.Row < 0 || figure.Row >= Size || figure.Column < 0 || figure.Column >= Size {
				return false
			}
			position := Position{figure.Row, figure.Column}
			if positions[position] || actors[figure.ActorID] {
				return false
			}
			positions[position], actors[figure.ActorID] = true, true
		}
	}
	return true
}

func cloneFrame(frame Frame) Frame {
	copyOfFigures := append([]FigureState(nil), frame.Figures...)
	return Frame{Figures: copyOfFigures}
}

func frameKey(frame Frame) string {
	data, _ := json.Marshal(frame)
	return string(data)
}

func mutatePosition(frame Frame, programs []Program, actorIndex, frameIndex, direction int) (Frame, bool) {
	mutated := cloneFrame(frame)
	program := programs[actorIndex]
	current := pathIndexAt(program, frameIndex)
	occupied := map[Position]bool{}
	for index, figure := range mutated.Figures {
		if index != actorIndex {
			occupied[Position{figure.Row, figure.Column}] = true
		}
	}
	for distance := 1; distance < len(program.Path); distance++ {
		position := program.Path[mod(current+direction*distance, len(program.Path))]
		if !occupied[position] {
			mutated.Figures[actorIndex].Row = position.Row
			mutated.Figures[actorIndex].Column = position.Column
			return mutated, frameKey(mutated) != frameKey(frame)
		}
	}
	return Frame{}, false
}

func mutateAppearance(frame Frame, actorIndex int) Frame {
	mutated := cloneFrame(frame)
	figure := &mutated.Figures[actorIndex]
	figure.Rotation = mod(figure.Rotation+90, 360)
	return mutated
}

func makeQuestion(programs []Program, correct Frame, frameIndex, variant int) (Question, error) {
	actorCount := len(programs)
	firstActor := mod(variant+frameIndex, actorCount)
	secondActor := mod(firstActor+1, actorCount)
	first, ok := mutatePosition(correct, programs, firstActor, frameIndex, 1)
	if !ok {
		return Question{}, fmt.Errorf("could not create first distractor")
	}
	var second Frame
	if actorCount > 1 || programs[secondActor].RotationStep != 0 || len(programs[secondActor].Colors) > 1 {
		second = mutateAppearance(correct, secondActor)
	} else {
		second, ok = mutatePosition(correct, programs, secondActor, frameIndex, -1)
		if !ok {
			return Question{}, fmt.Errorf("could not create second distractor")
		}
	}
	if !framesValid([]Frame{first, second}, actorCount) || frameKey(first) == frameKey(second) || frameKey(second) == frameKey(correct) {
		second, ok = mutatePosition(correct, programs, secondActor, frameIndex, -1)
		if !ok || frameKey(first) == frameKey(second) || frameKey(second) == frameKey(correct) {
			return Question{}, fmt.Errorf("could not create distinct legal distractors")
		}
	}
	answerIndex := mod(variant+frameIndex, OptionsPerFrame)
	options := make([]Frame, OptionsPerFrame)
	distractors := []Frame{first, second}
	distractorIndex := 0
	for index := range options {
		if index == answerIndex {
			options[index] = correct
		} else {
			options[index] = distractors[distractorIndex]
			distractorIndex++
		}
	}
	return Question{FrameNumber: frameIndex + 1, Options: options, AnswerIndex: answerIndex}, nil
}

func explanation(program Program) string {
	motion := map[string]string{
		"horizontal-bounce": "moves horizontally and bounces at the left and right edges",
		"vertical-bounce":   "moves vertically and bounces at the top and bottom edges",
		"diagonal-bounce":   "moves on one diagonal and reverses at its endpoints",
		"perimeter":         "moves around the outer border",
	}[program.Motion]
	if program.Direction < 0 && program.Motion == "perimeter" {
		motion += " counter-clockwise"
	} else if program.Motion == "perimeter" {
		motion += " clockwise"
	}
	if program.StepMode == "increasing" {
		motion += " by one additional cell on each transition"
	} else if program.StepSize > 1 {
		motion += fmt.Sprintf(" by %d cells at a time", program.StepSize)
	} else {
		motion += " by one cell at a time"
	}
	changes := ""
	if program.RotationStep != 0 {
		if program.RotationIncreasing {
			changes += "; its quarter-turn count also increases on each transition"
		} else {
			changes += "; it rotates 90 degrees on each transition"
		}
	}
	if len(program.Colors) > 1 {
		changes += "; its colour follows a repeating cycle"
	}
	return fmt.Sprintf("The %s %s%s.", program.ActorID, motion, changes)
}

func difficultyFor(programs []Program, level string) Difficulty {
	components := DifficultyComponents{ActorTracking: len(programs)}
	for _, program := range programs {
		tracks := 1
		if len(program.Colors) > 1 {
			tracks++
		}
		if program.RotationStep != 0 {
			tracks++
		}
		components.ChangingTracks += tracks
		if tracks >= 2 {
			components.CoupledActors++
		}
		if program.StepMode == "increasing" || program.RotationIncreasing {
			components.IncrementalPrograms++
		}
	}
	score := components.ActorTracking*2 + components.ChangingTracks + components.CoupledActors*2 + components.IncrementalPrograms*3
	return Difficulty{Level: level, Score: score, Provisional: true, Components: components}
}

func makePrograms(level string, variant int, rng *splitMix64) ([]Actor, []Program) {
	actorCount := map[string]int{"low": 1, "medium": 3, "high": 4}[level]
	actors := make([]Actor, actorCount)
	programs := make([]Program, actorCount)
	motions := []string{"horizontal-bounce", "vertical-bounce", "diagonal-bounce", "perimeter"}
	for index := 0; index < actorCount; index++ {
		actorID := fmt.Sprintf("%s figure", shapes[index])
		motion := motions[mod(index+variant, len(motions))]
		program := Program{
			ActorID: actorID, Motion: motion, Path: pathFor(motion, mod(index+variant, Size)),
			StartIndex: rng.rangeN(len(pathFor(motion, mod(index+variant, Size)))),
			Direction:  1, StepMode: "constant", StepSize: 1,
			Colors: []string{colors[index]}, ColorStart: 0,
			RotationStart: 90 * rng.rangeN(4),
		}
		if motion == "perimeter" && (index+variant)%2 == 1 {
			program.Direction = -1
		}
		if level == "medium" {
			if index == 0 {
				program.Colors = []string{colors[index], colors[(index+1)%len(colors)]}
			}
			if index == 1 {
				program.RotationStep = 90
			}
		}
		if level == "high" {
			switch index {
			case 0:
				program.StepMode = "increasing"
				program.RotationStep = 90
				program.RotationIncreasing = true
			case 1:
				program.Colors = []string{colors[index], colors[(index+1)%len(colors)], colors[(index+2)%len(colors)]}
				program.RotationStep = 90
			case 2:
				program.RotationStep = -90
			case 3:
				program.StepSize = 2
				program.Colors = []string{colors[index], colors[(index+1)%len(colors)]}
			}
		}
		program.Explanation = explanation(program)
		actors[index] = Actor{ID: actorID, Shape: shapes[index]}
		programs[index] = program
	}
	return actors, programs
}

func puzzleID(puzzle Puzzle) string {
	puzzle.ID = ""
	data, _ := json.Marshal(puzzle)
	digest := sha256.Sum256(data)
	return fmt.Sprintf("DMAT-FS-G%d-%X", GeneratorVersion, digest[:6])
}

func makePuzzle(level string, variant int, rng *splitMix64) (Puzzle, error) {
	for attempt := 0; attempt < 1000; attempt++ {
		actors, programs := makePrograms(level, variant+attempt, rng)
		allFrames := make([]Frame, ObservedFrames+PredictedFrames)
		for frame := range allFrames {
			allFrames[frame] = frameAt(programs, frame)
		}
		if !framesValid(allFrames, len(actors)) {
			continue
		}
		questions := make([]Question, PredictedFrames)
		valid := true
		for index := range questions {
			question, err := makeQuestion(programs, allFrames[ObservedFrames+index], ObservedFrames+index, variant)
			if err != nil {
				valid = false
				break
			}
			questions[index] = question
		}
		if !valid {
			continue
		}
		puzzle := Puzzle{
			Kind: "figure-sequence", GridSize: Size, Actors: actors,
			ObservedFrames: allFrames[:ObservedFrames], Questions: questions, Programs: programs,
			Difficulty: difficultyFor(programs, level),
			Hint:       fmt.Sprintf("Track the %s first. %s", programs[0].ActorID, programs[0].Explanation),
			Validation: Validation{FramesValid: true, OptionsUnique: true, ProgramsDeterministic: true, GeneratorVersion: GeneratorVersion},
		}
		puzzle.ID = puzzleID(puzzle)
		return puzzle, nil
	}
	return Puzzle{}, fmt.Errorf("could not create a legal %s puzzle after 1000 attempts", level)
}

func Generate(settings Settings) (Bank, error) {
	if settings.Counts.Low < 0 || settings.Counts.Medium < 0 || settings.Counts.High < 0 || settings.Counts.Low+settings.Counts.Medium+settings.Counts.High == 0 {
		return Bank{}, fmt.Errorf("at least one non-negative difficulty count must be positive")
	}
	rng := &splitMix64{state: settings.Seed}
	bank := Bank{FormatVersion: FormatVersion, GeneratorVersion: GeneratorVersion, Settings: settings, Puzzles: []Puzzle{}}
	seen := map[string]bool{}
	for _, request := range []struct {
		level string
		count int
	}{{"low", settings.Counts.Low}, {"medium", settings.Counts.Medium}, {"high", settings.Counts.High}} {
		for index := 0; index < request.count; index++ {
			puzzle, err := makePuzzle(request.level, index, rng)
			if err != nil {
				return Bank{}, err
			}
			if seen[puzzle.ID] {
				return Bank{}, fmt.Errorf("duplicate puzzle ID %s", puzzle.ID)
			}
			seen[puzzle.ID] = true
			bank.Puzzles = append(bank.Puzzles, puzzle)
		}
	}
	if err := VerifyBank(bank); err != nil {
		return Bank{}, fmt.Errorf("generated bank failed verification: %w", err)
	}
	return bank, nil
}
