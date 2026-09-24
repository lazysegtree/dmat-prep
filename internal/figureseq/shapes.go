package figureseq

// Period is the smallest visually identical rotation. Only figures with a
// 360-degree period get rotation tracks; symmetric figures still move/change colour.
type shapeDefinition struct {
	Name   string
	Period int
}

var shapeCatalog = []shapeDefinition{
	{"arrow", 360}, {"triangle", 360}, {"corner", 360}, {"chevron", 360},
	// Additional silhouettes from the supplied sample exercises.
	{"square", 90}, {"hexagon", 180}, {"diamond-cross", 90},
	{"bent-corner", 360}, {"trapezoid", 360}, {"arch", 360},
	// Additional practice silhouettes with an unambiguous orientation.
	{"flag", 360}, {"lightning", 360}, {"teardrop", 360}, {"crescent", 360},
	{"notched-square", 360}, {"hook", 360}, {"semicircle", 360}, {"fork", 360},
}

func shapePeriod(shape string) int {
	for _, definition := range shapeCatalog {
		if definition.Name == shape {
			return definition.Period
		}
	}
	return 0
}

func visualFrameKey(frame Frame, actors []Actor) string {
	visual := cloneFrame(frame)
	for index := range visual.Figures {
		visual.Figures[index].Rotation = mod(visual.Figures[index].Rotation, shapePeriod(actors[index].Shape))
	}
	return frameKey(visual)
}

// Balance exposure per difficulty, randomizing ties. Select rotation roles
// first so symmetric figures cannot consume the only non-rotating role.
func chooseShapes(programs []Program, usage map[string]int, rng *splitMix64) []Actor {
	actors := make([]Actor, len(programs))
	used := map[string]bool{}
	for _, rotating := range []bool{true, false} {
		for index, program := range programs {
			if (program.RotationStep != 0) != rotating {
				continue
			}
			minimum := int(^uint(0) >> 1)
			var choices []string
			for _, shape := range shapeCatalog {
				if used[shape.Name] || (rotating && shape.Period != 360) {
					continue
				}
				if usage[shape.Name] < minimum {
					minimum, choices = usage[shape.Name], nil
				}
				if usage[shape.Name] == minimum {
					choices = append(choices, shape.Name)
				}
			}
			shape := choices[rng.rangeN(len(choices))]
			actors[index] = Actor{ID: shape + " figure", Shape: shape}
			used[shape] = true
		}
	}
	return actors
}
