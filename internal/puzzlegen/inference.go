package puzzlegen

import (
	"fmt"
	"strings"
)

const (
	ruleSingleMissing       = "single-missing-cell"
	ruleUniquePosition      = "unique-candidate-position"
	ruleUniqueCandidateCell = "unique-candidate-for-cell"
)

func unitCells(unit Unit) []Cell {
	cells := make([]Cell, 0, Size)
	for i := 0; i < Size; i++ {
		if unit.Type == "row" {
			cells = append(cells, Cell{Row: unit.Index, Column: i})
		} else {
			cells = append(cells, Cell{Row: i, Column: unit.Index})
		}
	}
	return cells
}

func unitState(grid Grid, unit Unit) ([]Cell, []string) {
	var empty []Cell
	present := map[string]bool{}
	for _, cell := range unitCells(unit) {
		value := grid[cell.Row][cell.Column]
		if value == "" {
			empty = append(empty, cell)
		} else {
			present[value] = true
		}
	}
	var missing []string
	for _, symbol := range Symbols {
		if !present[symbol] {
			missing = append(missing, symbol)
		}
	}
	return empty, missing
}

func intersectingBlock(grid Grid, unit Unit, cell Cell, value string) (BlockedBy, bool) {
	if unit.Type == "row" {
		for row := 0; row < Size; row++ {
			if grid[row][cell.Column] == value {
				return BlockedBy{Row: row, Column: cell.Column}, true
			}
		}
	} else {
		for column := 0; column < Size; column++ {
			if grid[cell.Row][column] == value {
				return BlockedBy{Row: cell.Row, Column: column}, true
			}
		}
	}
	return BlockedBy{}, false
}

func EnumerateInferences(grid Grid) []Inference {
	var result []Inference
	units := make([]Unit, 0, Size*2)
	for _, unitType := range []string{"row", "column"} {
		for index := 0; index < Size; index++ {
			units = append(units, Unit{Type: unitType, Index: index})
		}
	}

	// Rule order and all loops are fixed for generator version one.
	for _, unit := range units {
		empty, missing := unitState(grid, unit)
		if len(empty) != 1 || len(missing) != 1 {
			continue
		}
		inference := Inference{
			Rule:              ruleSingleMissing,
			Weight:            1,
			Unit:              unit,
			K:                 1,
			MissingCandidates: missing,
			Placement:         Cell{Row: empty[0].Row, Column: empty[0].Column, Value: missing[0]},
		}
		inference.Details = Details(inference)
		result = append(result, inference)
	}

	for _, unit := range units {
		empty, missing := unitState(grid, unit)
		k := len(empty)
		if k < 2 || k > Size {
			continue
		}
		for _, value := range missing {
			var eligible []Cell
			var eliminated []Elimination
			for _, cell := range empty {
				blockedBy, blocked := intersectingBlock(grid, unit, cell, value)
				if blocked {
					row, column := cell.Row, cell.Column
					eliminated = append(eliminated, Elimination{Row: &row, Column: &column, BlockedBy: blockedBy})
				} else {
					eligible = append(eligible, cell)
				}
			}
			if len(eligible) != 1 {
				continue
			}
			inference := Inference{
				Rule:              ruleUniquePosition,
				Weight:            k,
				Unit:              unit,
				K:                 k,
				MissingCandidates: append([]string(nil), missing...),
				SelectedCandidate: value,
				Eliminations:      eliminated,
				Placement:         Cell{Row: eligible[0].Row, Column: eligible[0].Column, Value: value},
			}
			inference.Details = Details(inference)
			result = append(result, inference)
		}
	}

	for _, unit := range units {
		empty, missing := unitState(grid, unit)
		k := len(empty)
		if k < 2 || k > Size {
			continue
		}
		for _, cell := range empty {
			var eligible []string
			var eliminated []Elimination
			for _, value := range missing {
				blockedBy, blocked := intersectingBlock(grid, unit, cell, value)
				if blocked {
					eliminated = append(eliminated, Elimination{Value: value, BlockedBy: blockedBy})
				} else {
					eligible = append(eligible, value)
				}
			}
			if len(eligible) != 1 {
				continue
			}
			selected := &Cell{Row: cell.Row, Column: cell.Column}
			inference := Inference{
				Rule:              ruleUniqueCandidateCell,
				Weight:            k,
				Unit:              unit,
				K:                 k,
				MissingCandidates: append([]string(nil), missing...),
				SelectedCell:      selected,
				Eliminations:      eliminated,
				Placement:         Cell{Row: cell.Row, Column: cell.Column, Value: eligible[0]},
			}
			inference.Details = Details(inference)
			result = append(result, inference)
		}
	}
	return result
}

