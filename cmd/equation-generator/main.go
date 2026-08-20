package main

import (
	"flag"
	"fmt"
	"os"

	"dmat-prep/internal/equationgen"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	flags := flag.NewFlagSet("equation-generator", flag.ContinueOnError)
	output := flags.String("out", "", "equation-bank JSON path")
	verify := flags.Bool("verify", false, "verify an existing equation bank")
	seed := flags.Uint64("seed", 20260819, "SplitMix64 seed")
	low := flags.Int("count-low", 20, "number of low questions")
	medium := flags.Int("count-medium", 20, "number of medium questions")
	high := flags.Int("count-high", 20, "number of high questions")
	extreme := flags.Int("count-extreme", 20, "number of extreme questions")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 || *output == "" {
		return fmt.Errorf("--out is required and positional arguments are unsupported")
	}
	if *verify {
		count, err := equationgen.VerifyFile(*output)
		if err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "verified %d mathematical-equation questions\n", count)
		return nil
	}
	bank, err := equationgen.Generate(equationgen.Settings{Seed: *seed, Low: *low, Medium: *medium, High: *high, Extreme: *extreme})
	if err != nil {
		return err
	}
	if err := equationgen.Write(*output, bank); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "generated %d mathematical-equation questions\n", len(bank.Questions))
	return nil
}
