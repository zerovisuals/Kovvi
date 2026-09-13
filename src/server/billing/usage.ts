import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { usageLedger } from '../db/schema';
import type { UnitType } from '../pipeline/stage';

/**
 * THE USAGE LEDGER
 *
 * A balance is the SUM of an append-only ledger, never a counter that gets
 * mutated. That is the difference between double-charging being a race
 * condition and double-charging being impossible:
 *
 *   reserve   −n   taken when a costly job is enqueued
 *   finalise   0   the reserve becomes permanent (already debited)
 *   refund    +n   the job failed; the user keeps their allowance
 *   grant     +n   a billing period's allowance
 *   expire    −n   unused allowance at period end
 *
 * Every entry carries an idempotency key shared with the job it belongs to, and
 * the column is UNIQUE. A retried job, a replayed webhook and a duplicated
 * enqueue therefore collapse into one entry — acceptance case 7 — rather than
 * relying on nobody delivering the same message twice.
 *
 * A note on `inconclusive`: it FINALISES. Fetching a site that blocked us costs
 * exactly what fetching a cooperative one costs, and making blocked
 * inspections free would be an easy way to run up someone else's bill. The
 * billing screen shows that line explicitly rather than burying it.
 */

export type LedgerEntry = {
  readonly workspaceId: string;
  readonly unitType: UnitType;
  readonly units: number;
  readonly idempotencyKey: string;
  readonly runId?: string | null;
  readonly jobId?: string | null;
  readonly note?: string;
};

/** Current balance for one unit type. */
export async function balanceFor(
  db: Database,
  workspaceId: string,
  unitType: UnitType,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageLedger.units}), 0)::int` })
    .from(usageLedger)
    .where(and(eq(usageLedger.workspaceId, workspaceId), eq(usageLedger.unitType, unitType)));

  return row?.total ?? 0;
}

/**
 * Writes an entry, ignoring a repeat of one already written.
 *
 * `onConflictDoNothing` is what makes retries safe. Returning whether the row
 * was new lets callers distinguish "charged" from "already charged", which the
 * run's accounting needs.
 */
async function append(db: Database, entry: LedgerEntry, kind: 'reserve' | 'finalise' | 'refund' | 'grant' | 'expire'): Promise<boolean> {
  const inserted = await db
    .insert(usageLedger)
    .values({
      workspaceId: entry.workspaceId,
      kind,
      unitType: entry.unitType,
      units: entry.units,
      runId: entry.runId ?? null,
      jobId: entry.jobId ?? null,
      idempotencyKey: entry.idempotencyKey,
      note: entry.note ?? null,
    })
    .onConflictDoNothing({ target: usageLedger.idempotencyKey })
    .returning({ id: usageLedger.id });

  return inserted.length > 0;
}

export type ReservationOutcome =
  | { readonly kind: 'reserved'; readonly units: number }
  | { readonly kind: 'already_reserved' }
  /** Not enough allowance. The run stops cleanly and keeps what it has. */
  | { readonly kind: 'insufficient'; readonly balance: number; readonly needed: number };

/**
 * Reserves units before expensive work.
 *
 * Reserving first — rather than charging afterwards — is what lets a run stop
 * at its ceiling with partial results intact (acceptance case 10). Charging
 * after the fact would mean discovering the budget was gone only once the money
 * had been spent.
 */
export async function reserve(
  db: Database,
  entry: Omit<LedgerEntry, 'units'> & { units: number },
): Promise<ReservationOutcome> {
  const balance = await balanceFor(db, entry.workspaceId, entry.unitType);

  if (balance < entry.units) {
    return { kind: 'insufficient', balance, needed: entry.units };
  }

  const wrote = await append(
    db,
    { ...entry, units: -Math.abs(entry.units) },
    'reserve',
  );

  return wrote ? { kind: 'reserved', units: entry.units } : { kind: 'already_reserved' };
}

/**
 * Marks a reservation permanent. Writes zero units — the debit already
 * happened at reserve time — and exists so the ledger records that the work
 * completed rather than leaving a reservation ambiguous forever.
 */
export async function finalise(
  db: Database,
  entry: Omit<LedgerEntry, 'units'> & { units: number },
): Promise<boolean> {
  return append(
    db,
    { ...entry, units: 0, idempotencyKey: `${entry.idempotencyKey}:finalise` },
    'finalise',
  );
}

/** Returns units for work that failed. The user does not pay for our bugs. */
export async function refund(
  db: Database,
  entry: Omit<LedgerEntry, 'units'> & { units: number },
): Promise<boolean> {
  return append(
    db,
    {
      ...entry,
      units: Math.abs(entry.units),
      idempotencyKey: `${entry.idempotencyKey}:refund`,
    },
    'refund',
  );
}

/** Adds a period's allowance. */
export async function grant(
  db: Database,
  entry: Omit<LedgerEntry, 'units'> & { units: number },
): Promise<boolean> {
  return append(db, { ...entry, units: Math.abs(entry.units) }, 'grant');
}

/**
 * A cached result that did not require fresh work.
 *
 * Recorded at zero units and labelled, because the brief is explicit that
 * cached repeats must not silently count as fresh research — the user should
 * be able to see they were not charged, rather than take it on trust.
 */
export async function recordCacheHit(
  db: Database,
  entry: Omit<LedgerEntry, 'units' | 'note'> & { reusedFrom: Date },
): Promise<boolean> {
  return append(
    db,
    {
      ...entry,
      units: 0,
      idempotencyKey: `${entry.idempotencyKey}:cached`,
      note: `Reused an assessment from ${entry.reusedFrom.toISOString().slice(0, 10)}; not charged.`,
    },
    'finalise',
  );
}

export const PLAN_ALLOWANCES = {
  pro: {
    /** Provisional, per the brief: set from measured costs, not guessed. */
    deep_assessment: 100,
    llm_draft: 300,
    search_query: 1_000,
  },
} as const;
