/**
 * Status markers.
 *
 * Every one of these carries its meaning in a GLYPH and a LABEL as well as a
 * colour. That is an accessibility requirement from the brief, but it also
 * happens to be what makes the product survive an unknown brand palette: if the
 * designer supplies five signal hues that are hard to tell apart, the interface
 * still reads correctly.
 */

export type Confidence = 'high' | 'medium' | 'low';

const CONFIDENCE: Record<Confidence, { glyph: string; label: string; tone: string }> = {
  high: { glyph: '●●●', label: 'High', tone: 'text-positive' },
  medium: { glyph: '●●○', label: 'Medium', tone: 'text-caution' },
  low: { glyph: '●○○', label: 'Low', tone: 'text-uncertain' },
};

export function ConfidenceMark({ confidence }: { confidence: Confidence }) {
  const mark = CONFIDENCE[confidence];

  return (
    <span className="text-2xs inline-flex items-center gap-1.5 font-mono">
      <span aria-hidden className={mark.tone}>
        {mark.glyph}
      </span>
      <span className="text-ink-muted">{mark.label}</span>
    </span>
  );
}

export type IdentityStatus =
  | 'confirmed_official'
  | 'probable'
  | 'conflicting'
  | 'inaccessible'
  | 'none_found_after_search';

const IDENTITY: Record<IdentityStatus, { glyph: string; label: string; tone: string; note: string }> = {
  confirmed_official: {
    glyph: '✓',
    label: 'Confirmed site',
    tone: 'text-positive',
    note: 'Something links this domain back to the business.',
  },
  probable: {
    glyph: '~',
    label: 'Probable site',
    tone: 'text-caution',
    note: 'Probably right, but nothing confirms it definitively. Worth a glance.',
  },
  conflicting: {
    glyph: '⇄',
    label: 'Conflicting',
    tone: 'text-critical',
    note: 'The site does not appear to belong to this business.',
  },
  inaccessible: {
    glyph: '⊘',
    label: 'Could not read',
    tone: 'text-uncertain',
    note: 'A site was found but could not be read, so nothing about it was assessed.',
  },
  none_found_after_search: {
    glyph: '?',
    label: 'No site found',
    tone: 'text-uncertain',
    note: 'Searched and found nothing. That is not evidence that none exists.',
  },
};

export function IdentityMark({ status }: { status: IdentityStatus }) {
  const mark = IDENTITY[status];

  return (
    <span className="text-2xs inline-flex items-center gap-1.5 font-mono" title={mark.note}>
      <span aria-hidden className={`${mark.tone} font-semibold`}>
        {mark.glyph}
      </span>
      <span className="text-ink-muted">{mark.label}</span>
    </span>
  );
}

const CLAIM_CLASS: Record<string, { glyph: string; label: string; tone: string }> = {
  objective_defect: { glyph: '▲', label: 'Defect', tone: 'text-critical' },
  subjective_observation: { glyph: '◆', label: 'Observation', tone: 'text-caution' },
  commercial_hypothesis: { glyph: '◇', label: 'Hypothesis', tone: 'text-uncertain' },
};

/**
 * The three kinds of claim, always visually distinct.
 *
 * The brief requires these be kept apart, because presenting a hypothesis as a
 * defect is the category's characteristic dishonesty — and it is the difference
 * between "your checkout is broken" and "you may be losing mobile sales".
 */
export function ClaimClassMark({ classification }: { classification: string }) {
  const mark = CLAIM_CLASS[classification] ?? CLAIM_CLASS.commercial_hypothesis!;

  return (
    <span className="text-2xs inline-flex items-center gap-1.5 font-mono tracking-wide uppercase">
      <span aria-hidden className={mark.tone}>
        {mark.glyph}
      </span>
      <span className="text-ink-muted">{mark.label}</span>
    </span>
  );
}

/** A score, shown with the caveat it needs rather than as a bare number. */
export function ScoreMark({ score }: { score: number }) {
  return (
    <span
      data-numeric
      className="font-display text-base font-medium tabular-nums"
      title="A starting heuristic weighted 30/25/20/15/10, not a calibrated likelihood. Comparable within one industry, not across them."
    >
      {score}
    </span>
  );
}
