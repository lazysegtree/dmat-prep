package equationgen

import (
	"fmt"
	"strings"
)

type linearTerm struct {
	variable    string
	coefficient int
}

type linearExpr struct {
	terms    []linearTerm
	constant int
}

func term(coefficient int, variable string) linearTerm {
	return linearTerm{variable: variable, coefficient: coefficient}
}

func expression(constant int, terms ...linearTerm) linearExpr {
	return linearExpr{terms: terms, constant: constant}
}

func buildEquation(left, right linearExpr) Equation {
	coefficients := map[string]int{}
	for _, item := range left.terms {
		coefficients[item.variable] += item.coefficient
	}
	for _, item := range right.terms {
		coefficients[item.variable] -= item.coefficient
	}
	for variable, coefficient := range coefficients {
		if coefficient == 0 {
			delete(coefficients, variable)
		}
	}
	return Equation{
		Display:      renderExpression(left) + " = " + renderExpression(right),
		Coefficients: coefficients,
		Constant:     right.constant - left.constant,
	}
}

func renderExpression(value linearExpr) string {
	parts := make([]string, 0, len(value.terms)+1)
	appendPart := func(coefficient int, body string) {
		if coefficient == 0 {
			return
		}
		magnitude := abs(coefficient)
		piece := body
		if body != "" && magnitude != 1 {
			piece = fmt.Sprintf("%d × %s", magnitude, body)
		}
		if body == "" {
			piece = fmt.Sprintf("%d", magnitude)
		}
		if len(parts) == 0 {
			if coefficient < 0 {
				parts = append(parts, "-"+piece)
			} else {
				parts = append(parts, piece)
			}
			return
		}
		if coefficient < 0 {
			parts = append(parts, "- "+piece)
		} else {
			parts = append(parts, "+ "+piece)
		}
	}
	for _, item := range value.terms {
		appendPart(item.coefficient, item.variable)
	}
	appendPart(value.constant, "")
	if len(parts) == 0 {
		return "0"
	}
	return strings.Join(parts, " ")
}

func makeStep(kind string, memory, signedTerms int, text string, operations ...Operation) Step {
	return Step{Text: text, Kind: kind, Memory: memory, SignedTerms: signedTerms, Operations: operations}
}

func makeCoupledStep(kind string, memory, signedTerms int, text string, operations ...Operation) Step {
	step := makeStep(kind, memory, signedTerms, text, operations...)
	step.CoupledBranches = 2
	return step
}

func operation(operator string, left, right int) Operation {
	return Operation{Operator: operator, Left: left, Right: right}
}

func generateCandidate(rng *splitMix64) Question {
	switch rng.n(13) {
	case 0:
		return generateIndependentAnchors(rng, 2+rng.n(2))
	case 1:
		return generateAnchoredChain(rng, 2+rng.n(3))
	case 2:
		return generateAffineChain(rng, 2+rng.n(3))
	case 3:
		return generateSumDifference(rng, 2+rng.n(3))
	case 4:
		return generateSubstitutionPair(rng, 2+rng.n(3))
	case 5:
		return generateBothSides(rng, 2+rng.n(3))
	case 6:
		return generateSharedCancellation(rng, 3+rng.n(2))
	case 7:
		return generateNearCancellation(rng, 2+rng.n(3))
	case 8:
		return generateScaledSum(rng, 2+rng.n(3))
	case 9:
		return generateTriangleSums(rng, 3+rng.n(2))
	case 10:
		return generateDifferenceCycle(rng, 3+rng.n(2))
	case 11:
		return generateCoupledBranches(rng)
	default:
		return generateCrossCoupled(rng)
	}
}

func candidateData(rng *splitMix64, count int) ([]string, []string, map[string]int) {
	variables := []string{"A", "B", "C", "D"}[:count]
	roles := append([]string(nil), variables...)
	rng.shuffleStrings(roles)
	answers := make(map[string]int, count)
	for _, variable := range variables {
		answers[variable] = rng.between(2, 10)
	}
	return variables, roles, answers
}

