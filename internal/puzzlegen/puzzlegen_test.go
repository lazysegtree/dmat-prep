package puzzlegen

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func cyclicSolution() Grid {
	return Grid{
		{"A", "B", "C", "D", "E"},
		{"B", "C", "D", "E", "A"},
		{"C", "D", "E", "A", "B"},
		{"D", "E", "A", "B", "C"},
		{"E", "A", "B", "C", "D"},
	}
}

func testSettings(counts Counts) Settings {
	return Settings{
		Seed: 42, Counts: counts, MaximumAttempts: 2000,
		MaximumSearchStates: 10000, MaximumSearchDepth: 12,
		MinimumGivens: 15, MaximumGivens: 15,
	}
}

func TestSplitMix64ReferenceValues(t *testing.T) {
	rng := newSplitMix64(0)
	want := []uint64{0xE220A8397B1DCDAF, 0x6E789E6AA1B965F4, 0x06C45D188009454F}
	for index, expected := range want {
		if got := rng.next(); got != expected {
			t.Fatalf("value %d: got %016X, want %016X", index, got, expected)
		}
	}
}

func TestSolverRejectsZeroAndDetectsMultipleSolutions(t *testing.T) {
	invalid := cyclicSolution()
	invalid[0][0] = "B"
	if got := CountSolutions(invalid, 2); got != 0 {
		t.Fatalf("invalid grid has %d solutions", got)
	}
	if got := CountSolutions(Grid{}, 2); got != 2 {
		t.Fatalf("empty grid should hit the two-solution cap, got %d", got)
	}
	oneBlank := cyclicSolution()
	oneBlank[0][0] = ""
	if got := CountSolutions(oneBlank, 2); got != 1 {
		t.Fatalf("one-blank grid has %d solutions", got)
	}
}

func TestRandomCompleteGridsObeyLatinRules(t *testing.T) {
	rng := newSplitMix64(99)
	for index := 0; index < 20; index++ {
		if grid := randomCompleteGrid(rng); !completeGridValid(grid) {
			t.Fatalf("generated grid %d is invalid", index)
		}
	}
}

func TestAllInferenceRulesArePresentSoundAndWeighted(t *testing.T) {
	solution := cyclicSolution()
	grid := solution
	grid[0][0], grid[0][1] = "", ""
	wantRules := map[string]bool{
		ruleSingleMissing: false, ruleUniquePosition: false, ruleUniqueCandidateCell: false,
	}
	// A separate one-blank unit supplies Rule 1 while the first row supplies Rules 2 and 3.
	grid[2][4] = ""
	for _, inference := range EnumerateInferences(grid) {
		wantRules[inference.Rule] = true
		placement := inference.Placement
		if placement.Value != solution[placement.Row][placement.Column] {
			t.Fatalf("unsound %s inference: %+v", inference.Rule, inference)
		}
		if inference.Rule == ruleSingleMissing && inference.Weight != 1 {
			t.Fatalf("Rule 1 weight = %d", inference.Weight)
		}
		if inference.Rule != ruleSingleMissing && inference.Weight != inference.K {
			t.Fatalf("%s weight = %d, K = %d", inference.Rule, inference.Weight, inference.K)
		}
		if inference.Details == "" || inference.Details != Details(inference) {
			t.Fatalf("details do not regenerate for %+v", inference)
		}
		if !strings.Contains(inference.Details, "row ") && !strings.Contains(inference.Details, "Row ") {
			t.Fatalf("details do not use one-based row wording: %s", inference.Details)
		}
	}
	for rule, found := range wantRules {
		if !found {
			t.Errorf("did not enumerate %s", rule)
		}
	}
}

func TestSearchEdgeCostAndLimits(t *testing.T) {
	grid := cyclicSolution()
	grid[0][0] = ""
	if result := ScoreTarget(grid, 0, 0, 3, 1); !result.Found || result.Score != 1+StepScalar || len(result.Path) != 1 {
		t.Fatalf("unexpected one-step result: %+v", result)
	}
	if result := ScoreTarget(grid, 0, 0, 3, 0); result.Found || result.LimitExhausted {
		t.Fatalf("depth-zero result should be unrated without state exhaustion: %+v", result)
	}
	if result := ScoreTarget(grid, 0, 0, 1, 1); result.Found || !result.LimitExhausted {
		t.Fatalf("one-state boundary should exhaust before target pop: %+v", result)
	}
	if result := ScoreTarget(grid, 0, 0, 2, 1); result.Found || !result.LimitExhausted {
		t.Fatalf("reaching the two-state boundary before target pop should exhaust: %+v", result)
	}
}

