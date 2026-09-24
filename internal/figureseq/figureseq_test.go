package figureseq

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func testSettings() Settings {
	return Settings{Seed: 20260818, Counts: Counts{Low: 2, Medium: 2, High: 2, Extreme: 2}}
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
	bank, err := Generate(Settings{Seed: 9, Counts: Counts{Low: 1, Medium: 1, High: 1, Extreme: 1}})
	if err != nil {
		t.Fatal(err)
	}
	wantActors := map[string]int{"low": 1, "medium": 3, "high": 4, "extreme": 4}
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
	if count != 8 {
		t.Fatalf("verified %d puzzles, want 8", count)
	}
}

func TestAmbiguousContinuationIsRejected(t *testing.T) {
	// Four positions along the top row fit both a horizontal bounce and a
	// perimeter traversal. They disagree at frame five.
	program := Program{ActorID: "arrow figure", Motion: "horizontal-bounce", Path: pathFor("horizontal-bounce", 0), Direction: 1, StepMode: "constant", StepSize: 1, Colors: []string{"teal"}}
	puzzle := Puzzle{Actors: []Actor{{ID: program.ActorID, Shape: "arrow"}}, Programs: []Program{program}}
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

func TestExtremeCannotBeRelabelledHighPuzzle(t *testing.T) {
	bank, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	for _, puzzle := range bank.Puzzles {
		if puzzle.Difficulty.Level != "high" {
			continue
		}
		puzzle.Difficulty = difficultyFor(puzzle.Programs, "extreme")
		puzzle.ID = puzzleID(puzzle)
		if err := VerifyPuzzle(puzzle); err == nil {
			t.Fatal("accepted relabelled high puzzle as extreme")
		}
	}
}

func TestNegativeExtremeCountRejected(t *testing.T) {
	settings := testSettings()
	settings.Counts.Extreme = -1
	if _, err := Generate(settings); err == nil {
		t.Fatal("accepted negative count")
	}
}

func TestShapeCoverageAcrossSeeds(t *testing.T) {
	for _, seed := range []uint64{1, 24, 20260924} {
		bank, err := Generate(Settings{Seed: seed, Counts: Counts{Low: len(shapeCatalog), Medium: 18, High: 24, Extreme: 18}})
		if err != nil {
			t.Fatal(err)
		}
		for _, level := range []string{"low", "medium", "high", "extreme"} {
			seen := map[string]bool{}
			rotating := map[string]bool{}
			for _, puzzle := range bank.Puzzles {
				if puzzle.Difficulty.Level != level {
					continue
				}
				for index, actor := range puzzle.Actors {
					seen[actor.Shape] = true
					if puzzle.Programs[index].RotationStep != 0 {
						rotating[actor.Shape] = true
						if shapePeriod(actor.Shape) != 360 {
							t.Fatalf("invisible rotation track: %s", actor.Shape)
						}
					}
				}
			}
			for _, shape := range shapeCatalog {
				if level == "extreme" && shape.Period < 360 {
					continue
				}
				if !seen[shape.Name] {
					t.Errorf("seed %d %s never uses %s", seed, level, shape.Name)
				}
			}
			if level != "low" && len(rotating) < 8 {
				t.Errorf("seed %d %s rotates only %d silhouettes", seed, level, len(rotating))
			}
		}
	}
}

func TestVisuallyIdenticalDistractorsRejected(t *testing.T) {
	bank, err := Generate(Settings{Seed: 24, Counts: Counts{Low: len(shapeCatalog)}})
	if err != nil {
		t.Fatal(err)
	}
	for _, puzzle := range bank.Puzzles {
		period := shapePeriod(puzzle.Actors[0].Shape)
		if period == 360 {
			continue
		}
		question := &puzzle.Questions[0]
		duplicate := cloneFrame(question.Options[question.AnswerIndex])
		duplicate.Figures[0].Rotation = mod(duplicate.Figures[0].Rotation+period, 360)
		question.Options[(question.AnswerIndex+1)%OptionsPerFrame] = duplicate
		puzzle.ID = puzzleID(puzzle)
		if err := VerifyPuzzle(puzzle); err == nil || !strings.Contains(err.Error(), "duplicate") {
			t.Fatalf("%s: expected visual duplicate rejection, got %v", puzzle.Actors[0].Shape, err)
		}
	}
}

func TestRetainedBankPreservesSavedQuestionIDs(t *testing.T) {
	retained, err := Generate(testSettings())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "retained.json")
	if err := WriteBank(path, retained); err != nil {
		t.Fatal(err)
	}
	settings := Settings{Seed: 25, Retain: path, Counts: Counts{Low: 3, Medium: 3, High: 3, Extreme: 3}}
	expanded, err := Generate(settings)
	if err != nil {
		t.Fatal(err)
	}
	for index, puzzle := range retained.Puzzles {
		before, _ := json.Marshal(puzzle)
		after, _ := json.Marshal(expanded.Puzzles[index])
		if !bytes.Equal(before, after) {
			t.Fatal("retained puzzle changed")
		}
	}
	settings.Counts.Low = 1
	if _, err := Generate(settings); err == nil {
		t.Fatal("accepted total below retained count")
	}
}
