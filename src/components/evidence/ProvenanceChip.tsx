'use client';

import { useId, useState } from 'react';

/**
 * THE PROVENANCE CHIP
 *
 * Kovvi's signature component, and the brief's §3.5 requirement made physical:
 * source inspection within ONE interaction of any claim.
 *
 * A small monospace chip sits against every factual statement in the product.
 * Clicking it expands the source IN PLACE — the quoted excerpt, the URL, when
 * it was retrieved, how confident we are. Not a modal, not a new page, not a
 * drawer that covers what you were reading. The claim stays visible while you
 * check it, because the two only mean something together.
 *
 * Everything about the styling serves that: monospace so it reads as metadata
 * rather than prose, confidence spelled out in words because a percentage would
 * imply a calibration nobody has done, and the disclosure state carried by a
 * glyph as well as by colour.
 */

export type Provenance = {
  readonly sourceLabel: string;
  readonly url: string;
  readonly retrievedAt: Date;
  /**
   * How long ago, computed on the server.
   *
   * Relative time depends on the current clock, which differs between the
   * server render and the browser — computing it here would be both impure and
   * a hydration mismatch. The server already knows when it fetched the page, so
   * it does the arithmetic once.
   */
  readonly ageLabel: string;
  readonly confidence: 'high' | 'medium' | 'low';
  /** The quoted text supporting the claim. Absent when derived structurally. */
  readonly excerpt?: string | null;
  /** objective_defect | subjective_observation | commercial_hypothesis */
  readonly classification?: 'objective_defect' | 'subjective_observation' | 'commercial_hypothesis';
  /** Set when the page tried to instruct an automated reader. */
  readonly injectionFlagged?: boolean;
};

const CONFIDENCE_GLYPH: Record<Provenance['confidence'], string> = {
  high: '●●●',
  medium: '●●○',
  low: '●○○',
};

const CLASSIFICATION_LABEL: Record<
  NonNullable<Provenance['classification']>,
  { label: string; note: string }
> = {
  objective_defect: {
    label: 'Defect',
    note: 'Something measurably wrong, observed directly.',
  },
  subjective_observation: {
    label: 'Observation',
    note: 'A judgement about the site, not a measurable fault.',
  },
  commercial_hypothesis: {
    label: 'Hypothesis',
    note: 'An inference about the business. Not established fact.',
  },
};

export function ProvenanceChip({ provenance }: { provenance: Provenance }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const retrieved = provenance.retrievedAt;
  const ageLabel = provenance.ageLabel;

  return (
    <span className="inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="border-line text-ink-faint hover:text-ink hover:border-line-strong ease-out text-2xs ml-1.5 inline-flex items-baseline gap-1.5 rounded-xs border px-1.5 py-0.5 font-mono transition-colors duration-instant"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        <span className="max-w-32 truncate">{provenance.sourceLabel}</span>
        <span aria-hidden className="opacity-60">
          ·
        </span>
        <span>{ageLabel}</span>
        <span
          aria-hidden
          className={
            provenance.confidence === 'high'
              ? 'text-positive'
              : provenance.confidence === 'medium'
                ? 'text-caution'
                : 'text-uncertain'
          }
          title={`${provenance.confidence} confidence`}
        >
          {CONFIDENCE_GLYPH[provenance.confidence]}
        </span>
        <span className="sr-only">
          Source: {provenance.sourceLabel}, retrieved {ageLabel}, {provenance.confidence} confidence.
          {open ? ' Collapse' : ' Expand'} to see the quoted source.
        </span>
      </button>

      {open ? (
        <span
          id={panelId}
          className="bg-sunken border-line mt-2 block rounded-sm border p-3"
        >
          {provenance.excerpt ? (
            <blockquote className="text-ink border-line-strong border-l-2 pl-3 text-sm text-pretty italic">
              {provenance.excerpt}
            </blockquote>
          ) : (
            <p className="text-ink-faint text-xs">
              Derived from the page structure rather than a quotation.
            </p>
          )}

          <span className="text-2xs text-ink-faint mt-3 flex flex-col gap-1 font-mono">
            <a
              href={provenance.url}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-ink truncate underline underline-offset-2"
            >
              {provenance.url}
            </a>
            <span>
              Retrieved {retrieved.toISOString().replace('T', ' ').slice(0, 16)} ·{' '}
              {provenance.confidence} confidence
            </span>
          </span>

          {provenance.classification ? (
            <span className="rule-t mt-3 block pt-2">
              <span className="text-2xs font-mono tracking-wide uppercase">
                {CLASSIFICATION_LABEL[provenance.classification].label}
              </span>
              <span className="text-ink-muted mt-0.5 block text-xs text-pretty">
                {CLASSIFICATION_LABEL[provenance.classification].note}
              </span>
            </span>
          ) : null}

          {provenance.injectionFlagged ? (
            <span className="border-line-strong mt-3 block rounded-sm border border-dashed p-2">
              <span className="text-2xs text-caution font-mono tracking-wide uppercase">
                Page addressed an automated reader
              </span>
              <span className="text-ink-muted mt-1 block text-xs text-pretty">
                This page contained text trying to instruct automated tooling. It was ignored and
                the page was read as ordinary content.
              </span>
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A factual statement with its source attached.
 *
 * Using this rather than a bare string is what makes "every claim carries its
 * provenance" structural instead of a habit — a claim rendered without one is
 * visibly different in the code.
 */
export function Claim({
  children,
  provenance,
}: {
  readonly children: React.ReactNode;
  readonly provenance: Provenance;
}) {
  return (
    <span className="inline">
      {children}
      <ProvenanceChip provenance={provenance} />
    </span>
  );
}
