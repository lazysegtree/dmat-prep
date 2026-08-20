package main

import (
	"flag"
	"fmt"
	"os"

	"dmat-prep/internal/figureseq"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	flags := flag.NewFlagSet("figure-sequence-generator", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	out := flags.String("out", "", "figure-sequence bank output path")
	verify := flags.Bool("verify", false, "verify an existing bank")
	seed := flags.Uint64("seed", 20260818, "deterministic generator seed")
	low := flags.Int("count-low", 12, "number of low puzzles")
	medium := flags.Int("count-medium", 12, "number of medium puzzles")
	high := flags.Int("count-high", 12, "number of high puzzles")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if *out == "" {
		return fmt.Errorf("--out is required")
	}
	if *verify {
		count, err := figureseq.VerifyFile(*out)
		if err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "verified %d figure-sequence puzzles\n", count)
		return nil
	}
	bank, err := figureseq.Generate(figureseq.Settings{
		Seed:   *seed,
		Counts: figureseq.Counts{Low: *low, Medium: *medium, High: *high},
	})
	if err != nil {
		return err
	}
	if err := figureseq.WriteBank(*out, bank); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "generated %d figure-sequence puzzles\n", len(bank.Puzzles))
	return nil
}
