package puzzlegen

import "container/heap"

type searchNode struct {
	grid  Grid
	cost  int
	depth uint
	path  []Inference
	seq   uint64
	index int
}

type nodeHeap []*searchNode

func (h nodeHeap) Len() int { return len(h) }
func (h nodeHeap) Less(i, j int) bool {
	if h[i].cost != h[j].cost {
		return h[i].cost < h[j].cost
	}
	return h[i].seq < h[j].seq
}
func (h nodeHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i]; h[i].index, h[j].index = i, j }
func (h *nodeHeap) Push(value any) {
	node := value.(*searchNode)
	node.index = len(*h)
	*h = append(*h, node)
}
func (h *nodeHeap) Pop() any {
	old := *h
	node := old[len(old)-1]
	old[len(old)-1] = nil
	*h = old[:len(old)-1]
	return node
}

type SearchResult struct {
	Found          bool
	LimitExhausted bool
	Score          int
	Path           []Inference
	States         uint
}

func ScoreTarget(grid Grid, targetRow, targetColumn int, maximumStates, maximumDepth uint) SearchResult {
	if targetRow < 0 || targetRow >= Size || targetColumn < 0 || targetColumn >= Size || maximumStates == 0 {
		return SearchResult{LimitExhausted: true}
	}
	queue := &nodeHeap{}
	heap.Init(queue)
	heap.Push(queue, &searchNode{grid: grid, seq: 0})
	distance := map[string]int{gridKey(grid): 0}
	admitted := map[string]bool{gridKey(grid): true}
	states := uint(1)
	sequence := uint64(1)
	for queue.Len() > 0 {
		// The source counts as a state. Hitting the configured count before a
		// target node is removed is exhaustion, even if that target is queued.
		if states >= maximumStates {
			return SearchResult{LimitExhausted: true, States: states}
		}
		current := heap.Pop(queue).(*searchNode)
		if best, ok := distance[gridKey(current.grid)]; !ok || current.cost != best {
			continue
		}
		if current.grid[targetRow][targetColumn] != "" {
			return SearchResult{Found: true, Score: current.cost, Path: current.path, States: states}
		}
		if current.depth == maximumDepth {
			continue
		}
		for _, inference := range EnumerateInferences(current.grid) {
			next, err := applyInference(current.grid, inference)
			if err != nil {
				continue
			}
			key := gridKey(next)
			cost := current.cost + inference.Weight + StepScalar
			oldCost, known := distance[key]
			if known && oldCost <= cost {
				continue
			}
			if !admitted[key] {
				admitted[key] = true
				states++
				if states >= maximumStates {
					return SearchResult{LimitExhausted: true, States: states}
				}
			}
			distance[key] = cost
			path := append(append([]Inference(nil), current.path...), inference)
			heap.Push(queue, &searchNode{grid: next, cost: cost, depth: current.depth + 1, path: path, seq: sequence})
			sequence++
		}
	}
	return SearchResult{States: states}
}

func Classify(score int) string {
	switch {
	case score <= 6:
		return "easy"
	case score <= 12:
		return "exam"
	case score <= 18:
		return "hard"
	default:
		return "extreme"
	}
}
