package figureseq

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
)

func TestMovementPathsReplayExpectedPositions(t *testing.T) {
	for _, test := range []struct {
		name      string
		program   Program
		positions []Position
	}{
		{"central clockwise square", Program{Motion: "small-square", Path: pathFor("small-square", 4), StartIndex: 3, Direction: 1, StepMode: "constant", StepSize: 1}, []Position{{2, 1}, {1, 1}, {1, 2}, {2, 2}, {2, 1}, {1, 1}}},
		{"central counter-clockwise square", Program{Motion: "small-square", Path: pathFor("small-square", 4), Direction: -1, StepMode: "constant", StepSize: 1}, []Position{{1, 1}, {2, 1}, {2, 2}, {1, 2}, {1, 1}, {2, 1}}},
		{"off-centre diagonal retraces", Program{Motion: "diagonal-bounce", Path: pathFor("diagonal-bounce", 3), Direction: 1, StepMode: "constant", StepSize: 1}, []Position{{1, 0}, {2, 1}, {3, 2}, {2, 1}, {1, 0}, {2, 1}}},
		{"fixed position", Program{Motion: "stationary", Path: pathFor("stationary", 9), Direction: 1, StepMode: "constant", StepSize: 1}, []Position{{2, 1}, {2, 1}, {2, 1}, {2, 1}, {2, 1}, {2, 1}}},
		{"increasing from two steps", Program{Motion: "perimeter", Path: pathFor("perimeter", 0), Direction: -1, StepMode: "increasing", StepSize: 2}, []Position{{0, 0}, {2, 0}, {3, 2}, {0, 3}, {2, 0}, {1, 3}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			for frame, want := range test.positions {
				if got := test.program.Path[pathIndexAt(test.program, frame)]; got != want {
					t.Fatalf("frame %d: got %v, want %v", frame+1, got, want)
				}
			}
		})
	}
}

func TestIncreasingRotationBothDirections(t *testing.T) {
	for _, test := range []struct {
		step int
		want []int
	}{{90, []int{0, 90, 270, 180, 180, 270}}, {-90, []int{0, 270, 90, 180, 180, 90}}} {
		program := Program{RotationStep: test.step, RotationIncreasing: true}
		for frame, want := range test.want {
			if got := rotationAt(program, frame); got != want {
				t.Fatalf("step %d frame %d: got %d, want %d", test.step, frame+1, got, want)
			}
		}
	}
}

func TestExpandedBankCoversMovementAndAppearanceRules(t *testing.T) {
	data, err := os.ReadFile("../../website/data/figure-sequences.json")
	if err != nil {
		t.Fatal(err)
	}
	var bank Bank
	if err := json.Unmarshal(data, &bank); err != nil {
		t.Fatal(err)
	}
	if err := VerifyBank(bank); err != nil {
		t.Fatal(err)
	}
	paths, steps, rotations, colours := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[int]bool{}
	for _, puzzle := range bank.Puzzles {
		for _, program := range puzzle.Programs {
			paths[fmt.Sprintf("%s:%v:%d", program.Motion, program.Path, program.Direction)] = true
			steps[fmt.Sprintf("%s:%s:%d:%d", program.Motion, program.StepMode, program.StepSize, program.Direction)] = true
			rotations[fmt.Sprintf("%d:%t", program.RotationStep, program.RotationIncreasing)] = true
			colours[len(program.Colors)] = true
		}
	}
	for _, motion := range []string{"horizontal-bounce", "vertical-bounce", "diagonal-bounce", "perimeter", "small-square", "stationary"} {
		for lane := 0; lane < pathCount(motion); lane++ {
			path := pathFor(motion, lane)
			forward := paths[fmt.Sprintf("%s:%v:1", motion, path)]
			backward := paths[fmt.Sprintf("%s:%v:-1", motion, path)]
			if !forward && !backward {
				t.Errorf("missing %s path %v", motion, path)
			}
			if (motion == "perimeter" || motion == "small-square") && (!forward || !backward) {
				t.Errorf("missing circuit direction for %s path %v", motion, path)
			}
		}
		if motion == "stationary" {
			continue
		}
		for _, mode := range []string{"constant", "increasing"} {
			for _, step := range []int{1, 2} {
				positive := steps[fmt.Sprintf("%s:%s:%d:1", motion, mode, step)]
				negative := steps[fmt.Sprintf("%s:%s:%d:-1", motion, mode, step)]
				if !positive && !negative {
					t.Errorf("missing %s %s step %d", motion, mode, step)
				}
				if (motion == "perimeter" || motion == "small-square") && (!positive || !negative) {
					t.Errorf("missing circuit direction for %s %s step %d", motion, mode, step)
				}
			}
		}
	}
	for _, rotation := range []string{"0:false", "90:false", "-90:false", "90:true", "-90:true"} {
		if !rotations[rotation] {
			t.Errorf("missing rotation %s", rotation)
		}
	}
	if !reflect.DeepEqual(colours, map[int]bool{1: true, 2: true, 3: true}) {
		t.Fatalf("missing colour cycle: %v", colours)
	}
}

func TestAllRetainedQuestionsAreUnchanged(t *testing.T) {
	read := func(path string) Bank {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var bank Bank
		if err := json.Unmarshal(data, &bank); err != nil {
			t.Fatal(err)
		}
		return bank
	}
	retained := read("../../data/figure-sequences-v3.json")
	expanded := read("../../website/data/figure-sequences.json")
	for index, puzzle := range retained.Puzzles {
		if index >= len(expanded.Puzzles) || !reflect.DeepEqual(puzzle, expanded.Puzzles[index]) {
			t.Fatalf("retained puzzle %s changed", puzzle.ID)
		}
	}
}
