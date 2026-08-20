package figureseq

const (
	Size             = 4
	ObservedFrames   = 4
	PredictedFrames  = 2
	OptionsPerFrame  = 3
	FormatVersion    = 1
	GeneratorVersion = 1
)

type Position struct {
	Row    int `json:"row"`
	Column int `json:"column"`
}

type Actor struct {
	ID    string `json:"id"`
	Shape string `json:"shape"`
}

type FigureState struct {
	ActorID  string `json:"actorId"`
	Row      int    `json:"row"`
	Column   int    `json:"column"`
	Color    string `json:"color"`
	Rotation int    `json:"rotation"`
}

type Frame struct {
	Figures []FigureState `json:"figures"`
}

type Program struct {
	ActorID            string     `json:"actorId"`
	Motion             string     `json:"motion"`
	Path               []Position `json:"path"`
	StartIndex         int        `json:"startIndex"`
	Direction          int        `json:"direction"`
	StepMode           string     `json:"stepMode"`
	StepSize           int        `json:"stepSize"`
	Colors             []string   `json:"colors"`
	ColorStart         int        `json:"colorStart"`
	RotationStart      int        `json:"rotationStart"`
	RotationStep       int        `json:"rotationStep"`
	RotationIncreasing bool       `json:"rotationIncreasing"`
	Explanation        string     `json:"explanation"`
}

type Question struct {
	FrameNumber int     `json:"frameNumber"`
	Options     []Frame `json:"options"`
	AnswerIndex int     `json:"answerIndex"`
}

type DifficultyComponents struct {
	ActorTracking       int `json:"actorTracking"`
	ChangingTracks      int `json:"changingTracks"`
	CoupledActors       int `json:"coupledActors"`
	IncrementalPrograms int `json:"incrementalPrograms"`
}

type Difficulty struct {
	Level       string               `json:"level"`
	Score       int                  `json:"score"`
	Provisional bool                 `json:"provisional"`
	Components  DifficultyComponents `json:"components"`
}

type Validation struct {
	FramesValid           bool `json:"framesValid"`
	OptionsUnique         bool `json:"optionsUnique"`
	ProgramsDeterministic bool `json:"programsDeterministic"`
	GeneratorVersion      int  `json:"generatorVersion"`
}

type Puzzle struct {
	ID             string     `json:"id"`
	Kind           string     `json:"kind"`
	GridSize       int        `json:"gridSize"`
	Actors         []Actor    `json:"actors"`
	ObservedFrames []Frame    `json:"observedFrames"`
	Questions      []Question `json:"questions"`
	Programs       []Program  `json:"programs"`
	Difficulty     Difficulty `json:"difficulty"`
	Hint           string     `json:"hint"`
	Validation     Validation `json:"validation"`
}

type Counts struct {
	Low    int `json:"low"`
	Medium int `json:"medium"`
	High   int `json:"high"`
}

type Settings struct {
	Seed   uint64 `json:"seed"`
	Counts Counts `json:"counts"`
}

type Bank struct {
	FormatVersion    int      `json:"formatVersion"`
	GeneratorVersion int      `json:"generatorVersion"`
	Settings         Settings `json:"settings"`
	Puzzles          []Puzzle `json:"puzzles"`
}
