/**
 * Server test config.
 *
 * The only thing here is timeouts, and they exist for a concrete reason: the
 * route tests build a real Fastify instance, and registering helmet, cors,
 * rate-limit, static and every route costs seconds — measured at ~4.5s per
 * cold `buildApp` on a CI runner, against a 5s default. Locally that passed;
 * on a loaded two-core runner with ten test files in parallel it did not, so
 * the suite failed in CI while being green on a developer machine, which is
 * the worst possible place for that gap to live.
 *
 * Raising the ceiling is the right fix rather than trimming what the tests
 * cover: these assert against the assembled app on purpose (a mounting or
 * guard mistake is invisible to handler unit tests), and that assembly is
 * what costs the time.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Generous enough for a cold buildApp on a slow shared runner, still far
    // below anything that would let a genuinely hung test stall the pipeline.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true
  }
});
