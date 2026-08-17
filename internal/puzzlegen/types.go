package puzzlegen

const (
	FormatVersion    = 1
	GeneratorVersion = 1
	RulesVersion     = 1
	StepScalar       = 2
	Size             = 5
)

var Symbols = [Size]string{"A", "B", "C", "D", "E"}

type Grid [Size][Size]string

type Counts struct {
	Easy    uint `json:"easy"`
	Exam    uint `json:"exam"`
	Hard    uint `json:"hard"`
	Extreme uint `json:"extreme"`
}

func (c Counts) Total() uint { return c.Easy + c.Exam + c.Hard + c.Extreme }

func (c Counts) For(level string) uint {
	switch level {
	case "easy":
		return c.Easy
	case "exam":
		return c.Exam
	case "hard":
		return c.Hard
	case "extreme":
		return c.Extreme
	default:
		return 0
	}
}

type Settings struct {
	Seed                uint64 `json:"seed"`
	Counts              Counts `json:"counts"`
	MaximumAttempts     uint   `json:"maximumAttempts"`
	MaximumSearchStates uint   `json:"maximumSearchStates"`
	MaximumSearchDepth  uint   `json:"maximumSearchDepth"`
	MinimumGivens       uint   `json:"minimumGivens"`
	MaximumGivens       uint   `json:"maximumGivens"`
}

type Bank struct {
	FormatVersion    int      `json:"formatVersion"`
	GeneratorVersion int      `json:"generatorVersion"`
	Settings         Settings `json:"settings"`
	Puzzles          []Puzzle `json:"puzzles"`
}

type Cell struct {
	Row    int    `json:"row"`
	Column int    `json:"column"`
	Value  string `json:"value,omitempty"`
}

type Target struct {
	Row    int    `json:"row"`
	Column int    `json:"column"`
	Value  string `json:"value"`
}

type Unit struct {
	Type  string `json:"type"`
	Index int    `json:"index"`
}

type BlockedBy struct {
	Row    int `json:"row"`
	Column int `json:"column"`
}

type Elimination struct {
	Row       *int      `json:"row,omitempty"`
	Column    *int      `json:"column,omitempty"`
	Value     string    `json:"value,omitempty"`
	BlockedBy BlockedBy `json:"blockedBy"`
}

type Inference struct {
	Rule              string        `json:"rule"`
	Weight            int           `json:"weight"`
	Unit              Unit          `json:"unit"`
	K                 int           `json:"k"`
	MissingCandidates []string      `json:"missingCandidates"`
	SelectedCandidate string        `json:"selectedCandidate,omitempty"`
	SelectedCell      *Cell         `json:"selectedCell,omitempty"`
	Eliminations      []Elimination `json:"eliminations,omitempty"`
	Placement         Cell          `json:"placement"`
	Details           string        `json:"details"`
}

type Difficulty struct {
	TargetCell   string `json:"targetCell"`
	Score        int    `json:"score"`
	Level        string `json:"level"`
	RulesVersion int    `json:"rulesVersion"`
}

type Hint struct {
	Row    int    `json:"row"`
	Column int    `json:"column"`
	Value  string `json:"value"`
	Text   string `json:"text"`
}

type Hints struct {
	TargetCell []Hint `json:"targetCell"`
}

type Validation struct {
	SolutionCount int `json:"solutionCount"`
	Givens        int `json:"givens"`
}

type Puzzle struct {
	ID         string      `json:"id"`
	Grid       Grid        `json:"grid"`
	Target     Target      `json:"target"`
	Answer     string      `json:"answer"`
	Solution   Grid        `json:"solution"`
	Difficulty Difficulty  `json:"difficulty"`
	BestMethod []Inference `json:"bestMethod"`
	Hints      Hints       `json:"hints"`
	Validation Validation  `json:"validation"`
}

type Catalogue struct {
	FormatVersion int               `json:"formatVersion"`
	Symbols       [Size]string      `json:"symbols"`
	Squares       []CatalogueSquare `json:"squares"`
}

type CatalogueSquare struct {
	ID   string `json:"id"`
	Grid Grid   `json:"grid"`
}

type Rejections struct {
	Ambiguous          uint
	Unrated            uint
	Duplicate          uint
	UnwantedDifficulty uint
}

type Report struct {
	Attempts   uint
	Accepted   Counts
	Rejections Rejections
}
