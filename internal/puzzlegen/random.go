package puzzlegen

type splitMix64 struct{ state uint64 }

func newSplitMix64(seed uint64) *splitMix64 { return &splitMix64{state: seed} }

func (r *splitMix64) next() uint64 {
	r.state += 0x9E3779B97F4A7C15
	z := r.state
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

func (r *splitMix64) rangeN(n uint64) uint64 {
	if n == 0 {
		panic("rangeN called with zero")
	}
	threshold := -n % n
	for {
		x := r.next()
		if x >= threshold {
			return x % n
		}
	}
}

func (r *splitMix64) shuffle(values []int) {
	for i := len(values) - 1; i > 0; i-- {
		j := int(r.rangeN(uint64(i + 1)))
		values[i], values[j] = values[j], values[i]
	}
}
