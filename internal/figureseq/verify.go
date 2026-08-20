package figureseq

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
)

func equalFrame(left, right Frame) bool {
	return frameKey(left) == frameKey(right)
}

func VerifyPuzzle(puzzle Puzzle) error {
	if puzzle.Kind != "figure-sequence" || puzzle.GridSize != Size {
		return fmt.Errorf("wrong puzzle kind or grid size")
	}
	if len(puzzle.Actors) == 0 || len(puzzle.Actors) != len(puzzle.Programs) {
		return fmt.Errorf("actor and program counts do not match")
	}
	if len(puzzle.ObservedFrames) != ObservedFrames || len(puzzle.Questions) != PredictedFrames {
		return fmt.Errorf("expected four observed and two predicted frames")
	}
	actorIDs := map[string]bool{}
	for index, actor := range puzzle.Actors {
		if actor.ID == "" || actor.Shape == "" || actorIDs[actor.ID] || puzzle.Programs[index].ActorID != actor.ID {
			return fmt.Errorf("invalid actor %d", index)
		}
		actorIDs[actor.ID] = true
	}
	frames := append([]Frame(nil), puzzle.ObservedFrames...)
	for index, question := range puzzle.Questions {
		if question.FrameNumber != ObservedFrames+index+1 || len(question.Options) != OptionsPerFrame || question.AnswerIndex < 0 || question.AnswerIndex >= OptionsPerFrame {
			return fmt.Errorf("invalid question %d", index)
		}
		correct := frameAt(puzzle.Programs, ObservedFrames+index)
		if !equalFrame(question.Options[question.AnswerIndex], correct) {
			return fmt.Errorf("question %d answer does not match the programs", index)
		}
		keys := map[string]bool{}
		for _, option := range question.Options {
			key := frameKey(option)
			if keys[key] || !framesValid([]Frame{option}, len(puzzle.Actors)) {
				return fmt.Errorf("question %d has duplicate or illegal options", index)
			}
			keys[key] = true
		}
		frames = append(frames, correct)
	}
	if !framesValid(frames, len(puzzle.Actors)) {
		return fmt.Errorf("observed or correct frames are illegal")
	}
	if puzzle.ID != puzzleID(puzzle) {
		return fmt.Errorf("puzzle ID is not canonical")
	}
	if puzzle.Difficulty.Level != "low" && puzzle.Difficulty.Level != "medium" && puzzle.Difficulty.Level != "high" {
		return fmt.Errorf("invalid difficulty level")
	}
	if !puzzle.Validation.FramesValid || !puzzle.Validation.OptionsUnique || !puzzle.Validation.ProgramsDeterministic || puzzle.Validation.GeneratorVersion != GeneratorVersion {
		return fmt.Errorf("validation metadata is incomplete")
	}
	return nil
}

func VerifyBank(bank Bank) error {
	if bank.FormatVersion != FormatVersion || bank.GeneratorVersion != GeneratorVersion {
		return fmt.Errorf("unsupported bank version")
	}
	seen := map[string]bool{}
	counts := Counts{}
	for index, puzzle := range bank.Puzzles {
		if seen[puzzle.ID] {
			return fmt.Errorf("duplicate puzzle ID %s", puzzle.ID)
		}
		seen[puzzle.ID] = true
		if err := VerifyPuzzle(puzzle); err != nil {
			return fmt.Errorf("puzzle %d (%s): %w", index, puzzle.ID, err)
		}
		switch puzzle.Difficulty.Level {
		case "low":
			counts.Low++
		case "medium":
			counts.Medium++
		case "high":
			counts.High++
		}
	}
	if counts != bank.Settings.Counts {
		return fmt.Errorf("bank counts %+v do not match settings %+v", counts, bank.Settings.Counts)
	}
	return nil
}

func MarshalBank(bank Bank) ([]byte, error) {
	data, err := json.MarshalIndent(bank, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func WriteBank(path string, bank Bank) error {
	data, err := MarshalBank(bank)
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}

func VerifyFile(path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	var bank Bank
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&bank); err != nil {
		return 0, err
	}
	canonical, err := MarshalBank(bank)
	if err != nil || !bytes.Equal(data, canonical) {
		return 0, fmt.Errorf("bank JSON is not canonical")
	}
	if err := VerifyBank(bank); err != nil {
		return 0, err
	}
	return len(bank.Puzzles), nil
}
