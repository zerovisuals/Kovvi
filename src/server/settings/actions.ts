'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { portfolioProject, savedSearch, serviceProfile, workspacePreference } from '../db/schema';
import { requireTenantOrThrow } from '../auth/guards';
import { recordAudit } from '../ops/audit';
import { NotFoundError } from '../db/tenant';

/**
 * Settings.
 *
 * The service profile is the one that matters: ranking matches prospects
 * against it, and drafts cite it. It is therefore explicitly CONFIRMED rather
 * than merely saved — until the user stands behind what it says, discovery
 * refuses to run rather than matching against claims they never made.
 */

export type ActionResult =
  | { readonly ok: true; readonly detail: string }
  | { readonly ok: false; readonly detail: string };

function toList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function saveServiceProfile(input: {
  readonly headline: string;
  readonly services: string;
  readonly regions: string;
  readonly languages: string;
  readonly exclusions: string;
  readonly minProjectPrice: string;
  readonly confirm: boolean;
}): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();

  const services = toList(input.services);
  if (input.confirm && services.length === 0) {
    return {
      ok: false,
      detail: 'Name at least one service before confirming. Matching has nothing to match on otherwise.',
    };
  }

  const minCents = input.minProjectPrice.replace(/[^\d]/g, '');

  const values = {
    workspaceId: ctx.workspaceId,
    headline: input.headline.trim() || null,
    services,
    regions: toList(input.regions),
    languages: toList(input.languages),
    exclusions: toList(input.exclusions),
    minProjectPriceCents: minCents ? Number(minCents) * 100 : null,
    // Confirmation is per save. Editing the profile and not re-confirming
    // leaves it a draft, which is the honest reading of what happened.
    confirmedAt: input.confirm ? new Date() : null,
  };

  await db
    .insert(serviceProfile)
    .values(values)
    .onConflictDoUpdate({ target: serviceProfile.workspaceId, set: values });

  await recordAudit(db, ctx, {
    action: input.confirm ? 'profile.confirmed' : 'profile.saved',
    subjectType: 'workspace',
    subjectId: ctx.workspaceId,
  });

  revalidatePath('/settings/profile');
  revalidatePath('/discover');

  return {
    ok: true,
    detail: input.confirm
      ? 'Saved and confirmed. Discovery and drafting will use this.'
      : 'Saved as a draft. Confirm it before running research — nothing will match against unconfirmed claims.',
  };
}

export async function addPortfolioProject(input: {
  readonly url: string;
  readonly title: string;
  readonly role: string;
  readonly summary: string;
  readonly representative: boolean;
}): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  let normalized: string;
  try {
    const parsed = new URL(input.url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('scheme');
    normalized = parsed.toString();
  } catch {
    return { ok: false, detail: 'That does not look like a website address.' };
  }

  const db = getDb();
  await db.insert(portfolioProject).values({
    workspaceId: ctx.workspaceId,
    url: normalized,
    title: input.title.trim() || null,
    role: input.role.trim() || null,
    summary: input.summary.trim() || null,
    isRepresentative: input.representative,
  });

  revalidatePath('/settings/profile');
  return {
    ok: true,
    detail: 'Added. Only work you mark as representative is ever cited in a draft.',
  };
}

export async function setRepresentative(
  projectId: string,
  representative: boolean,
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  const updated = await getDb()
    .update(portfolioProject)
    .set({ isRepresentative: representative })
    .where(
      and(
        eq(portfolioProject.id, projectId),
        eq(portfolioProject.workspaceId, ctx.workspaceId),
      ),
    )
    .returning({ id: portfolioProject.id });

  if (updated.length === 0) throw new NotFoundError('Project');

  revalidatePath('/settings/profile');
  return { ok: true, detail: representative ? 'Will be cited in drafts.' : 'No longer cited.' };
}

export async function removePortfolioProject(projectId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  await getDb()
    .delete(portfolioProject)
    .where(
      and(
        eq(portfolioProject.id, projectId),
        eq(portfolioProject.workspaceId, ctx.workspaceId),
      ),
    );

  revalidatePath('/settings/profile');
  return { ok: true, detail: 'Removed.' };
}

/* ── Preferences ─────────────────────────────────────────────────────────── */

export async function savePreferences(input: {
  readonly timezone: string;
  readonly locale: string;
  readonly capacity: 'open' | 'booked';
  readonly reducedMotion: boolean;
  readonly defaultRunCap: number;
}): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();
  const db = getDb();

  const values = {
    workspaceId: ctx.workspaceId,
    timezone: input.timezone.trim() || 'UTC',
    locale: input.locale.trim() || 'en',
    capacity: input.capacity,
    reducedMotion: input.reducedMotion,
    defaultRunCap: Math.max(1, Math.min(500, Math.round(input.defaultRunCap))),
  };

  await db
    .insert(workspacePreference)
    .values(values)
    .onConflictDoUpdate({ target: workspacePreference.workspaceId, set: values });

  // Marking yourself booked pauses monitoring rather than merely noting it.
  // Generating opportunities nobody can take is worse than generating none.
  if (input.capacity === 'booked') {
    await db
      .update(savedSearch)
      .set({ paused: true })
      .where(eq(savedSearch.workspaceId, ctx.workspaceId));
  }

  revalidatePath('/settings/preferences');
  revalidatePath('/settings/searches');

  return {
    ok: true,
    detail:
      input.capacity === 'booked'
        ? 'Saved. Saved searches are paused while you are booked.'
        : 'Saved.',
  };
}

/* ── Saved searches ──────────────────────────────────────────────────────── */

export async function setSearchCadence(
  searchId: string,
  cadence: 'manual' | 'daily' | 'weekly' | 'monthly',
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  const updated = await getDb()
    .update(savedSearch)
    .set({ cadence })
    .where(and(eq(savedSearch.id, searchId), eq(savedSearch.workspaceId, ctx.workspaceId)))
    .returning({ id: savedSearch.id });

  if (updated.length === 0) throw new NotFoundError('Saved search');

  revalidatePath('/settings/searches');
  return { ok: true, detail: `Now set to ${cadence}.` };
}

export async function setSearchPaused(
  searchId: string,
  paused: boolean,
): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  const updated = await getDb()
    .update(savedSearch)
    .set({ paused })
    .where(and(eq(savedSearch.id, searchId), eq(savedSearch.workspaceId, ctx.workspaceId)))
    .returning({ id: savedSearch.id });

  if (updated.length === 0) throw new NotFoundError('Saved search');

  revalidatePath('/settings/searches');
  return { ok: true, detail: paused ? 'Paused.' : 'Resumed.' };
}

export async function deleteSavedSearch(searchId: string): Promise<ActionResult> {
  const ctx = await requireTenantOrThrow();

  await getDb()
    .delete(savedSearch)
    .where(and(eq(savedSearch.id, searchId), eq(savedSearch.workspaceId, ctx.workspaceId)));

  revalidatePath('/settings/searches');
  return { ok: true, detail: 'Deleted. Opportunities it already found are unaffected.' };
}