func finishCandidate(rng *splitMix64, family, hint string, variables []string, answers map[string]int, equations []Equation, steps []Step) Question {
	rng.shuffleEquations(equations)
	return Question{
		Family: family, Variables: variables, Equations: equations, Answer: answers,
		Hint: hint, SolutionSteps: steps,
	}
}

func anchorEquation(rng *splitMix64, variable string, value int) (Equation, Step) {
	offset := rng.between(2, 6)
	left := expression(offset, term(1, variable))
	right := expression(value + offset)
	if rng.n(2) == 0 {
		left, right = right, left
	}
	return buildEquation(left, right), makeStep(
		"isolate", 1, 0,
		fmt.Sprintf("Use the direct equation to subtract %d and get %s = %d.", offset, variable, value),
		operation("-", value+offset, offset),
	)
}

func appendDependent(rng *splitMix64, equations []Equation, steps []Step, variable, parent string, answers map[string]int, memory int) ([]Equation, []Step) {
	difference := answers[variable] - answers[parent]
	equations = append(equations, buildEquation(
		expression(0, term(1, variable), term(-1, parent)),
		expression(difference),
	))
	steps = append(steps, makeStep(
		"substitute", memory, boolInt(difference < 0),
		fmt.Sprintf("Substitute %s = %d into %s - %s = %d to get %s = %d.", parent, answers[parent], variable, parent, difference, variable, answers[variable]),
		operation("+", answers[parent], difference),
	))
	return equations, steps
}

func generateIndependentAnchors(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	equations := make([]Equation, 0, count)
	steps := make([]Step, 0, count)
	for _, variable := range roles {
		equation, step := anchorEquation(rng, variable, answers[variable])
		equations = append(equations, equation)
		steps = append(steps, step)
	}
	return finishCandidate(rng, "independent-anchors", "Several equations can be solved directly; start with whichever arithmetic is most comfortable.", variables, answers, equations, steps)
}

func generateAnchoredChain(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	anchor, firstStep := anchorEquation(rng, roles[0], answers[roles[0]])
	equations := []Equation{anchor}
	steps := []Step{firstStep}
	for index := 1; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[index-1], answers, min(index+1, 3))
	}
	return finishCandidate(rng, "anchored-chain", "Find the one directly solvable letter, then follow the dependency chain. Equation order is not chain order.", variables, answers, equations, steps)
}

func generateAffineChain(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	anchor, firstStep := anchorEquation(rng, roles[0], answers[roles[0]])
	equations := []Equation{anchor}
	steps := []Step{firstStep}
	for index := 1; index < len(roles); index++ {
		parent, variable := roles[index-1], roles[index]
		factor := rng.between(2, 4)
		offset := factor*answers[parent] - answers[variable]
		equations = append(equations, buildEquation(
			expression(offset, term(1, variable)),
			expression(0, term(factor, parent)),
		))
		steps = append(steps, makeStep(
			"substitute", min(index+1, 3), boolInt(offset < 0),
			fmt.Sprintf("Substitute %s = %d, calculate %d × %d, and isolate %s = %d.", parent, answers[parent], factor, answers[parent], variable, answers[variable]),
			operation("×", factor, answers[parent]), operation("-", factor*answers[parent], offset),
		))
	}
	return finishCandidate(rng, "affine-chain", "Start with the direct equation. Each remaining relationship contains one value already found and one new letter.", variables, answers, equations, steps)
}

