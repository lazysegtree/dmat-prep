package equationgen

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	FormatVersion         = 3
	GeneratorVersion      = "3.0.0"
	ExtremeMinimumScore   = 26
	ExtremeMinimumActions = 3
)

type Settings struct {
	Seed    uint64 `json:"seed"`
	Low     int    `json:"low"`
	Medium  int    `json:"medium"`
	High    int    `json:"high"`
	Extreme int    `json:"extreme"`
}

type Equation struct {
	Display      string         `json:"display"`
	Coefficients map[string]int `json:"coefficients"`
	Constant     int            `json:"constant"`
}

type Operation struct {
	Operator string `json:"operator"`
	Left     int    `json:"left"`
	Right    int    `json:"right"`
}

type Step struct {
	Text            string      `json:"text"`
	Kind            string      `json:"kind"`
	Memory          int         `json:"memory"`
	SignedTerms     int         `json:"signedTerms"`
	CoupledBranches int         `json:"coupledBranches"`
	Operations      []Operation `json:"operations,omitempty"`
}

type DifficultyFactors struct {
	Variables       int `json:"variables"`
	Transformations int `json:"transformations"`
	Substitutions   int `json:"substitutions"`
	Eliminations    int `json:"eliminations"`
	WorkingMemory   int `json:"workingMemory"`
	SignedTerms     int `json:"signedTerms"`
	CoupledBranches int `json:"coupledBranches"`
	ArithmeticLoad  int `json:"arithmeticLoad"`
}

type Difficulty struct {
	Level     string            `json:"level"`
	Score     int               `json:"score"`
	Factors   DifficultyFactors `json:"factors"`
	Rationale string            `json:"rationale"`
}

type Question struct {
	ID            string         `json:"id"`
	Family        string         `json:"family"`
	Variables     []string       `json:"variables"`
	Equations     []Equation     `json:"equations"`
	Answer        map[string]int `json:"answer"`
	Hint          string         `json:"hint"`
	SolutionSteps []Step         `json:"solutionSteps"`
	Difficulty    Difficulty     `json:"difficulty"`
	Validation    Validation     `json:"validation"`
}

type Validation struct {
	SolutionsInRange int `json:"solutionsInRange"`
	MinimumValue     int `json:"minimumValue"`
	MaximumValue     int `json:"maximumValue"`
}

type Bank struct {
	FormatVersion    int        `json:"formatVersion"`
	GeneratorVersion string     `json:"generatorVersion"`
	Settings         Settings   `json:"settings"`
	Questions        []Question `json:"questions"`
}

type splitMix64 struct{ state uint64 }

func newSplitMix64(seed uint64) *splitMix64 { return &splitMix64{state: seed} }

func (r *splitMix64) next() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

func (r *splitMix64) n(max int) int { return int(r.next() % uint64(max)) }
func (r *splitMix64) between(minimum, maximum int) int {
	return minimum + r.n(maximum-minimum+1)
}

func Generate(settings Settings) (Bank, error) {
	if settings.Low < 0 || settings.Medium < 0 || settings.High < 0 || settings.Extreme < 0 || settings.Low+settings.Medium+settings.High+settings.Extreme == 0 {
		return Bank{}, fmt.Errorf("counts must be non-negative and at least one question is required")
	}
	rng := newSplitMix64(settings.Seed)
	bank := Bank{FormatVersion: FormatVersion, GeneratorVersion: GeneratorVersion, Settings: settings}
	seen := map[string]bool{}
	requested := []struct {
		level string
		count int
	}{{"low", settings.Low}, {"medium", settings.Medium}, {"high", settings.High}, {"extreme", settings.Extreme}}
	for _, request := range requested {
		accepted := 0
		for attempts := 0; accepted < request.count && attempts < request.count*1000+1000; attempts++ {
			question := generateCandidate(rng)
			applyDifficulty(&question)
			if question.Difficulty.Level != request.level {
				continue
			}
			question.ID = questionID(question)
			if seen[question.ID] {
				continue
			}
			question.Validation = Validation{SolutionsInRange: countSolutions(question, 2), MinimumValue: 1, MaximumValue: 20}
			if err := VerifyQuestion(question); err != nil {
				continue
			}
			seen[question.ID] = true
			bank.Questions = append(bank.Questions, question)
			accepted++
		}
		if accepted != request.count {
			return Bank{}, fmt.Errorf("generated %d of %d requested %s questions", accepted, request.count, request.level)
		}
	}
	if err := VerifyBank(bank); err != nil {
		return Bank{}, err
	}
	return bank, nil
}

