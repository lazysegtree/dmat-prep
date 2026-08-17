package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGenerationFailureDoesNotReplaceOutputs(t *testing.T) {
	directory := t.TempDir()
	puzzles := filepath.Join(directory, "puzzles.json")
	catalogue := filepath.Join(directory, "catalogue.json")
	for _, path := range []string{puzzles, catalogue} {
		if err := os.WriteFile(path, []byte("sentinel\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	err := run([]string{
		"--puzzles-out", puzzles, "--catalogue-out", catalogue,
		"--seed", "42", "--count-easy", "0", "--count-exam", "0",
		"--count-hard", "0", "--count-extreme", "1", "--max-attempts", "1",
		"--max-search-depth", "1",
	})
	if err == nil {
		t.Fatal("expected generation to exhaust its single attempt")
	}
	for _, path := range []string{puzzles, catalogue} {
		data, readErr := os.ReadFile(path)
		if readErr != nil || string(data) != "sentinel\n" {
			t.Fatalf("failed generation changed %s: %q, %v", path, data, readErr)
		}
	}
}

func TestVerifyModeRejectsGenerationFlags(t *testing.T) {
	err := run([]string{"--verify", "--puzzles-out", "a", "--catalogue-out", "b", "--seed", "1"})
	if err == nil {
		t.Fatal("expected --seed to conflict with --verify")
	}
}
