import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EvidenceRail } from '@/components/evidence/EvidenceRail';
import { ProductState } from '@/components/state/ProductState';
import { SampleBadge } from '@/components/sample/SampleBadge';
import {
  ClaimClassMark,
  ConfidenceMark,
  IdentityMark,
  ScoreMark,
  type IdentityStatus,
} from '@/components/opportunity/ConfidenceMark';
import { requireTenant } from '@/server/auth/guards';
import { getDb } from '@/server/db/client';
import { loadDossier } from '@/server/db/repo/dossier';
import { describeAge } from '@/server/evidence/dates';
import { campaignEligibility } from '@/server/rank/eligibility';
import { HEURISTIC_NOTE, WEIGHTS } from '@/server/rank/score';

export const metadata: Metadata = { title: 'Opportunity' };

/**
 * THE DOSSIER
 *
 * Everything known about one prospect, with the evidence permanently beside it.
 *
 * The layout is the argument: the left column makes the case, the right column
 * is the working. The brief requires source inspection within one interaction
 * of a claim, and a column that is always there costs zero interactions.
 */
export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const ctx = await requireTenant(`/opportunities/${opportunityId}`);

  const dossier = await loadDossier(getDb(), ctx, opportunityId);
  if (!dossier) notFound();

  const isSample = dossier.opportunity.dataOrigin === 'sample';
  const latestEvent = dossier.events[0];
  const identityStatus = (dossier.candidate?.identityStatus ?? 'none_found_after_search') as IdentityStatus;

  // Expiry is decided in the data layer against a single clock reading, so the
  // page stays a pure function of what it was given.
  const expiredEvidence = dossier.evidence.filter((item) => item.expired);

  const eligibility = campaignEligibility({
    identityConflictOpen: dossier.identityConflicts.length > 0,
    hasContact: dossier.contacts.length > 0,
    evidenceExpired: expiredEvidence.length > 0 && expiredEvidence.length === dossier.evidence.length,
    suppressed: false,
    subscriptionActive: false,
    isSampleWorkspace: isSample,
  });

  const inconclusive = dossier.assessment?.status.startsWith('inconclusive') ?? false;

  return (
    /* The shell is supplied by the (app) layout; this route lays out its own
       two columns so the evidence rail can sit flush against the dossier and
       scroll independently of it. */
    <div className="flex min-w-0">
      <div className="min-w-0 flex-1">
      {/* Sticky identity header: the one thing that must never scroll away,
          because every claim below is about THIS business specifically. */}
      <header className="rule-b bg-page sticky top-0 z-10 px-6 py-6 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {dossier.business.canonicalName}
              </h1>
              {isSample ? <SampleBadge /> : null}
            </div>

            <div className="text-ink-faint mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs">
              {dossier.business.region ? <span>{dossier.business.region}</span> : null}
              <span>{dossier.moduleIds.join(' + ')}</span>
              <IdentityMark status={identityStatus} />
            </div>
          </div>

          <div className="text-right">
            <ScoreMark score={dossier.opportunity.totalScore} />
            <div className="mt-1">
              <ConfidenceMark confidence={dossier.opportunity.confidenceBand} />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-(--spacing-measure) px-6 py-8 md:px-10">
        {/* Blocking states first: if outreach is impossible, say so before the
            user invests attention in deciding whether to write. */}
        {dossier.identityConflicts.length > 0 ? (
          <div className="mb-8">
            <ProductState
              state="identity_conflict"
              variant="blocking"
              whatWeKnow={dossier.identityConflicts[0]?.reason}
            />
          </div>
        ) : null}

        {inconclusive ? (
          <div className="mb-8">
            <ProductState
              state="unknown_website"
              variant="blocking"
              title="The website could not be assessed"
              explanation={
                dossier.assessment?.blockedDetail ??
                'The site could not be read, so nothing about it has been evaluated.'
              }
              whatWeKnow="No findings were recorded. An unreadable site tells us nothing about its quality, and we do not guess."
            />
          </div>
        ) : null}

        {dossier.contacts.length === 0 ? (
          <div className="mb-8">
            <ProductState state="no_contact" variant="blocking" />
          </div>
        ) : null}

        {/* ── Why now ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Why now</h2>
          {latestEvent ? (
            <div className="mt-3">
              <p className="text-lg text-pretty">{latestEvent.title}</p>
              <p className="text-ink-muted mt-1.5 font-mono text-2xs">
                {describeAge(latestEvent.eventDate, latestEvent.eventDatePrecision)}
                {' · '}
                {/* Event age, never discovery age. */}
                discovered {describeAge(latestEvent.discoveredAt, 'day')}
                {latestEvent.eventDatePrecision !== 'day' ? (
                  <> · date known only to the {latestEvent.eventDatePrecision}</>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="text-ink-muted mt-3 text-pretty">
              No dated event was found, so there is no particular reason to write this week rather
              than next. That is not a reason to skip them — only a reason not to pretend urgency.
            </p>
          )}
        </section>

        {/* ── What the site actually showed ───────────────────────────────── */}
        <section className="rule-t mt-10 pt-8">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            What the site showed
          </h2>

          {dossier.findings.length === 0 ? (
            <p className="text-ink-muted mt-3 text-pretty">
              {inconclusive
                ? 'Nothing, because the site could not be read.'
                : 'Nothing of note was found on the pages that were read.'}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-5">
              {dossier.findings.map((item) => (
                <li key={item.id}>
                  <ClaimClassMark classification={item.classification} />
                  <p className="mt-1.5 text-pretty">{item.summary}</p>
                  {item.observedUrl ? (
                    <p className="text-ink-faint mt-1 truncate font-mono text-2xs">
                      {item.observedUrl}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {dossier.captures.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {dossier.captures.map((shot) => (
                <figure key={shot.id}>
                  {/* A fixed frame with top alignment: desktop and mobile
                      captures have wildly different aspect ratios, and letting
                      each take its natural height turns the section into a
                      column of whitespace. The frame scrolls rather than
                      crops, so nothing is hidden. */}
                  <div className="border-line bg-sunken h-64 overflow-hidden rounded-sm border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/captures/${shot.id}`}
                      alt={`${shot.viewport} screenshot of ${dossier.business.canonicalName}`}
                      width={shot.width ?? 400}
                      height={shot.height ?? 300}
                      className="w-full"
                    />
                  </div>
                  <figcaption className="text-ink-faint mt-1.5 font-mono text-2xs">
                    {shot.viewport} · {shot.width}×{shot.height} ·{' '}
                    {shot.takenAt.toISOString().slice(0, 10)}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </section>

        {/* ── The score, taken apart ──────────────────────────────────────── */}
        <section className="rule-t mt-10 pt-8">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            How this ranked
          </h2>
          <p className="text-ink-muted mt-2 text-sm text-pretty">{HEURISTIC_NOTE}</p>

          <table className="mt-4 w-full text-left">
            <tbody>
              {dossier.scoreInputs.map((row) => (
                <tr key={row.id} className="rule-b">
                  <td className="py-2.5 pr-4 align-top">
                    <span className="font-mono text-xs">{row.component}</span>
                    <p className="text-ink-muted mt-0.5 text-sm text-pretty">{row.label}</p>
                  </td>
                  <td className="py-2.5 text-right align-top font-mono text-sm tabular-nums">
                    {row.contribution}
                    <span className="text-ink-faint">
                      /{WEIGHTS[row.component as keyof typeof WEIGHTS] ?? '–'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Contacts ────────────────────────────────────────────────────── */}
        <section className="rule-t mt-10 pt-8">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Contact</h2>

          {dossier.contacts.length === 0 ? (
            <p className="text-ink-muted mt-3 text-pretty">
              No public contact route was found. Kovvi does not guess addresses from name patterns.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {dossier.contacts.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm">{row.value}</span>
                  <span className="text-ink-faint font-mono text-2xs">
                    {row.channel} · {row.verification} · checked{' '}
                    {describeAge(row.lastCheckedAt, 'day')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── What happens next ───────────────────────────────────────────── */}
        <section className="rule-t mt-10 pt-8 pb-16">
          <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Next</h2>
          <p className="mt-3 text-pretty">{eligibility.explanation}</p>
          {eligibility.blockedReason ? (
            <p className="text-ink-faint mt-2 font-mono text-2xs">
              blocked: {eligibility.blockedReason}
            </p>
          ) : null}
        </section>
      </div>
      </div>

      <aside
        aria-label="Evidence"
        className="rule-l bg-card sticky top-0 hidden h-dvh w-(--spacing-evidence) shrink-0 overflow-y-auto xl:block"
      >
        <EvidenceRail evidence={dossier.evidence} />
      </aside>
    </div>
  );
}