func generateSumDifference(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y := roles[0], roles[1]
	sum, difference := answers[x]+answers[y], answers[x]-answers[y]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(1, y)), expression(sum)),
		buildEquation(expression(0, term(1, x), term(-1, y)), expression(difference)),
	}
	steps := []Step{
		makeStep("eliminate", 2, 1, fmt.Sprintf("Add the two equations to eliminate %s: 2 × %s = %d, so %s = %d.", y, x, sum+difference, x, answers[x]), operation("+", sum, difference), operation("/", sum+difference, 2)),
		makeStep("substitute", 2, 0, fmt.Sprintf("Substitute %s = %d into %s + %s = %d to get %s = %d.", x, answers[x], x, y, sum, y, answers[y]), operation("-", sum, answers[x])),
	}
	for index := 2; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[(index-2)%2], answers, 3)
	}
	return finishCandidate(rng, "sum-difference", "Look for two equations whose addition or subtraction removes one letter.", variables, answers, equations, steps)
}

func generateSubstitutionPair(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y := roles[0], roles[1]
	factor := rng.between(2, 4)
	offset := answers[x] - factor*answers[y]
	sum := answers[x] + answers[y]
	equations := []Equation{
		buildEquation(expression(0, term(1, x)), expression(offset, term(factor, y))),
		buildEquation(expression(0, term(1, x), term(1, y)), expression(sum)),
	}
	steps := []Step{
		makeStep("substitute", 2, boolInt(offset < 0), fmt.Sprintf("Replace %s with %d × %s %+d in the sum equation.", x, factor, y, offset)),
		makeStep("isolate", 2, boolInt(offset < 0), fmt.Sprintf("Solve %d × %s %+d = %d to get %s = %d.", factor+1, y, offset, sum, y, answers[y]), operation("-", sum, offset), operation("/", sum-offset, factor+1)),
		makeStep("substitute", 2, boolInt(offset < 0), fmt.Sprintf("Use %s = %d in %s = %d × %s %+d to get %s = %d.", y, answers[y], x, factor, y, offset, x, answers[x]), operation("×", factor, answers[y]), operation("+", factor*answers[y], offset)),
	}
	for index := 2; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[index%2], answers, 3)
	}
	return finishCandidate(rng, "substitution-pair", "One equation already expresses a letter in terms of another. Put that expression into the sum equation.", variables, answers, equations, steps)
}

func generateBothSides(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y := roles[0], roles[1]
	sum, difference := answers[x]+answers[y], answers[y]-answers[x]
	equations := []Equation{
		buildEquation(expression(0, term(2, x), term(1, y)), expression(sum, term(1, x))),
		buildEquation(expression(0, term(1, y), term(-1, x)), expression(difference)),
	}
	steps := []Step{
		makeStep("simplify", 2, 1, fmt.Sprintf("Subtract %s from both sides of 2 × %s + %s = %d + %s; it becomes %s + %s = %d.", x, x, y, sum, x, x, y, sum)),
		makeStep("substitute", 2, 1, fmt.Sprintf("From %s - %s = %d, use %s = %s %+d in the simplified sum.", y, x, difference, y, x, difference)),
		makeStep("isolate", 2, boolInt(difference < 0), fmt.Sprintf("Solve 2 × %s %+d = %d to get %s = %d, then %s = %d.", x, difference, sum, x, answers[x], y, answers[y]), operation("-", sum, difference), operation("/", sum-difference, 2), operation("+", answers[x], difference)),
	}
	for index := 2; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[index%2], answers, 3)
	}
	return finishCandidate(rng, "variables-both-sides", "First simplify the equation that has the same letter on both sides.", variables, answers, equations, steps)
}

