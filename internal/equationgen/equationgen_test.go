package equationgen

import (
	"bytes"
	"reflect"
	"testing"
)

func TestGenerateIsDeterministicAndVerified(t *testing.T) {
	settings := Settings{Seed: 20260819, Low: 12, Medium: 12, High: 12, Extreme: 12}
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
	bank, err := Generate(Settings{Seed: 7, Low: 5, Medium: 5, High: 5, Extreme: 5})
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
	bank, err := Generate(Settings{Seed: 20260819, Low: 20, Medium: 20, High: 20, Extreme: 20})
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

func TestExtremeRequiresScoreAndStructuralGate(t *testing.T) {
	cycle := &Question{
		Variables: []string{"A", "B", "C", "D"},
		Equations: []Equation{
			{Coefficients: map[string]int{"A": 1, "B": 1}},
			{Coefficients: map[string]int{"B": 1, "C": 1}},
			{Coefficients: map[string]int{"C": 1, "D": 1}},
			{Coefficients: map[string]int{"D": 2, "A": 1}},
		},
	}
	eligible := DifficultyFactors{
		Variables: 4, Transformations: 4, Substitutions: 3,
		WorkingMemory: 3, SignedTerms: 4, CoupledBranches: 2, ArithmeticLoad: 9,
	}
	if score := difficultyScore(eligible); score < ExtremeMinimumScore || difficultyLevel(cycle, score, eligible) != "extreme" {
		t.Fatalf("eligible factors were not Extreme: score=%d factors=%+v", score, eligible)
	}

	shallow := DifficultyFactors{
		Variables: 4, Transformations: 2, Substitutions: 1,
		WorkingMemory: 2, SignedTerms: 3, ArithmeticLoad: 15,
	}
	if score := difficultyScore(shallow); score < ExtremeMinimumScore || difficultyLevel(cycle, score, shallow) != "high" {
		t.Fatalf("score-only question should remain High: score=%d factors=%+v", score, shallow)
	}

	belowFloor := eligible
	belowFloor.ArithmeticLoad = 8
	if score := difficultyScore(belowFloor); score >= ExtremeMinimumScore || difficultyLevel(cycle, score, belowFloor) != "high" {
		t.Fatalf("structurally eligible question below the score floor should remain High: score=%d factors=%+v", score, belowFloor)
	}

	uncoupled := eligible
	uncoupled.CoupledBranches = 0
	if score := difficultyScore(uncoupled); score < ExtremeMinimumScore || difficultyLevel(cycle, score, uncoupled) != "high" {
		t.Fatalf("uncoupled question should remain High: score=%d factors=%+v", score, uncoupled)
	}

	path := &Question{
		Variables: []string{"A", "B", "C", "D"},
		Equations: []Equation{
			{Coefficients: map[string]int{"A": 1, "B": 1}},
			{Coefficients: map[string]int{"B": 1, "C": 1}},
			{Coefficients: map[string]int{"C": 1, "D": 1}},
			{Coefficients: map[string]int{"A": 2, "B": 1}},
		},
	}
	if score := difficultyScore(eligible); difficultyLevel(path, score, eligible) != "high" {
		t.Fatalf("non-cyclic dependency graph should remain High: score=%d", score)
	}
}

func TestGeneratedExtremeQuestionsMeetStructuralGate(t *testing.T) {
	bank, err := Generate(Settings{Seed: 20260819, Extreme: 20})
	if err != nil {
		t.Fatal(err)
	}
	if len(bank.Questions) != 20 {
		t.Fatalf("generated %d Extreme questions, want 20", len(bank.Questions))
	}
	for _, question := range bank.Questions {
		if question.Difficulty.Level != "extreme" || question.Difficulty.Score < ExtremeMinimumScore || !extremeEligible(&question, question.Difficulty.Factors) {
			t.Fatalf("%s violates the Extreme contract: %+v", question.ID, question.Difficulty)
		}
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
