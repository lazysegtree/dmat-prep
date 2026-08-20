package equationgen

import (
	"bytes"
	"reflect"
	"testing"
)

func TestGenerateIsDeterministicAndVerified(t *testing.T) {
	settings := Settings{Seed: 20260819, Low: 12, Medium: 12, High: 12}
	first, err := Generate(settings)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Generate(settings)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := Marshal(first)
	b, _ := Marshal(second)
	if !bytes.Equal(a, b) {
		t.Fatal("same settings produced different banks")
	}
	if err := VerifyBank(first); err != nil {
		t.Fatal(err)
	}
}

func TestOperationCostRespectsMentalAnchors(t *testing.T) {
	round := operationCost(Operation{Operator: "×", Left: 20, Right: 20})
	awkward := operationCost(Operation{Operator: "×", Left: 13, Right: 17})
	if round >= awkward {
		t.Fatalf("expected 20 × 20 (%d) to cost less than 13 × 17 (%d)", round, awkward)
	}
}

func TestGeneratedSystemsHaveOneSolutionInRange(t *testing.T) {
	bank, err := Generate(Settings{Seed: 7, Low: 5, Medium: 5, High: 5})
	if err != nil {
		t.Fatal(err)
	}
	for _, question := range bank.Questions {
		if got := countSolutions(question, 2); got != 1 {
			t.Fatalf("%s has %d solutions", question.ID, got)
		}
	}
}

func TestPublishedGrammarIsDiverseAndDoesNotContainMirroredTemplates(t *testing.T) {
	bank, err := Generate(Settings{Seed: 20260819, Low: 20, Medium: 20, High: 20})
	if err != nil {
		t.Fatal(err)
	}
	forbidden := map[string]bool{
		"two-variable-chain": true, "scale-and-difference": true,
		"three-variable-substitution": true, "linked-three-variable": true,
		"four-variable-star": true, "four-variable-linked": true,
	}
	families := map[string]bool{}
	for _, question := range bank.Questions {
		if forbidden[question.Family] {
			t.Fatalf("published question %s uses removed mirrored template %q", question.ID, question.Family)
		}
		families[question.Family] = true
	}
	if len(families) < 8 {
		t.Fatalf("published bank uses only %d grammar families", len(families))
	}
}

func TestDifficultyDoesNotDependOnGrammarFamilyName(t *testing.T) {
	rng := newSplitMix64(91)
	question := generateCandidate(rng)
	applyDifficulty(&question)
	want := question.Difficulty
	question.Family = "renamed-independent-family"
	applyDifficulty(&question)
	if !reflect.DeepEqual(question.Difficulty, want) {
		t.Fatalf("difficulty changed after family rename: got %+v, want %+v", question.Difficulty, want)
	}
}

func TestEquationBuilderKeepsDisplayAndStandardFormTogether(t *testing.T) {
	equation := buildEquation(
		expression(3, term(2, "A"), term(-1, "B")),
		expression(7, term(1, "A")),
	)
	if equation.Display != "2 × A - B + 3 = A + 7" {
		t.Fatalf("unexpected display: %s", equation.Display)
	}
	if equation.Constant != 4 || equation.Coefficients["A"] != 1 || equation.Coefficients["B"] != -1 {
		t.Fatalf("unexpected standard form: %+v = %d", equation.Coefficients, equation.Constant)
	}
}
