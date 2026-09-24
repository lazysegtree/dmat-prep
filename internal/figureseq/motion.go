package figureseq

import "fmt"

// A bounce retraces its line, rather than reflecting onto another diagonal.
func bouncePath(line []Position) []Position {
	path := append([]Position(nil), line...)
	for index := len(line) - 2; index > 0; index-- {
		path = append(path, line[index])
	}
	return path
}

func diagonalPaths() [][]Position {
	// Keep the original two paths first, including their direction, so stored
	// version-2/3 programs remain valid without changing saved question IDs.
	paths := [][]Position{
		{{0, 0}, {1, 1}, {2, 2}, {3, 3}, {2, 2}, {1, 1}},
		{{3, 0}, {2, 1}, {1, 2}, {0, 3}, {1, 2}, {2, 1}},
	}
	for offset := 1; offset < Size-1; offset++ {
		for _, start := range []struct{ row, column, dr int }{
			{0, offset, 1}, {offset, 0, 1},
			{Size - 1, offset, -1}, {Size - 1 - offset, 0, -1},
		} {
			var line []Position
			for row, column := start.row, start.column; row >= 0 && row < Size && column < Size; row, column = row+start.dr, column+1 {
				line = append(line, Position{row, column})
			}
			paths = append(paths, bouncePath(line))
		}
	}
	return paths
}

func pathCount(motion string) int {
	switch motion {
	case "horizontal-bounce", "vertical-bounce":
		return Size
	case "diagonal-bounce":
		return len(diagonalPaths())
	case "small-square":
		return (Size - 1) * (Size - 1)
	case "stationary":
		return Size * Size
	default:
		return 1
	}
}

func motionCoverageKey(program Program) string {
	key := fmt.Sprintf("motion:%s:%v:%s:%d", program.Motion, program.Path, program.StepMode, program.StepSize)
	if program.Motion == "perimeter" || program.Motion == "small-square" {
		key += fmt.Sprintf(":%d", program.Direction)
	}
	return key
}

// Lane and direction are selected independently of the motion family. Prefer
// paths not yet represented at this difficulty, with deterministic random ties.
func choosePath(program Program, usage map[string]int, rng *splitMix64) Program {
	minimum := int(^uint(0) >> 1)
	var choices []Program
	for lane := 0; lane < pathCount(program.Motion); lane++ {
		for _, direction := range []int{-1, 1} {
			candidate := program
			candidate.Path = pathFor(program.Motion, lane)
			candidate.Direction = direction
			if program.Motion == "stationary" {
				candidate.Direction = 1
			}
			// A two-cell bounce with a constant two-step jump only appears to
			// stand still. Do not count it as movement coverage.
			if program.Motion != "stationary" && !hasPositionChange(candidate) {
				continue
			}
			count := usage[motionCoverageKey(candidate)]
			if count < minimum {
				minimum, choices = count, nil
			}
			if count == minimum {
				choices = append(choices, candidate)
			}
		}
	}
	chosen := choices[rng.rangeN(len(choices))]
	chosen.StartIndex = rng.rangeN(len(chosen.Path))
	return chosen
}

func hasPositionChange(program Program) bool {
	first := program.Path[pathIndexAt(program, 0)]
	for frame := 1; frame < ObservedFrames; frame++ {
		if program.Path[pathIndexAt(program, frame)] != first {
			return true
		}
	}
	return false
}