func applyDifficulty(question *Question) {
	factors := DifficultyFactors{Variables: len(question.Variables), Transformations: len(question.SolutionSteps)}
	for _, step := range question.SolutionSteps {
		if step.Kind == "substitute" {
			factors.Substitutions++
		}
		if step.Kind == "eliminate" {
			factors.Eliminations++
		}
		if step.Memory > factors.WorkingMemory {
			factors.WorkingMemory = step.Memory
		}
		if step.CoupledBranches > factors.CoupledBranches {
			factors.CoupledBranches = step.CoupledBranches
		}
		factors.SignedTerms += step.SignedTerms
		for _, operation := range step.Operations {
			factors.ArithmeticLoad += operationCost(operation)
		}
	}
	score := difficultyScore(factors)
	level := difficultyLevel(question, score, factors)
	question.Difficulty = Difficulty{
		Level: level, Score: score, Factors: factors,
		Rationale: fmt.Sprintf("%d variables, %d transformations, %d substitution steps, %d elimination steps, working-memory load %d, %d signed-term costs, %d coupled branches, and arithmetic load %d", factors.Variables, factors.Transformations, factors.Substitutions, factors.Eliminations, factors.WorkingMemory, factors.SignedTerms, factors.CoupledBranches, factors.ArithmeticLoad),
	}
}

func difficultyScore(factors DifficultyFactors) int {
	return factors.Variables - 1 + factors.Transformations + factors.Substitutions + factors.Eliminations + factors.WorkingMemory + factors.SignedTerms + factors.ArithmeticLoad
}

func difficultyLevel(question *Question, score int, factors DifficultyFactors) string {
	if score <= 9 {
		return "low"
	}
	if score <= 17 {
		return "medium"
	}
	if score >= ExtremeMinimumScore && extremeEligible(question, factors) {
		return "extreme"
	}
	return "high"
}

func extremeEligible(question *Question, factors DifficultyFactors) bool {
	return factors.Variables == 4 &&
		hasFourVariableCycle(question) &&
		factors.Transformations >= 4 &&
		factors.WorkingMemory >= 3 &&
		factors.CoupledBranches >= 2 &&
		factors.Substitutions+factors.Eliminations >= ExtremeMinimumActions &&
		(factors.SignedTerms >= 4 || factors.ArithmeticLoad >= 9)
}

func hasFourVariableCycle(question *Question) bool {
	if len(question.Variables) != 4 || len(question.Equations) != 4 {
		return false
	}
	degrees := make(map[string]int, 4)
	scaledTerm := false
	for _, equation := range question.Equations {
		termCount := 0
		for _, variable := range question.Variables {
			coefficient := equation.Coefficients[variable]
			if coefficient == 0 {
				continue
			}
			termCount++
			degrees[variable]++
			if abs(coefficient) > 1 {
				scaledTerm = true
			}
		}
		if termCount != 2 {
			return false
		}
	}
	for _, variable := range question.Variables {
		if degrees[variable] != 2 {
			return false
		}
	}
	return scaledTerm
}

func operationCost(operation Operation) int {
	a, b := abs(operation.Left), abs(operation.Right)
	switch operation.Operator {
	case "+", "-":
		if a == 0 || b == 0 {
			return 0
		}
		if a <= 10 && b <= 10 || a%10 == 0 || b%10 == 0 {
			return 1
		}
		return 2
	case "×":
		if a == 0 || b == 0 || a == 1 || b == 1 {
			return 0
		}
		if easyFactor(a) || easyFactor(b) {
			return 1
		}
		if a <= 10 && b <= 10 {
			return 2
		}
		if a%5 == 0 || b%5 == 0 {
			return 2
		}
		return 4
	case "/":
		if b == 0 {
			return 99
		}
		return operationCost(Operation{Operator: "×", Left: a / b, Right: b})
	}
	return 0
}

func easyFactor(value int) bool {
	return value == 2 || value == 5 || value == 10 || value == 11 || value == 20
}
func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func questionID(question Question) string {
	type identity struct {
		Equations []Equation `json:"equations"`
		Variables []string   `json:"variables"`
	}
	data, _ := json.Marshal(identity{question.Equations, question.Variables})
	digest := sha256.Sum256(data)
	return "DMAT-EQ-" + strings.ToUpper(hex.EncodeToString(digest[:6]))
}

func countSolutions(question Question, stopAfter int) int {
	values := make(map[string]int, len(question.Variables))
	count := 0
	var visit func(int)
	visit = func(index int) {
		if count >= stopAfter {
			return
		}
		if index == len(question.Variables) {
			if satisfies(question.Equations, values) {
				count++
			}
			return
		}
		variable := question.Variables[index]
		for value := 1; value <= 20; value++ {
			values[variable] = value
			visit(index + 1)
		}
	}
	visit(0)
	return count
}

