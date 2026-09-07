# Extension v2 jobs, recovery, and state versions

Date: 2026-09-06. Status: accepted. Context: implementation prompt, R4, R7.

## Decision

Jobs are host-owned: queued, running, cancellation-requested, succeeded, failed, cancelled, interrupted. The host records identifiers, bounded concurrency, timestamps, progress, partial outcomes, cancellation request and stop times, and bounded persisted history over one real status transport with reconnect and reload behavior.

On restart, abandoned running jobs are marked interrupted with known outputs and recovery status exposed. Filesystem effects are never replayed automatically. Grants expire on restart. Persisted records keep ownership metadata for safe cleanup or review, never grant tokens.

Extension settings and workflow state are namespaced by the host; extension code cannot select another extension's namespace. Settings carry schema versions with transactional migrations: a failed migration preserves prior data or disables that extension with an actionable diagnosis. Changes persist before consumers are notified. Retention is bounded.

## Consequences

- Cancellation is cooperative: extension code observes the signal, the host records request vs stop. A timeout cannot forcibly stop in-process JavaScript, and a job is never reported stopped while still writing.
- Duplicate invocation keys never start duplicate exports. Retries need fresh authorization, never overwrite completed outputs, and never fall back to v1.
- Disable rejects new work, requests cancellation of active jobs, and disposes services after owned work finishes.