func generateSharedCancellation(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y, z := roles[0], roles[1], roles[2]
	pair := answers[x] + answers[y]
	total := pair + answers[z]
	difference := answers[x] - answers[y]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(1, y), term(1, z)), expression(total)),
		buildEquation(expression(0, term(1, x), term(1, y)), expression(pair)),
		buildEquation(expression(0, term(1, x), term(-1, y)), expression(difference)),
	}
	steps := []Step{
		makeStep("eliminate", 3, 0, fmt.Sprintf("Subtract the shared %s + %s equation from the three-letter equation to get %s = %d.", x, y, z, answers[z]), operation("-", total, pair)),
		makeStep("eliminate", 2, 1, fmt.Sprintf("Add %s + %s = %d and %s - %s = %d to get %s = %d.", x, y, pair, x, y, difference, x, answers[x]), operation("+", pair, difference), operation("/", pair+difference, 2)),
		makeStep("substitute", 2, 0, fmt.Sprintf("Use %s = %d in the pair sum to get %s = %d.", x, answers[x], y, answers[y]), operation("-", pair, answers[x])),
	}
	if count == 4 {
		equations, steps = appendDependent(rng, equations, steps, roles[3], z, answers, 3)
	}
	return finishCandidate(rng, "shared-term-cancellation", "Two equations share the same group of terms. Subtract them before doing any substitution.", variables, answers, equations, steps)
}

func generateNearCancellation(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y := roles[0], roles[1]
	first, second := 2*answers[x]+answers[y], answers[x]+answers[y]
	equations := []Equation{
		buildEquation(expression(0, term(2, x), term(1, y)), expression(first)),
		buildEquation(expression(0, term(1, x), term(1, y)), expression(second)),
	}
	steps := []Step{
		makeStep("eliminate", 2, 0, fmt.Sprintf("Subtract the two equations; every %s term cancels and %s = %d.", y, x, answers[x]), operation("-", first, second)),
		makeStep("substitute", 2, 0, fmt.Sprintf("Use %s = %d in %s + %s = %d to get %s = %d.", x, answers[x], x, y, second, y, answers[y]), operation("-", second, answers[x])),
	}
	for index := 2; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[index%2], answers, 3)
	}
	return finishCandidate(rng, "near-cancellation", "Compare the two similar equations instead of solving either one in isolation.", variables, answers, equations, steps)
}

func generateScaledSum(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y := roles[0], roles[1]
	sum, difference := answers[x]+answers[y], answers[x]-answers[y]
	equations := []Equation{
		buildEquation(expression(0, term(2, x), term(2, y)), expression(2*sum)),
		buildEquation(expression(0, term(1, x), term(-1, y)), expression(difference)),
	}
	steps := []Step{
		makeStep("simplify", 2, 0, fmt.Sprintf("Divide 2 × %s + 2 × %s = %d by 2 to get %s + %s = %d.", x, y, 2*sum, x, y, sum), operation("/", 2*sum, 2)),
		makeStep("eliminate", 2, 1, fmt.Sprintf("Add the simplified sum and the difference equation to get %s = %d.", x, answers[x]), operation("+", sum, difference), operation("/", sum+difference, 2)),
		makeStep("substitute", 2, 0, fmt.Sprintf("Use %s = %d in the sum to get %s = %d.", x, answers[x], y, answers[y]), operation("-", sum, answers[x])),
	}
	for index := 2; index < len(roles); index++ {
		equations, steps = appendDependent(rng, equations, steps, roles[index], roles[index%2], answers, 3)
	}
	return finishCandidate(rng, "scaled-sum", "Simplify the equation with a common factor before combining it with the difference equation.", variables, answers, equations, steps)
}

func generateTriangleSums(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y, z := roles[0], roles[1], roles[2]
	xy, yz, xz := answers[x]+answers[y], answers[y]+answers[z], answers[x]+answers[z]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(1, y)), expression(xy)),
		buildEquation(expression(0, term(1, y), term(1, z)), expression(yz)),
		buildEquation(expression(0, term(1, x), term(1, z)), expression(xz)),
	}
	combined := xy + yz - xz
	steps := []Step{
		makeStep("eliminate", 3, 1, fmt.Sprintf("Add the %s + %s and %s + %s sums, then subtract %s + %s; only 2 × %s remains, so %s = %d.", x, y, y, z, x, z, y, y, answers[y]), operation("+", xy, yz), operation("-", xy+yz, xz), operation("/", combined, 2)),
		makeStep("substitute", 2, 0, fmt.Sprintf("Use %s = %d in %s + %s = %d to get %s = %d.", y, answers[y], x, y, xy, x, answers[x]), operation("-", xy, answers[y])),
		makeStep("substitute", 2, 0, fmt.Sprintf("Use %s = %d in %s + %s = %d to get %s = %d.", y, answers[y], y, z, yz, z, answers[z]), operation("-", yz, answers[y])),
	}
	if count == 4 {
		equations, steps = appendDependent(rng, equations, steps, roles[3], roles[rng.n(3)], answers, 3)
	}
	return finishCandidate(rng, "triangle-pair-sums", "All three equations are pair sums. Combine all three so that two letters cancel.", variables, answers, equations, steps)
}

