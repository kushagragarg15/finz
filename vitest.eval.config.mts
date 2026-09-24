import { defineConfig } from "vitest/config";

// Live-model evaluations, kept out of the default `npm test` run.
export default defineConfig({
  test: { include: ["evals/**/*.eval.ts"], fileParallelism: false, sequence: { concurrent: false } },
});
