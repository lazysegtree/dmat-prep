package puzzlegen

import (
	"crypto/sha256"
	"fmt"
)

var levels = []string{"easy", "exam", "hard", "extreme"}

func ValidateSettings(settings Settings) error {
	if settings.Counts.Total() == 0 {
		return fmt.Errorf("at least one requested puzzle count must be positive")
	}
	if settings.MaximumAttempts == 0 || settings.MaximumSearchStates == 0 || settings.MaximumSearchDepth == 0 {
		return fmt.Errorf("attempt and search limits must be positive")
	}
	if settings.MinimumGivens == 0 || settings.MinimumGivens > settings.MaximumGivens || settings.MaximumGivens >= Size*Size {
		return fmt.Errorf("givens must satisfy 1 <= minimum <= maximum < 25")
	}
	return nil
}

func canonicalIdentity(grid Grid, row, column int) string {
	return fmt.Sprintf("%s:%d,%d", gridKey(grid), row, column)
}

func puzzleID(identity string) string {
	digest := sha256.Sum256([]byte(fmt.Sprintf("G%d|%s", GeneratorVersion, identity)))
	return fmt.Sprintf("DMAT-G%d-%X", GeneratorVersion, digest[:6])
}

func desiredComplete(accepted, requested Counts) bool {
	for _, level := range levels {
		if accepted.For(level) < requested.For(level) {
			return false
		}
	}
	return true
}

func incrementCount(counts *Counts, level string) {
	switch level {
	case "easy":
		counts.Easy++
	case "exam":
		counts.Exam++
	case "hard":
		counts.Hard++
	case "extreme":
		counts.Extreme++
	}
}

func Generate(settings Settings) (Bank, Catalogue, Report, error) {
	if err := ValidateSettings(settings); err != nil {
		return Bank{}, Catalogue{}, Report{}, err
	}
	rng := newSplitMix64(settings.Seed)
	bank := Bank{FormatVersion: FormatVersion, GeneratorVersion: GeneratorVersion, Settings: settings, Puzzles: []Puzzle{}}
	catalogue := reducedCatalogue()
	report := Report{}
	identities := map[string]bool{}
	ids := map[string]string{}

	for report.Attempts < settings.MaximumAttempts && !desiredComplete(report.Accepted, settings.Counts) {
		report.Attempts++
		solution := randomCompleteGrid(rng)
		desiredGivens := int(settings.MinimumGivens + uint(rng.rangeN(uint64(settings.MaximumGivens-settings.MinimumGivens+1))))
		positions := make([]int, Size*Size)
		for i := range positions {
			positions[i] = i
		}
		rng.shuffle(positions)
		grid := solution
		for _, position := range positions[:Size*Size-desiredGivens] {
			grid[position/Size][position%Size] = ""
		}
		if CountSolutions(grid, 2) != 1 {
			report.Rejections.Ambiguous++
			continue
		}
		blanks := make([]int, 0, Size*Size-desiredGivens)
		for position := 0; position < Size*Size; position++ {
			if grid[position/Size][position%Size] == "" {
				blanks = append(blanks, position)
			}
		}
		targetPosition := blanks[int(rng.rangeN(uint64(len(blanks))))]
		targetRow, targetColumn := targetPosition/Size, targetPosition%Size
		search := ScoreTarget(grid, targetRow, targetColumn, settings.MaximumSearchStates, settings.MaximumSearchDepth)
		if !search.Found {
			report.Rejections.Unrated++
			continue
		}
		level := Classify(search.Score)
		if report.Accepted.For(level) >= settings.Counts.For(level) {
			report.Rejections.UnwantedDifficulty++
			continue
		}
		identity := canonicalIdentity(grid, targetRow, targetColumn)
		if identities[identity] {
			report.Rejections.Duplicate++
			continue
		}
		id := puzzleID(identity)
		if prior, exists := ids[id]; exists && prior != identity {
			return Bank{}, Catalogue{}, report, fmt.Errorf("truncated puzzle ID collision for %s", id)
		}
		identities[identity], ids[id] = true, identity
		first := search.Path[0].Placement
		answer := solution[targetRow][targetColumn]
		puzzle := Puzzle{
			ID:       id,
			Grid:     grid,
			Target:   Target{Row: targetRow, Column: targetColumn, Value: answer},
			Answer:   answer,
			Solution: solution,
			Difficulty: Difficulty{
				TargetCell: level, Score: search.Score, Level: level, RulesVersion: RulesVersion,
			},
			BestMethod: search.Path,
			Hints: Hints{TargetCell: []Hint{{
				Row: first.Row, Column: first.Column, Value: first.Value, Text: search.Path[0].Details,
			}}},
			Validation: Validation{SolutionCount: 1, Givens: desiredGivens},
		}
		bank.Puzzles = append(bank.Puzzles, puzzle)
		incrementCount(&report.Accepted, level)
	}
	if !desiredComplete(report.Accepted, settings.Counts) {
		return Bank{}, Catalogue{}, report, fmt.Errorf("maximum attempts exhausted: requested %+v, accepted %+v", settings.Counts, report.Accepted)
	}
	if err := VerifyDocuments(bank, catalogue); err != nil {
		return Bank{}, Catalogue{}, report, fmt.Errorf("generated documents failed verification: %w", err)
	}
	return bank, catalogue, report, nil
}
