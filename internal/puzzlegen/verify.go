package puzzlegen

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
)

func decodeStrict[T any](data []byte, destination *T) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if decoder.More() {
		return fmt.Errorf("trailing JSON content")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err == nil {
		return fmt.Errorf("trailing JSON value")
	}
	return nil
}

func VerifyFiles(puzzlesPath, cataloguePath string) (int, int, error) {
	puzzleData, err := os.ReadFile(puzzlesPath)
	if err != nil {
		return 0, 0, fmt.Errorf("read puzzle bank: %w", err)
	}
	catalogueData, err := os.ReadFile(cataloguePath)
	if err != nil {
		return 0, 0, fmt.Errorf("read catalogue: %w", err)
	}
	var bank Bank
	var catalogue Catalogue
	if err := decodeStrict(puzzleData, &bank); err != nil {
		return 0, 0, fmt.Errorf("decode puzzle bank: %w", err)
	}
	if err := decodeStrict(catalogueData, &catalogue); err != nil {
		return 0, 0, fmt.Errorf("decode catalogue: %w", err)
	}
	if err := VerifyDocuments(bank, catalogue); err != nil {
		return 0, 0, err
	}
	canonicalBank, err := MarshalDocument(bank)
	if err != nil || !bytes.Equal(canonicalBank, puzzleData) {
		return 0, 0, fmt.Errorf("puzzle bank is not in canonical two-space-indented JSON form with one trailing newline")
	}
	canonicalCatalogue, err := MarshalDocument(catalogue)
	if err != nil || !bytes.Equal(canonicalCatalogue, catalogueData) {
		return 0, 0, fmt.Errorf("catalogue is not in canonical two-space-indented JSON form with one trailing newline")
	}
	return len(bank.Puzzles), len(catalogue.Squares), nil
}

func VerifyDocuments(bank Bank, catalogue Catalogue) error {
	if bank.FormatVersion != FormatVersion || bank.GeneratorVersion != GeneratorVersion {
		return fmt.Errorf("unsupported bank format or generator version")
	}
	if err := ValidateSettings(bank.Settings); err != nil {
		return fmt.Errorf("invalid stored settings: %w", err)
	}
	seenIdentity := map[string]bool{}
	seenID := map[string]bool{}
	var observed Counts
	for index, puzzle := range bank.Puzzles {
		if err := verifyPuzzle(puzzle, bank.Settings, seenIdentity, seenID); err != nil {
			return fmt.Errorf("puzzle %d (%s): %w", index, puzzle.ID, err)
		}
		incrementCount(&observed, puzzle.Difficulty.Level)
	}
	if observed != bank.Settings.Counts {
		return fmt.Errorf("observed difficulty counts %+v do not match settings %+v", observed, bank.Settings.Counts)
	}
	if err := verifyCatalogue(catalogue); err != nil {
		return fmt.Errorf("catalogue: %w", err)
	}
	return nil
}