func generateDifferenceCycle(rng *splitMix64, count int) Question {
	variables, roles, answers := candidateData(rng, count)
	x, y, z := roles[0], roles[1], roles[2]
	dxy, dyz := answers[x]-answers[y], answers[y]-answers[z]
	total := answers[x] + answers[y] + answers[z]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(-1, y)), expression(dxy)),
		buildEquation(expression(0, term(1, y), term(-1, z)), expression(dyz)),
		buildEquation(expression(0, term(1, x), term(1, y), term(1, z)), expression(total)),
	}
	constant := dxy + 2*dyz
	steps := []Step{
		makeStep("substitute", 3, 2, fmt.Sprintf("Write %s = %s %+d and %s = %s %+d, then express both in terms of %s.", y, z, dyz, x, y, dxy, z)),
		makeStep("isolate", 3, 2, fmt.Sprintf("Substitute those expressions into the total: 3 × %s %+d = %d, so %s = %d.", z, constant, total, z, answers[z]), operation("-", total, constant), operation("/", total-constant, 3)),
		makeStep("substitute", 2, boolInt(dyz < 0), fmt.Sprintf("Use %s = %d to get %s = %d, then %s = %d.", z, answers[z], y, answers[y], x, answers[x]), operation("+", answers[z], dyz), operation("+", answers[y], dxy)),
	}
	if count == 4 {
		equations, steps = appendDependent(rng, equations, steps, roles[3], roles[rng.n(3)], answers, 3)
	}
	return finishCandidate(rng, "difference-cycle", "Turn the two difference equations into expressions for the three-letter total.", variables, answers, equations, steps)
}

func generateCoupledBranches(rng *splitMix64) Question {
	variables, roles, answers := candidateData(rng, 4)
	x, y, z, w := roles[0], roles[1], roles[2], roles[3]
	xFactor, wFactor := rng.between(2, 4), rng.between(2, 4)
	xySum := answers[x] + answers[y]
	ywSum := answers[y] + answers[w]
	zwOffset := answers[z] - wFactor*answers[w]
	xzTotal := xFactor*answers[x] + answers[z]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(1, y)), expression(xySum)),
		buildEquation(expression(0, term(1, z), term(-wFactor, w)), expression(zwOffset)),
		buildEquation(expression(0, term(1, y), term(1, w)), expression(ywSum)),
		buildEquation(expression(0, term(xFactor, x), term(1, z)), expression(xzTotal)),
	}
	firstProduct := xFactor * xySum
	secondProduct := wFactor * ywSum
	partial := firstProduct + zwOffset
	combined := partial + secondProduct
	numerator := combined - xzTotal
	steps := []Step{
		makeCoupledStep("isolate", 3, 2, fmt.Sprintf("Build two branches around %s: %s = %d - %s and %s = %d - %s.", y, x, xySum, y, w, ywSum, y)),
		makeCoupledStep("substitute", 4, 2, fmt.Sprintf("Use %s = %d - %s in %s - %d × %s = %d, giving a second expression in %s.", w, ywSum, y, z, wFactor, w, zwOffset, y)),
		makeCoupledStep(
			"eliminate", 4, 4,
			fmt.Sprintf("Put both branches into %d × %s + %s = %d. After collecting terms, %d × %s = %d, so %s = %d.", xFactor, x, z, xzTotal, xFactor+wFactor, y, numerator, y, answers[y]),
			operation("×", xFactor, xySum), operation("×", wFactor, ywSum), operation("+", firstProduct, zwOffset), operation("+", partial, secondProduct), operation("-", combined, xzTotal), operation("/", numerator, xFactor+wFactor),
		),
		makeCoupledStep(
			"substitute", 4, boolInt(zwOffset < 0),
			fmt.Sprintf("Back-substitute %s = %d to get %s = %d, %s = %d, and %s = %d.", y, answers[y], x, answers[x], w, answers[w], z, answers[z]),
			operation("-", xySum, answers[y]), operation("-", ywSum, answers[y]), operation("×", wFactor, answers[w]), operation("+", zwOffset, wFactor*answers[w]),
		),
	}
	return finishCandidate(rng, "coupled-branches", "Create expressions from the two pair equations, then combine both branches in the scaled equation.", variables, answers, equations, steps)
}

