# Extension v2 waiting-work bounds (plans, job queues, waiters)

Date: 2026-10-15. Status: accepted. Context: #299, extends
[Extension v2 jobs, recovery, and state versions](extension-v2-jobs-recovery.md).

## Decision

Waiting work in the v2 runtime is bounded **before any expensive work
begins** (before selection hydration, preview construction, or handler
execution), under one documented policy applied in a fixed order:

1. **Coalesce first.** An identical pending plan is deduplicated: the
   same extension, command, targets, options, destructive flag, grants,
   and required permissions return the existing `vplan_` record instead
   of queuing a second one. A job with the same idempotency key for the
   same extension and command returns the existing `vjob_` record (the
   established idempotency contract). Same work, same result.
2. **Expire stale plans by TTL, and report it.** A pending plan whose
   `expiresAt` has passed is removed by the sweep before capacity is
   judged, and the sweep returns the number expired. A plan that is no
   longer pending is retained for replay reporting at most
   `V2_PLAN_STALE_TTL_MS` (24 h) after creation, then swept and counted.
   The counts are reported (`sweep()` / `lastSweep()`), never vanished
   silently.
3. **Reject past the hard cap, naming the limit.** When a genuinely new
   plan or queued job would exceed a bound, the host refuses it with
   `plan-limit` or `job-limit` (HTTP 429) and a message that names the
   numeric limit and how to make room. Pending plans and queued jobs are
   never silently evicted to make room, and are never silently dropped.

Numeric bounds (tunable constants, documented next to the bound in
`plans.ts` / `jobs.ts`):

| Bound | Constant | Value |
| --- | --- | --- |
| Pending plans, per extension | `MAX_V2_PENDING_PLANS_PER_EXTENSION` | 32 |
| Pending plans, whole process | `MAX_V2_PENDING_PLANS_TOTAL` | 64 |
| Stored plan records (pending + retained) | `MAX_V2_PLAN_RECORDS` | 256 |
| Stale plan retention (TTL) | `V2_PLAN_STALE_TTL_MS` | 24 h |
| Plan preview payload | `MAX_V2_PLAN_PREVIEW_BYTES` | 64 KiB |
| Queued jobs (not yet running), per extension | `MAX_V2_QUEUED_JOBS_PER_EXTENSION` | 16 |
| Queued jobs, whole process | `MAX_V2_QUEUED_JOBS_TOTAL` | 64 |
| Parked `waitFor` waiters, per job | `MAX_V2_JOB_WAITERS_PER_JOB` | 64 |

The pending-plan TTL itself is unchanged: a plan expires at its
`expiresAt` (15-minute default, 1-hour maximum), and the sweep is the
retention/expiry valve that runs before the cap is judged. The 24 h
figure is the stale-record TTL; it is the longest a plan record is kept
after it stops being pending.

## Consequences

- A flood of identical previews collapses to one pending plan, so the
  per-extension and total caps cannot be exhausted by duplicate work;
  the second caller applies the same plan (and a replay then reports
  `plan-consumed`, as before).
- A flood of *distinct* work is refused with a named limit rather than
  growing memory or evicting someone else's pending work. Callers
  recover by applying, cancelling, or letting work expire and retrying.
- Job-queue admission counts only live `queued` jobs; running and
  terminal work do not consume queue slots. Terminal history stays
  bounded by `MAX_V2_JOB_HISTORY` (100) and the persisted snapshot by
  `MAX_V2_JOB_SNAPSHOT_RETAINED` (50).
- Result previews were already bounded for terminal jobs (#279,
  `terminal-results.ts`); this decision adds the missing bound for the
  stored plan preview payload.
- The bounds are process-wide and in-memory (plans are memory-only);
  a restart resets them, exactly like the rest of the plan/job state.
- New failure codes `plan-limit` and `job-limit` map to HTTP 429 in
  `transport.ts`; the retry guidance is "make room, then retry".
