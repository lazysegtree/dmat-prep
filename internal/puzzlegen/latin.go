package puzzlegen

import (
	"fmt"
	"sort"
)

func validPartial(grid Grid) bool {
	for i := 0; i < Size; i++ {
		rowSeen := map[string]bool{}
		columnSeen := map[string]bool{}
		for j := 0; j < Size; j++ {
			for _, item := range []struct {
				value string
				seen  map[string]bool
			}{{grid[i][j], rowSeen}, {grid[j][i], columnSeen}} {
				if item.value == "" {
					continue
				}
				if !isSymbol(item.value) || item.seen[item.value] {
					return false
				}
				item.seen[item.value] = true
			}
		}
	}
	return true
}

func isSymbol(value string) bool {
	for _, symbol := range Symbols {
		if value == symbol {
			return true
		}
	}
	return false
}

func candidates(grid Grid, row, column int) []string {
	used := map[string]bool{}
	for i := 0; i < Size; i++ {
		used[grid[row][i]] = true
		used[grid[i][column]] = true
	}
	var result []string
	for _, symbol := range Symbols {
		if !used[symbol] {
			result = append(result, symbol)
		}
	}
	return result
}

func CountSolutions(grid Grid, limit int) int {
	if limit <= 0 || !validPartial(grid) {
		return 0
	}
	count := 0
	var visit func(Grid)
	visit = func(current Grid) {
		if count >= limit {
			return
		}
		bestRow, bestColumn := -1, -1
		var best []string
		for row := 0; row < Size; row++ {
			for column := 0; column < Size; column++ {
				if current[row][column] != "" {
					continue
				}
				options := candidates(current, row, column)
				if len(options) == 0 {
					return
				}
				if bestRow == -1 || len(options) < len(best) {
					bestRow, bestColumn, best = row, column, options
				}
			}
		}
		if bestRow == -1 {
			count++
			return
		}
		for _, value := range best {
			next := current
			next[bestRow][bestColumn] = value
			visit(next)
			if count >= limit {
				return
			}
		}
	}
	visit(grid)
	return count
}

func completeGridValid(grid Grid) bool {
	if !validPartial(grid) {
		return false
	}
	for row := 0; row < Size; row++ {
		for column := 0; column < Size; column++ {
			if grid[row][column] == "" {
				return false
			}
		}
	}
	return true
}

func randomCompleteGrid(rng *splitMix64) Grid {
	var grid Grid
	var fill func(int) bool
	fill = func(position int) bool {
		if position == Size*Size {
			return true
		}
		row, column := position/Size, position%Size
		options := candidates(grid, row, column)
		order := make([]int, len(options))
		for i := range order {
			order[i] = i
		}
		rng.shuffle(order)
		for _, index := range order {
			grid[row][column] = options[index]
			if fill(position + 1) {
				return true
			}
		}
		grid[row][column] = ""
		return false
	}
	if !fill(0) {
		panic("could not construct a Latin square")
	}
	return grid
}

func reducedCatalogue() Catalogue {
	var grid Grid
	for index, symbol := range Symbols {
		grid[0][index] = symbol
		grid[index][0] = symbol
	}
	var squares []Grid
	var fill func(int)
	fill = func(position int) {
		if position == Size*Size {
			squares = append(squares, grid)
			return
		}
		row, column := position/Size, position%Size
		if row == 0 || column == 0 {
			fill(position + 1)
			return
		}
		for _, value := range candidates(grid, row, column) {
			grid[row][column] = value
			fill(position + 1)
			grid[row][column] = ""
		}
	}
	fill(0)
	sort.Slice(squares, func(i, j int) bool { return gridKey(squares[i]) < gridKey(squares[j]) })
	entries := make([]CatalogueSquare, len(squares))
	for i, square := range squares {
		entries[i] = CatalogueSquare{ID: fmt.Sprintf("DMAT-REDUCED-%03d", i+1), Grid: square}
	}
	return Catalogue{FormatVersion: FormatVersion, Symbols: Symbols, Squares: entries}
}

func gridKey(grid Grid) string {
	buffer := make([]byte, 0, Size*Size)
	for row := 0; row < Size; row++ {
		for column := 0; column < Size; column++ {
			value := grid[row][column]
			if value == "" {
				buffer = append(buffer, '-')
			} else {
				buffer = append(buffer, value[0])
			}
		}
	}
	return string(buffer)
}