func generateCrossCoupled(rng *splitMix64) Question {
	variables, roles, answers := candidateData(rng, 4)
	x, y, z, w := roles[0], roles[1], roles[2], roles[3]
	wFactor := rng.between(2, 3)
	yFactor := wFactor + 2 + rng.n(2)
	xySum := answers[x] + answers[y]
	zwSum := answers[z] + answers[w]
	xzSum := answers[x] + answers[z]
	weightedTotal := yFactor*answers[y] + wFactor*answers[w]
	equations := []Equation{
		buildEquation(expression(0, term(1, x), term(1, y)), expression(xySum)),
		buildEquation(expression(0, term(1, z), term(1, w)), expression(zwSum)),
		buildEquation(expression(0, term(1, x), term(1, z)), expression(xzSum)),
		buildEquation(expression(0, term(yFactor, y), term(wFactor, w)), expression(weightedTotal)),
	}
	wConstant := zwSum - xzSum + xySum
	weightedConstant := wFactor * wConstant
	numerator := weightedTotal - weightedConstant
	steps := []Step{
		makeCoupledStep("isolate", 3, 2, fmt.Sprintf("Start two branches: %s = %d - %s and %s = %d - %s.", x, xySum, y, w, zwSum, z)),
		makeCoupledStep("substitute", 4, 3, fmt.Sprintf("Use the first branch in %s + %s = %d, then feed the resulting %s expression into the second branch so both depend on %s.", x, z, xzSum, z, y)),
		makeCoupledStep(
			"eliminate", 4, 3,
			fmt.Sprintf("Substitute the %s branch into %d × %s + %d × %s = %d. Collect terms to get %d × %s = %d, so %s = %d.", w, yFactor, y, wFactor, w, weightedTotal, yFactor-wFactor, y, numerator, y, answers[y]),
			operation("×", wFactor, wConstant), operation("-", weightedTotal, weightedConstant), operation("/", numerator, yFactor-wFactor),
		),
		makeCoupledStep(
			"substitute", 4, 0,
			fmt.Sprintf("Back-substitute %s = %d to get %s = %d, %s = %d, and %s = %d.", y, answers[y], x, answers[x], z, answers[z], w, answers[w]),
			operation("-", xySum, answers[y]), operation("-", xzSum, answers[x]), operation("-", zwSum, answers[z]),
		),
	}
	return finishCandidate(rng, "cross-coupled-sums", "Express the two outer letters through the pair sums, then use the weighted equation to solve the shared pivot.", variables, answers, equations, steps)
}

func (r *splitMix64) shuffleStrings(values []string) {
	for index := len(values) - 1; index > 0; index-- {
		swap := r.n(index + 1)
		values[index], values[swap] = values[swap], values[index]
	}
}

func (r *splitMix64) shuffleEquations(values []Equation) {
	for index := len(values) - 1; index > 0; index-- {
		swap := r.n(index + 1)
		values[index], values[swap] = values[swap], values[index]
	}
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
