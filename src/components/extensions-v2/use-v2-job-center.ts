"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { V2JobRecord } from "@yard-core";

import { fetchV2JobStatus, requestV2JobCancel } from "@/lib/extensions-v2/job-client";
import {
  isV2JobLive,
  listV2Jobs,
  mergeV2JobCenterJobs,
} from "@/lib/extensions-v2/job-center";
import type { V2JobPersistenceState } from "@/lib/extensions-v2/runtime";

/**
 * Durable v2 job center state (Application context, #281).
 *
 * Owns no server state. On mount it reads the durable history and
 * re-attaches (the reconnect that survives a dialog closing, a renderer
 * reload, or reopening the application); while any job is live it polls
 * that job's status and merges the fresher record; cancellation is a
 * single idempotent request whose result is merged back, so the UI shows
 * *stopping* until the server reports the job fully stopped.
 *
 * The history page is bounded, so the newest `limit` records are read;
 * live jobs are always among them because the server never evicts a live
 * job from in-memory history.
 */
export const V2_JOB_CENTER_POLL_INTERVAL_MS = 1_000;
export const V2_JOB_CENTER_DEFAULT_LIMIT = 50;

export type V2JobCenterState = {
  jobs: V2JobRecord[];
  loading: boolean;
  error: string | null;
  /** Durable-history status from the last read; a write failure is surfaced. */
  persistence: V2JobPersistenceState | null;
  /** Re-read the durable history (reconnect / manual refresh). */
  refresh: () => Promise<void>;
  /** Request cancellation; resolves once the merged record is applied. */
  cancel: (jobId: string) => Promise<void>;
};

export function useV2JobCenter(options?: {
  pollIntervalMs?: number;
  limit?: number;
}): V2JobCenterState {
  const pollIntervalMs = options?.pollIntervalMs ?? V2_JOB_CENTER_POLL_INTERVAL_MS;
  const limit = options?.limit ?? V2_JOB_CENTER_DEFAULT_LIMIT;
  const [jobs, setJobs] = useState<V2JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<V2JobPersistenceState | null>(null);
  // Mirrors the rendered list so the poll loop reads the freshest jobs
  // without re-subscribing the interval on every merge.
  const jobsRef = useRef<V2JobRecord[]>([]);

  const merge = useCallback((incoming: V2JobRecord[]) => {
    setJobs((current) => {
      const next = mergeV2JobCenterJobs(current, incoming);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const result = await listV2Jobs({ limit });
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setError(null);
    // A full read replaces the list: the server is the source of truth,
    // so a job that aged out of the page does not linger.
    setJobs(() => {
      const next = mergeV2JobCenterJobs([], result.jobs);
      jobsRef.current = next;
      return next;
    });
    if (result.persistence) setPersistence(result.persistence);
    setLoading(false);
  }, [limit]);

  const cancel = useCallback(
    async (jobId: string) => {
      const result = await requestV2JobCancel(jobId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      merge([result.job]);
    },
    [merge],
  );

  useEffect(() => {
    // Deferred one tick so the initial history read is not a synchronous
    // setState in the effect body (cascading render), matching the app's
    // other mount loaders.
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [refresh]);

  const hasLive = jobs.some(isV2JobLive);
  useEffect(() => {
    if (!hasLive) return;
    let stopped = false;
    const timer = setInterval(() => {
      const live = jobsRef.current.filter(isV2JobLive);
      if (live.length === 0) return;
      void Promise.all(live.map((entry) => fetchV2JobStatus(entry.jobId))).then((results) => {
        if (stopped) return;
        const settled = results.flatMap((result) => (result.ok ? [result.job] : []));
        if (settled.length > 0) merge(settled);
      });
    }, pollIntervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [hasLive, pollIntervalMs, merge]);

  return { jobs, loading, error, persistence, refresh, cancel };
}