func verifyPuzzle(puzzle Puzzle, settings Settings, seenIdentity, seenID map[string]bool) error {
	if !completeGridValid(puzzle.Solution) {
		return fmt.Errorf("solution is not a complete Latin square")
	}
	if !validPartial(puzzle.Grid) {
		return fmt.Errorf("published grid violates Latin-square constraints")
	}
	if puzzle.Target.Row < 0 || puzzle.Target.Row >= Size || puzzle.Target.Column < 0 || puzzle.Target.Column >= Size {
		return fmt.Errorf("target is outside the grid")
	}
	if puzzle.Grid[puzzle.Target.Row][puzzle.Target.Column] != "" {
		return fmt.Errorf("target cell is not empty")
	}
	if puzzle.Answer != puzzle.Target.Value || puzzle.Target.Value != puzzle.Solution[puzzle.Target.Row][puzzle.Target.Column] {
		return fmt.Errorf("answer, target value, and solution disagree")
	}
	givens := 0
	for row := 0; row < Size; row++ {
		for column := 0; column < Size; column++ {
			if puzzle.Grid[row][column] != "" {
				givens++
				if puzzle.Grid[row][column] != puzzle.Solution[row][column] {
					return fmt.Errorf("given at row %d, column %d disagrees with solution", row, column)
				}
			}
		}
	}
	if givens != puzzle.Validation.Givens || uint(givens) < settings.MinimumGivens || uint(givens) > settings.MaximumGivens {
		return fmt.Errorf("givens metadata or configured range is wrong")
	}
	count := CountSolutions(puzzle.Grid, 2)
	if count != 1 || puzzle.Validation.SolutionCount != 1 {
		return fmt.Errorf("published grid has %d solutions", count)
	}
	identity := canonicalIdentity(puzzle.Grid, puzzle.Target.Row, puzzle.Target.Column)
	if seenIdentity[identity] {
		return fmt.Errorf("duplicate canonical identity")
	}
	seenIdentity[identity] = true
	expectedID := puzzleID(identity)
	if puzzle.ID != expectedID || seenID[puzzle.ID] {
		return fmt.Errorf("invalid or duplicate ID; expected %s", expectedID)
	}
	seenID[puzzle.ID] = true
	if puzzle.Difficulty.TargetCell != puzzle.Difficulty.Level || puzzle.Difficulty.RulesVersion != RulesVersion || Classify(puzzle.Difficulty.Score) != puzzle.Difficulty.Level {
		return fmt.Errorf("difficulty metadata is inconsistent")
	}
	if len(puzzle.BestMethod) == 0 {
		return fmt.Errorf("bestMethod is empty")
	}
	current := puzzle.Grid
	score := 0
	for step, inference := range puzzle.BestMethod {
		if inference.Details != Details(inference) {
			return fmt.Errorf("step %d details cannot be regenerated", step)
		}
		available := EnumerateInferences(current)
		matched := false
		for _, candidate := range available {
			if reflect.DeepEqual(candidate, inference) {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("step %d is not an available structured inference", step)
		}
		var err error
		current, err = applyInference(current, inference)
		if err != nil {
			return fmt.Errorf("step %d: %w", step, err)
		}
		if current[inference.Placement.Row][inference.Placement.Column] != puzzle.Solution[inference.Placement.Row][inference.Placement.Column] {
			return fmt.Errorf("step %d disagrees with solution", step)
		}
		score += inference.Weight + StepScalar
	}
	if current[puzzle.Target.Row][puzzle.Target.Column] != puzzle.Target.Value || score != puzzle.Difficulty.Score {
		return fmt.Errorf("bestMethod does not reach the target with stored score")
	}
	minimal := ScoreTarget(puzzle.Grid, puzzle.Target.Row, puzzle.Target.Column, settings.MaximumSearchStates, settings.MaximumSearchDepth)
	if !minimal.Found || minimal.Score != score {
		return fmt.Errorf("bestMethod score %d is not independently reproduced minimum %d", score, minimal.Score)
	}
	if len(puzzle.Hints.TargetCell) != 1 {
		return fmt.Errorf("targetCell must contain exactly one hint")
	}
	first := puzzle.BestMethod[0]
	expectedHint := Hint{Row: first.Placement.Row, Column: first.Placement.Column, Value: first.Placement.Value, Text: first.Details}
	if puzzle.Hints.TargetCell[0] != expectedHint {
		return fmt.Errorf("hint does not match the first inference")
	}
	return nil
}

func verifyCatalogue(catalogue Catalogue) error {
	if catalogue.FormatVersion != FormatVersion || catalogue.Symbols != Symbols {
		return fmt.Errorf("invalid format version or symbols")
	}
	if len(catalogue.Squares) != 56 {
		return fmt.Errorf("expected 56 squares, got %d", len(catalogue.Squares))
	}
	seen := map[string]bool{}
	previous := ""
	for index, entry := range catalogue.Squares {
		expectedID := fmt.Sprintf("DMAT-REDUCED-%03d", index+1)
		if entry.ID != expectedID || !completeGridValid(entry.Grid) {
			return fmt.Errorf("entry %d has invalid ID or grid", index)
		}
		for position, symbol := range Symbols {
			if entry.Grid[0][position] != symbol || entry.Grid[position][0] != symbol {
				return fmt.Errorf("entry %d is not reduced", index)
			}
		}
		key := gridKey(entry.Grid)
		if seen[key] || (index > 0 && key <= previous) {
			return fmt.Errorf("entry %d is duplicate or out of lexicographic order", index)
		}
		seen[key], previous = true, key
	}
	return nil
}
