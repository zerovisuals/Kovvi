import type { z } from 'zod';
import type { CapabilityId } from '../capabilities/registry';
import type { Database } from '../db/client';

/**
 * THE STAGE CONTRACT
 *
 * Every step of the pipeline returns one of four things, and the choice of
 * those four is the most consequential design decision in this codebase.
 *
 * `inconclusive` sits alongside `ok`, NOT alongside `failed`. It means the work
 * genuinely happened and genuinely produced uncertainty: the site blocked us,
 * the source is not connected, two businesses share a name. That is a RESULT.
 * Treating it as failure would push the pipeline toward retrying, refunding and
 * ultimately discarding exactly the information the brief insists on keeping.
 *
 * Because uncertainty has a first-class shape, "partial results", "source
 * unavailable", "unknown website" and "identity conflict" fall out of the
 * architecture as ordinary outcomes, instead of being special cases bolted onto
 * a pipeline that assumes success or failure.
 */

export type StageId =
  | 'discover'
  | 'normalize'
  | 'resolve_identity'
  | 'collect_evidence'
  | 'inspect_site'
  | 'find_contacts'
  | 'rank'
  | 'draft'
  | 'send';

export type InconclusiveReason =
  | 'blocked'
  | 'timeout'
  | 'no_data'
  | 'source_unavailable'
  | 'ambiguous';

export type UnitType = 'deep_assessment' | 'llm_draft' | 'search_query';

/** A job to enqueue once this one succeeds. */
export type EnqueueSpec = {
  readonly stage: StageId;
  readonly input: Record<string, unknown>;
  /** Appended to the parent's key, so the child is idempotent too. */
  readonly idempotencySuffix: string;
  readonly delayMs?: number;
};

export type StageResult<Output> =
  /** Work done, output produced. */
  | {
      readonly kind: 'ok';
      readonly output: Output;
      readonly next?: readonly EnqueueSpec[];
    }
  /**
   * Work done, and the honest answer is "we do not know". A SUCCESS terminal
   * state: it finalises its cost, does not retry, and its reason propagates
   * into the run's coverage and the UI.
   */
  | {
      readonly kind: 'inconclusive';
      readonly reason: InconclusiveReason;
      readonly detail: string;
      readonly next?: readonly EnqueueSpec[];
    }
  /** Transient; try again later. Does not consume an attempt's budget. */
  | { readonly kind: 'retry'; readonly afterMs: number; readonly reason: string }
  /** Something is broken on our side. Refunds the reservation. */
  | { readonly kind: 'failed'; readonly reason: string };

export type StageContext = {
  readonly db: Database;
  readonly workspaceId: string;
  readonly runId: string | null;
  readonly jobId: string;
  readonly attempt: number;
  /** Aborts when the job's lease is close to expiring. */
  readonly signal: AbortSignal;
  /** Records an external call for cost attribution and circuit breaking. */
  recordProviderCall(call: {
    provider: string;
    capabilityId: CapabilityId;
    httpStatus?: number;
    latencyMs?: number;
    costUnits?: number;
    error?: string;
  }): Promise<void>;
};

export type StageCost = { readonly unitType: UnitType; readonly units: number } | null;

export type Stage<Input, Output> = {
  readonly id: StageId;
  readonly input: z.ZodType<Input>;
  readonly output: z.ZodType<Output>;
  /** `null` means free. Costed stages reserve before running. */
  readonly cost: (input: Input) => StageCost;
  /**
   * When set and the capability is absent, the runner short-circuits to
   * `inconclusive('source_unavailable')` WITHOUT running the stage — so an
   * unconfigured integration can never produce output at all.
   */
  readonly capability?: CapabilityId;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly run: (input: Input, ctx: StageContext) => Promise<StageResult<Output>>;
};

/**
 * Defines a stage. The zod schemas are not decoration: a stage cannot pass an
 * unvalidated shape downstream, which matters when the input originated in a
 * third-party API response or a page we scraped.
 */
export function defineStage<Input, Output>(stage: Stage<Input, Output>): Stage<Input, Output> {
  return stage;
}

/**
 * A stage with its input and output types erased.
 *
 * The registry and the runner deal in stages generically, and no single type
 * parameter describes a heterogeneous collection of them. Erasing to `unknown`
 * is sound in practice because the runner ALWAYS parses the stored job input
 * through the stage's own zod schema before calling `run` — the schema is the
 * real type boundary, and it is checked at runtime where the data actually
 * arrives from the database.
 */
export type AnyStage = {
  readonly id: StageId;
  readonly input: z.ZodType<unknown>;
  readonly output: z.ZodType<unknown>;
  readonly cost: (input: unknown) => StageCost;
  readonly capability?: CapabilityId;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly run: (input: unknown, ctx: StageContext) => Promise<StageResult<unknown>>;
};

/** Erases a concrete stage for storage in the registry. */
export function eraseStage<Input, Output>(stage: Stage<Input, Output>): AnyStage {
  return stage as unknown as AnyStage;
}

/* ── Constructors, so call sites read as intent rather than object literals ─ */

export function ok<Output>(output: Output, next?: readonly EnqueueSpec[]): StageResult<Output> {
  return next ? { kind: 'ok', output, next } : { kind: 'ok', output };
}

export function inconclusive<Output>(
  reason: InconclusiveReason,
  detail: string,
  next?: readonly EnqueueSpec[],
): StageResult<Output> {
  return next ? { kind: 'inconclusive', reason, detail, next } : { kind: 'inconclusive', reason, detail };
}

export function retry<Output>(afterMs: number, reason: string): StageResult<Output> {
  return { kind: 'retry', afterMs, reason };
}

export function failed<Output>(reason: string): StageResult<Output> {
  return { kind: 'failed', reason };
}

/**
 * Exponential backoff with jitter.
 *
 * The jitter matters more than the curve: without it, a hundred jobs that
 * failed together retry together, and the thundering herd turns a blip into an
 * outage.
 */
export function backoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** attempt, 15 * 60_000);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

/** Errors a stage may throw to signal retry/failure without returning. */
export class RetryableError extends Error {
  constructor(
    message: string,
    readonly afterMs?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}
