/**
 * Send a batch of independent API writes without waiting for each round trip.
 *
 * Both save-ingest flows issue one request per record — per lot, per sim, per
 * household — and a real save is thousands of them. Sequentially that costs one
 * network round trip each, which is invisible on localhost (~1ms) and brutal in
 * production (~150-300ms): the same sync that takes seconds on a dev machine
 * takes many minutes against Railway.
 *
 * ONLY for work where the items genuinely don't affect each other. Anything that
 * moves a household or a club onto a lot must stay sequential — the assign route
 * reads a lot's occupants, decides on capacity, then writes, so two assignments
 * racing for the same lot can both read "there's room".
 */

// 10 in-flight requests is enough to hide the round-trip latency without
// overwhelming the Express connection pool. The DB-side bottleneck is one
// Postgres connection per request via `query()`, so going higher gives
// diminishing returns.
export const IMPORT_CONCURRENCY = 10;

/** Run `fn` over every item with at most `IMPORT_CONCURRENCY` in flight. */
export async function runChunked<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += IMPORT_CONCURRENCY) {
    await Promise.all(items.slice(i, i + IMPORT_CONCURRENCY).map(fn));
  }
}