func unitName(unit Unit) string {
	return strings.ToUpper(unit.Type[:1]) + unit.Type[1:] + fmt.Sprintf(" %d", unit.Index+1)
}

func joined(values []string) string {
	if len(values) == 1 {
		return values[0]
	}
	if len(values) == 2 {
		return values[0] + " and " + values[1]
	}
	return strings.Join(values[:len(values)-1], ", ") + ", and " + values[len(values)-1]
}

func cellName(cell Cell) string {
	return fmt.Sprintf("row %d, column %d", cell.Row+1, cell.Column+1)
}

func blockReason(unit Unit, blocked BlockedBy, value string) string {
	if unit.Type == "row" {
		return fmt.Sprintf("column %d already contains %s at row %d, column %d", blocked.Column+1, value, blocked.Row+1, blocked.Column+1)
	}
	return fmt.Sprintf("row %d already contains %s at row %d, column %d", blocked.Row+1, value, blocked.Row+1, blocked.Column+1)
}

func Details(inference Inference) string {
	unit := unitName(inference.Unit)
	switch inference.Rule {
	case ruleSingleMissing:
		return fmt.Sprintf("%s has one empty cell and is missing %s, so %s is %s.", unit, inference.Placement.Value, cellName(inference.Placement), inference.Placement.Value)
	case ruleUniquePosition:
		parts := make([]string, 0, len(inference.Eliminations))
		for _, elimination := range inference.Eliminations {
			if elimination.Row == nil || elimination.Column == nil {
				continue
			}
			cell := Cell{Row: *elimination.Row, Column: *elimination.Column}
			parts = append(parts, fmt.Sprintf("%s cannot be at %s because %s", inference.SelectedCandidate, cellName(cell), blockReason(inference.Unit, elimination.BlockedBy, inference.SelectedCandidate)))
		}
		return fmt.Sprintf("%s is missing %s. %s, so only %s remains for %s.", unit, joined(inference.MissingCandidates), joinedSentences(parts), cellName(inference.Placement), inference.SelectedCandidate)
	case ruleUniqueCandidateCell:
		parts := make([]string, 0, len(inference.Eliminations))
		for _, elimination := range inference.Eliminations {
			parts = append(parts, fmt.Sprintf("%s is eliminated because %s", elimination.Value, blockReason(inference.Unit, elimination.BlockedBy, elimination.Value)))
		}
		return fmt.Sprintf("%s is missing %s. At %s, %s, so only %s remains.", unit, joined(inference.MissingCandidates), cellName(inference.Placement), joinedSentences(parts), inference.Placement.Value)
	default:
		return ""
	}
}

func joinedSentences(parts []string) string {
	if len(parts) == 0 {
		return "no alternatives remain"
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return strings.Join(parts[:len(parts)-1], "; ") + "; and " + parts[len(parts)-1]
}

func applyInference(grid Grid, inference Inference) (Grid, error) {
	row, column := inference.Placement.Row, inference.Placement.Column
	if row < 0 || row >= Size || column < 0 || column >= Size || grid[row][column] != "" || !isSymbol(inference.Placement.Value) {
		return Grid{}, fmt.Errorf("invalid placement at row %d, column %d", row, column)
	}
	next := grid
	next[row][column] = inference.Placement.Value
	if !validPartial(next) {
		return Grid{}, fmt.Errorf("placement violates Latin-square constraints")
	}
	return next, nil
}