func satisfies(equations []Equation, values map[string]int) bool {
	for _, equation := range equations {
		total := 0
		for variable, coefficient := range equation.Coefficients {
			total += coefficient * values[variable]
		}
		if total != equation.Constant {
			return false
		}
	}
	return true
}

func VerifyQuestion(question Question) error {
	if len(question.Variables) < 2 || len(question.Variables) > 4 || len(question.Equations) != len(question.Variables) {
		return fmt.Errorf("%s: variable/equation count is outside the supported shape", question.ID)
	}
	seen := map[string]bool{}
	for _, variable := range question.Variables {
		if variable < "A" || variable > "D" || seen[variable] {
			return fmt.Errorf("%s: invalid variable %q", question.ID, variable)
		}
		seen[variable] = true
		if question.Answer[variable] < 1 || question.Answer[variable] > 20 {
			return fmt.Errorf("%s: %s is outside 1..20", question.ID, variable)
		}
	}
	for _, equation := range question.Equations {
		if equation.Display == "" || len(equation.Coefficients) == 0 {
			return fmt.Errorf("%s: empty equation", question.ID)
		}
		for variable := range equation.Coefficients {
			if !seen[variable] {
				return fmt.Errorf("%s: equation uses unknown variable %s", question.ID, variable)
			}
		}
	}
	if !satisfies(question.Equations, question.Answer) {
		return fmt.Errorf("%s: recorded answer does not satisfy equations", question.ID)
	}
	if question.Validation.SolutionsInRange != 1 || countSolutions(question, 2) != 1 {
		return fmt.Errorf("%s: system is not unique in 1..20", question.ID)
	}
	allowedKinds := map[string]bool{"isolate": true, "substitute": true, "eliminate": true, "simplify": true}
	for index, step := range question.SolutionSteps {
		if step.Text == "" || !allowedKinds[step.Kind] || step.Memory < 1 || step.Memory > len(question.Variables) || step.SignedTerms < 0 || step.CoupledBranches < 0 || step.CoupledBranches > 2 {
			return fmt.Errorf("%s: invalid solution step %d", question.ID, index+1)
		}
		for _, operation := range step.Operations {
			if operation.Operator != "+" && operation.Operator != "-" && operation.Operator != "×" && operation.Operator != "/" {
				return fmt.Errorf("%s: invalid operation %q", question.ID, operation.Operator)
			}
			if operation.Operator == "/" && (operation.Right == 0 || operation.Left%operation.Right != 0) {
				return fmt.Errorf("%s: non-integral recorded division", question.ID)
			}
		}
	}
	copy := question
	applyDifficulty(&copy)
	if copy.Difficulty != question.Difficulty {
		return fmt.Errorf("%s: difficulty metadata is inconsistent", question.ID)
	}
	if question.Family == "" || question.Hint == "" || len(question.SolutionSteps) == 0 {
		return fmt.Errorf("%s: missing hint or solution", question.ID)
	}
	return nil
}

func VerifyBank(bank Bank) error {
	if bank.FormatVersion != FormatVersion || bank.GeneratorVersion != GeneratorVersion {
		return fmt.Errorf("unsupported bank version")
	}
	if len(bank.Questions) != bank.Settings.Low+bank.Settings.Medium+bank.Settings.High+bank.Settings.Extreme {
		return fmt.Errorf("question count does not match settings")
	}
	ids := map[string]bool{}
	counts := map[string]int{}
	for _, question := range bank.Questions {
		if ids[question.ID] {
			return fmt.Errorf("duplicate ID %s", question.ID)
		}
		ids[question.ID] = true
		if question.ID != questionID(question) {
			return fmt.Errorf("%s: content-derived ID mismatch", question.ID)
		}
		if err := VerifyQuestion(question); err != nil {
			return err
		}
		counts[question.Difficulty.Level]++
	}
	if counts["low"] != bank.Settings.Low || counts["medium"] != bank.Settings.Medium || counts["high"] != bank.Settings.High || counts["extreme"] != bank.Settings.Extreme {
		return fmt.Errorf("difficulty counts do not match settings")
	}
	return nil
}

func Marshal(bank Bank) ([]byte, error) {
	data, err := json.MarshalIndent(bank, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func Write(path string, bank Bank) error {
	if err := VerifyBank(bank); err != nil {
		return err
	}
	data, err := Marshal(bank)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".dmat-equation-generator-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func VerifyFile(path string) (int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	var bank Bank
	if err := json.Unmarshal(data, &bank); err != nil {
		return 0, err
	}
	if err := VerifyBank(bank); err != nil {
		return 0, err
	}
	return len(bank.Questions), nil
}

func SortedVariables(values map[string]int) []string {
	variables := make([]string, 0, len(values))
	for variable := range values {
		variables = append(variables, variable)
	}
	sort.Strings(variables)
	return variables
}