func TestDifficultyBoundaries(t *testing.T) {
	tests := map[int]string{0: "easy", 6: "easy", 7: "exam", 12: "exam", 13: "hard", 18: "hard", 19: "extreme", 100: "extreme"}
	for score, want := range tests {
		if got := Classify(score); got != want {
			t.Errorf("Classify(%d) = %s, want %s", score, got, want)
		}
	}
}

func TestCanonicalIdentityAndID(t *testing.T) {
	grid := cyclicSolution()
	grid[3][2] = ""
	identity := canonicalIdentity(grid, 3, 2)
	if !strings.HasSuffix(identity, ":3,2") || len(strings.Split(identity, ":")[0]) != 25 {
		t.Fatalf("unexpected canonical identity %q", identity)
	}
	if got := puzzleID(identity); got != puzzleID(identity) || !strings.HasPrefix(got, "DMAT-G1-") || len(got) != len("DMAT-G1-")+12 {
		t.Fatalf("unexpected ID %q", got)
	}
}

func TestReducedCatalogueIsCompleteDeterministicAndValid(t *testing.T) {
	first := reducedCatalogue()
	second := reducedCatalogue()
	firstJSON, _ := MarshalDocument(first)
	secondJSON, _ := MarshalDocument(second)
	if !bytes.Equal(firstJSON, secondJSON) {
		t.Fatal("catalogue is not byte deterministic")
	}
	bank := Bank{FormatVersion: 1, GeneratorVersion: 1, Settings: testSettings(Counts{Easy: 1})}
	_ = bank // The catalogue verifier is exercised directly because this test has no puzzle bank.
	if err := verifyCatalogue(first); err != nil {
		t.Fatal(err)
	}
}

func TestGenerationIsByteDeterministicAndSelfVerifying(t *testing.T) {
	settings := testSettings(Counts{Easy: 1})
	firstBank, firstCatalogue, _, err := Generate(settings)
	if err != nil {
		t.Fatal(err)
	}
	secondBank, secondCatalogue, _, err := Generate(settings)
	if err != nil {
		t.Fatal(err)
	}
	firstBankJSON, _ := MarshalDocument(firstBank)
	secondBankJSON, _ := MarshalDocument(secondBank)
	firstCatalogueJSON, _ := MarshalDocument(firstCatalogue)
	secondCatalogueJSON, _ := MarshalDocument(secondCatalogue)
	if !bytes.Equal(firstBankJSON, secondBankJSON) || !bytes.Equal(firstCatalogueJSON, secondCatalogueJSON) {
		t.Fatal("same settings and seed did not reproduce byte-identical output")
	}
	if err := VerifyDocuments(firstBank, firstCatalogue); err != nil {
		t.Fatal(err)
	}
}

func TestVerifierRejectsTamperedInference(t *testing.T) {
	bank, catalogue, _, err := Generate(testSettings(Counts{Easy: 1}))
	if err != nil {
		t.Fatal(err)
	}
	bank.Puzzles[0].BestMethod[0].Details += " tampered"
	if err := VerifyDocuments(bank, catalogue); err == nil || !strings.Contains(err.Error(), "details") {
		t.Fatalf("expected details verification error, got %v", err)
	}
}

func TestWriteAndVerifyFiles(t *testing.T) {
	bank, catalogue, _, err := Generate(testSettings(Counts{Easy: 1}))
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	puzzlesPath := filepath.Join(directory, "puzzles.json")
	cataloguePath := filepath.Join(directory, "catalogue.json")
	if err := WriteOutputs(puzzlesPath, cataloguePath, bank, catalogue); err != nil {
		t.Fatal(err)
	}
	puzzles, squares, err := VerifyFiles(puzzlesPath, cataloguePath)
	if err != nil {
		t.Fatal(err)
	}
	if puzzles != 1 || squares != 56 {
		t.Fatalf("verified counts = %d, %d", puzzles, squares)
	}
	data, err := os.ReadFile(puzzlesPath)
	if err != nil || len(data) == 0 || data[len(data)-1] != '\n' {
		t.Fatal("puzzle JSON does not end in one newline")
	}
}

func TestFileVerifierRejectsNonCanonicalJSON(t *testing.T) {
	bank, catalogue, _, err := Generate(testSettings(Counts{Easy: 1}))
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	puzzlesPath := filepath.Join(directory, "puzzles.json")
	cataloguePath := filepath.Join(directory, "catalogue.json")
	if err := WriteOutputs(puzzlesPath, cataloguePath, bank, catalogue); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(puzzlesPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(puzzlesPath, bytes.TrimSuffix(data, []byte{'\n'}), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := VerifyFiles(puzzlesPath, cataloguePath); err == nil || !strings.Contains(err.Error(), "canonical") {
		t.Fatalf("expected non-canonical JSON error, got %v", err)
	}
}
