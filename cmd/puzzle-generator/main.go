package main

import (
	"flag"
	"fmt"
	"os"

	"dmat-prep/internal/puzzlegen"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	flags := flag.NewFlagSet("puzzle-generator", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	verify := flags.Bool("verify", false, "verify existing puzzle and catalogue JSON files")
	puzzlesOut := flags.String("puzzles-out", "", "puzzle-bank JSON path")
	catalogueOut := flags.String("catalogue-out", "", "reduced-square catalogue JSON path")
	seed := flags.Uint64("seed", 0, "SplitMix64 seed")
	countEasy := flags.Uint("count-easy", 0, "number of easy puzzles")
	countExam := flags.Uint("count-exam", 0, "number of exam puzzles")
	countHard := flags.Uint("count-hard", 0, "number of hard puzzles")
	countExtreme := flags.Uint("count-extreme", 0, "number of extreme puzzles")
	maximumAttempts := flags.Uint("max-attempts", 0, "maximum candidate attempts")
	maximumSearchStates := flags.Uint("max-search-states", 10000, "maximum distinct Dijkstra states per candidate")
	maximumSearchDepth := flags.Uint("max-search-depth", 0, "maximum Dijkstra inference depth")
	minimumGivens := flags.Uint("min-givens", 8, "minimum inclusive givens")
	maximumGivens := flags.Uint("max-givens", 15, "maximum inclusive givens")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments: %v", flags.Args())
	}
	if *puzzlesOut == "" || *catalogueOut == "" {
		return fmt.Errorf("--puzzles-out and --catalogue-out are required")
	}
	set := map[string]bool{}
	flags.Visit(func(item *flag.Flag) { set[item.Name] = true })
	if *verify {
		for _, name := range []string{"seed", "count-easy", "count-exam", "count-hard", "count-extreme", "max-attempts", "max-search-states", "max-search-depth", "min-givens", "max-givens"} {
			if set[name] {
				return fmt.Errorf("--%s conflicts with --verify", name)
			}
		}
		puzzles, squares, err := puzzlegen.VerifyFiles(*puzzlesOut, *catalogueOut)
		if err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "verified %d puzzles and %d reduced Latin squares\n", puzzles, squares)
		return nil
	}
	for _, name := range []string{"seed", "count-easy", "count-exam", "count-hard", "count-extreme", "max-attempts", "max-search-depth"} {
		if !set[name] {
			return fmt.Errorf("--%s is required in generation mode", name)
		}
	}
	settings := puzzlegen.Settings{
		Seed: *seed,
		Counts: puzzlegen.Counts{
			Easy: *countEasy, Exam: *countExam, Hard: *countHard, Extreme: *countExtreme,
		},
		MaximumAttempts: *maximumAttempts, MaximumSearchStates: *maximumSearchStates,
		MaximumSearchDepth: *maximumSearchDepth, MinimumGivens: *minimumGivens, MaximumGivens: *maximumGivens,
	}
	bank, catalogue, report, err := puzzlegen.Generate(settings)
	if err != nil {
		printReport(report)
		return err
	}
	if err := puzzlegen.WriteOutputs(*puzzlesOut, *catalogueOut, bank, catalogue); err != nil {
		return err
	}
	printReport(report)
	return nil
}

func printReport(report puzzlegen.Report) {
	fmt.Fprintf(os.Stderr, "attempts=%d accepted[easy=%d exam=%d hard=%d extreme=%d] rejected[ambiguous=%d unrated=%d duplicate=%d unwanted-difficulty=%d]\n",
		report.Attempts,
		report.Accepted.Easy, report.Accepted.Exam, report.Accepted.Hard, report.Accepted.Extreme,
		report.Rejections.Ambiguous, report.Rejections.Unrated, report.Rejections.Duplicate, report.Rejections.UnwantedDifficulty,
	)
}
