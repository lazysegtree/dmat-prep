package puzzlegen

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func MarshalDocument(value any) ([]byte, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func WriteOutputs(puzzlesPath, cataloguePath string, bank Bank, catalogue Catalogue) error {
	if err := VerifyDocuments(bank, catalogue); err != nil {
		return err
	}
	puzzles, err := MarshalDocument(bank)
	if err != nil {
		return err
	}
	squares, err := MarshalDocument(catalogue)
	if err != nil {
		return err
	}
	type staged struct{ final, temporary string }
	outputs := []struct {
		path string
		data []byte
	}{{puzzlesPath, puzzles}, {cataloguePath, squares}}
	var stagedFiles []staged
	cleanup := func() {
		for _, file := range stagedFiles {
			_ = os.Remove(file.temporary)
		}
	}
	for _, output := range outputs {
		directory := filepath.Dir(output.path)
		file, err := os.CreateTemp(directory, ".dmat-puzzle-generator-*")
		if err != nil {
			cleanup()
			return fmt.Errorf("stage %s: %w", output.path, err)
		}
		temporary := file.Name()
		stagedFiles = append(stagedFiles, staged{final: output.path, temporary: temporary})
		if _, err := file.Write(output.data); err != nil {
			_ = file.Close()
			cleanup()
			return fmt.Errorf("write staged %s: %w", output.path, err)
		}
		if err := file.Sync(); err != nil {
			_ = file.Close()
			cleanup()
			return fmt.Errorf("sync staged %s: %w", output.path, err)
		}
		if err := file.Close(); err != nil {
			cleanup()
			return fmt.Errorf("close staged %s: %w", output.path, err)
		}
	}
	for index, file := range stagedFiles {
		if err := os.Rename(file.temporary, file.final); err != nil {
			for _, remaining := range stagedFiles[index:] {
				_ = os.Remove(remaining.temporary)
			}
			return fmt.Errorf("replace %s: %w", file.final, err)
		}
	}
	return nil
}
