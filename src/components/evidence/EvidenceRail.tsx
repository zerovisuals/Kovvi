import { ProvenanceChip } from './ProvenanceChip';
import { ClaimClassMark } from '@/components/opportunity/ConfidenceMark';
import type { DossierEvidence } from '@/server/db/repo/dossier';

/**
 * THE EVIDENCE RAIL
 *
 * Everything we know about this business and where each piece came from,
 * permanently beside the dossier rather than behind a click.
 *
 * Grouped by CLASSIFICATION, not by recency or source. The brief requires
 * objective defects, subjective observations and commercial hypotheses be kept
 * apart, and grouping is the strongest way to keep them apart — a mixed list
 * invites the reader to treat a guess and a measurement as the same kind of
 * thing, which is the mistake the whole product exists to avoid.
 *
 * Expired evidence is shown, struck through, rather than hidden. Knowing that
 * the reason to write has gone stale is more useful than a shorter list.
 */

const GROUPS = [
  {
    classification: 'objective_defect' as const,
    title: 'Measured',
    note: 'Observed directly on the site. These are facts.',
  },
  {
    classification: 'subjective_observation' as const,
    title: 'Observed',
    note: 'Judgements about the site. Reasonable people may disagree.',
  },
  {
    classification: 'commercial_hypothesis' as const,
    title: 'Inferred',
    note: 'Guesses about the business. Not established, and never stated as fact in outreach.',
  },
];

export function EvidenceRail({ evidence }: { readonly evidence: readonly DossierEvidence[] }) {
  return (
    <div className="p-5">
      <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Evidence</h2>
      <p className="text-ink-muted mt-2 text-xs text-pretty">
        {evidence.length} item{evidence.length === 1 ? '' : 's'}, each traceable to a page we
        retrieved. Open a chip to read the original.
      </p>

      {evidence.length === 0 ? (
        <p className="text-ink-faint mt-6 text-sm text-pretty">
          Nothing recorded yet. That is not a claim that there is nothing to find.
        </p>
      ) : null}

      {GROUPS.map((group) => {
        const items = evidence.filter((item) => item.classification === group.classification);
        if (items.length === 0) return null;

        return (
          <section key={group.classification} className="mt-8">
            <div className="rule-b flex items-baseline justify-between gap-3 pb-2">
              <ClaimClassMark classification={group.classification} />
              <span className="text-2xs text-ink-faint font-mono">{items.length}</span>
            </div>
            <p className="text-ink-faint mt-2 text-xs text-pretty">{group.note}</p>

            <ul className="mt-3 flex flex-col gap-4">
              {items.map((item) => {
                return (
                  <li key={item.id} className="text-sm">
                    <p
                      className={
                        item.expired ? 'text-ink-faint line-through' : 'text-ink text-pretty'
                      }
                    >
                      {item.excerpt ?? item.claimKey}
                    </p>

                    {item.expired ? (
                      <p className="text-2xs text-caution mt-1 font-mono">
                        Past its freshness window — refresh before citing it.
                      </p>
                    ) : null}

                    <ProvenanceChip
                      provenance={{
                        sourceLabel: item.sourceLabel,
                        url: item.sourceUrl,
                        retrievedAt: item.retrievedAt,
                        ageLabel: item.ageLabel,
                        confidence: item.confidence,
                        excerpt: item.excerpt,
                        classification: item.classification,
                        injectionFlagged: item.injectionFlagged,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
