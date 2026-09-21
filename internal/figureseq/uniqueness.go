package figureseq

import (
	"fmt"
	"reflect"
	"slices"
)

// The finite grammar is deliberately independent of difficulty and the stored
// solution: every lane, phase, direction, and step rule is considered.
func motionCandidates() []Program {
	var candidates []Program
	for _, motion := range []string{"horizontal-bounce", "vertical-bounce", "diagonal-bounce", "perimeter"} {
		for lane := 0; lane < Size; lane++ {
			path := pathFor(motion, lane)
			for start := range path {
				for _, direction := range []int{-1, 1} {
					for _, mode := range []string{"constant", "increasing"} {
						for _, step := range []int{1, 2} {
							candidates = append(candidates, Program{Motion: motion, Path: path, StartIndex: start, Direction: direction, StepMode: mode, StepSize: step})
						}
					}
				}
			}
		}
	}
	return candidates
}

func validProgram(p Program) bool {
	motionValid := false
	for _, candidate := range motionCandidates() {
		if p.Motion == candidate.Motion && reflect.DeepEqual(p.Path, candidate.Path) && p.StartIndex == candidate.StartIndex && p.Direction == candidate.Direction && p.StepMode == candidate.StepMode && p.StepSize == candidate.StepSize {
			motionValid = true
			break
		}
	}
	if !motionValid || len(p.Colors) < 1 || len(p.Colors) > 3 || p.ColorStart < 0 || p.ColorStart >= len(p.Colors) || !slices.Contains([]int{0, 90, 180, 270}, p.RotationStart) || !slices.Contains([]int{-90, 0, 90}, p.RotationStep) {
		return false
	}
	seen := map[string]bool{}
	for _, color := range p.Colors {
		if !slices.Contains(colors, color) || seen[color] {
			return false
		}
		seen[color] = true
	}
	return true
}

// verifyPredictiveUniqueness checks each independent track. It conservatively
// rejects a differing continuation even if combining it with other actors would
// cause a collision. This proves uniqueness within this grammar, not all rules.
func verifyPredictiveUniqueness(puzzle Puzzle) error {
	candidates := motionCandidates()
	for actorIndex, program := range puzzle.Programs {
		observed := make([]FigureState, ObservedFrames)
		for frame := range observed {
			observed[frame] = puzzle.ObservedFrames[frame].Figures[actorIndex]
		}
		for _, candidate := range candidates {
			matches := true
			for frame, state := range observed {
				position := candidate.Path[pathIndexAt(candidate, frame)]
				if position.Row != state.Row || position.Column != state.Column {
					matches = false
					break
				}
			}
			if !matches {
				continue
			}
			for frame := ObservedFrames; frame < ObservedFrames+PredictedFrames; frame++ {
				position := candidate.Path[pathIndexAt(candidate, frame)]
				expected := stateAt(program, frame)
				if position.Row != expected.Row || position.Column != expected.Column {
					return fmt.Errorf("ambiguous position continuation for %s", program.ActorID)
				}
			}
		}
		for _, step := range []int{-90, 0, 90} {
			for _, increasing := range []bool{false, true} {
				candidate := Program{RotationStart: observed[0].Rotation, RotationStep: step, RotationIncreasing: increasing}
				matches := true
				for frame, state := range observed {
					if rotationAt(candidate, frame) != state.Rotation {
						matches = false
						break
					}
				}
				if !matches {
					continue
				}
				for frame := ObservedFrames; frame < ObservedFrames+PredictedFrames; frame++ {
					if rotationAt(candidate, frame) != rotationAt(program, frame) {
						return fmt.Errorf("ambiguous rotation continuation for %s", program.ActorID)
					}
				}
			}
		}
		// Every cycle of up to three distinct colors is completely observed in four
		// frames. Test every possible period rather than trusting the stored period.
		for period := 1; period <= 3; period++ {
			matches := true
			distinct := map[string]bool{}
			for frame, state := range observed {
				if frame < period {
					if distinct[state.Color] {
						matches = false
					}
					distinct[state.Color] = true
				}
				if state.Color != observed[frame%period].Color {
					matches = false
				}
			}
			if !matches {
				continue
			}
			for frame := ObservedFrames; frame < ObservedFrames+PredictedFrames; frame++ {
				if observed[frame%period].Color != stateAt(program, frame).Color {
					return fmt.Errorf("ambiguous color continuation for %s", program.ActorID)
				}
			}
		}
	}
	return nil
}
