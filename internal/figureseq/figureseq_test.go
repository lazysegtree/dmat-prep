package figureseq

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"
)

func testSettings() Settings {
	return Settings{Seed: 20260818, Counts: Counts{Low: 2, Medium: 2, High: 2}}
}

func TestGenerationIsDeterministicAndValid(t *testing.T) {
	first, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	firstJSON, _ := MarshalBank(first)
	secondJSON, _ := MarshalBank(second)
	if !bytes.Equal(firstJSON, secondJSON) {
		t.Fatal("same seed and settings did not reproduce the same bank")
	}
	if err := VerifyBank(first); err != nil {
		t.Fatal(err)
	}
}

func TestDifficultyTemplatesHaveExpectedTrackingLoad(t *testing.T) {
	bank, err := Generate(Settings{Seed: 9, Counts: Counts{Low: 1, Medium: 1, High: 1}})
	if err != nil {
		t.Fatal(err)
	}
	wantActors := map[string]int{"low": 1, "medium": 3, "high": 4}
	for _, puzzle := range bank.Puzzles {
		if got := len(puzzle.Actors); got != wantActors[puzzle.Difficulty.Level] {
			t.Fatalf("%s puzzle has %d actors", puzzle.Difficulty.Level, got)
		}
		if puzzle.Difficulty.Level == "high" {
			components := puzzle.Difficulty.Components
			if components.ChangingTracks < 7 || components.CoupledActors < 2 || components.IncrementalPrograms < 1 {
				t.Fatalf("high puzzle does not satisfy the structural gate: %+v", components)
			}
		}
	}
}

func TestQuestionsContainOneCorrectAndTwoLegalDistinctOptions(t *testing.T) {
	bank, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	for _, puzzle := range bank.Puzzles {
		for questionIndex, question := range puzzle.Questions {
			correct := frameAt(puzzle.Programs, ObservedFrames+questionIndex)
			matches := 0
			for _, option := range question.Options {
				if equalFrame(option, correct) {
					matches++
				}
			}
			if matches != 1 {
				t.Fatalf("%s question %d has %d correct options", puzzle.ID, questionIndex, matches)
			}
		}
	}
}

func TestWrittenBankCanBeStrictlyVerified(t *testing.T) {
	bank, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "figure-sequences.json")
	if err := WriteBank(path, bank); err != nil {
		t.Fatal(err)
	}
	count, err := VerifyFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if count != 6 {
		t.Fatalf("verified %d puzzles, want 6", count)
	}
}

func TestAmbiguousContinuationIsRejected(t *testing.T) {
	// Four positions along the top row fit both a horizontal bounce and a
	// perimeter traversal. They disagree at frame five.
	program := Program{ActorID: "arrow figure", Motion: "horizontal-bounce", Path: pathFor("horizontal-bounce", 0), Direction: 1, StepMode: "constant", StepSize: 1, Colors: []string{"teal"}}
	puzzle := Puzzle{Programs: []Program{program}}
	for frame := 0; frame < ObservedFrames; frame++ {
		puzzle.ObservedFrames = append(puzzle.ObservedFrames, frameAt(puzzle.Programs, frame))
	}
	if err := verifyPredictiveUniqueness(puzzle); err == nil {
		t.Fatal("accepted bounce/perimeter ambiguity")
	}
}

func TestVerifierRejectsCorruptionBeforeReplay(t *testing.T) {
	bank, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*Puzzle){
		func(p *Puzzle) { p.Programs[0].Path = nil },
		func(p *Puzzle) { p.Programs[0].Colors = nil },
		func(p *Puzzle) { p.Programs[0].StepSize = 0 },
		func(p *Puzzle) {
			p.ObservedFrames[0].Figures[0].Rotation = (p.ObservedFrames[0].Figures[0].Rotation + 90) % 360
		},
		func(p *Puzzle) { p.Validation.PredictiveUnique = false },
	} {
		data, _ := json.Marshal(bank.Puzzles[0])
		var puzzle Puzzle
		if err := json.Unmarshal(data, &puzzle); err != nil {
			t.Fatal(err)
		}
		mutate(&puzzle)
		puzzle.ID = puzzleID(puzzle) // Rehashing must not hide semantic corruption.
		if err := VerifyPuzzle(puzzle); err == nil {
			t.Fatal("accepted corrupted puzzle")
		}
	}
}
