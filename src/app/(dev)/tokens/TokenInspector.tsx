'use client';

import { useEffect, useRef, useState } from 'react';
import {
  COLOR_GROUPS,
  CONTRAST_PAIRS,
  FONT_SLOTS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  TYPE_STEPS,
  type ContrastPair,
} from '@/styles/token-catalog';
import { compositeOver, contrastRatio, formatRatio, resolveToken, verdictFor } from '@/lib/contrast';

type Measurement = {
  readonly pair: ContrastPair;
  readonly light: { ratio: number; pass: boolean } | null;
  readonly dark: { ratio: number; pass: boolean } | null;
};

function measure(probe: Element, pair: ContrastPair) {
  const background = resolveToken(probe, pair.background);
  const foreground = resolveToken(probe, pair.foreground);
  if (!background || !foreground) return null;

  // Hairlines are translucent by design; measuring them unflattened would
  // report a contrast the eye never experiences.
  const flattened =
    foreground.alpha < 1
      ? compositeOver(foreground.rgb, foreground.alpha, background.rgb)
      : foreground.rgb;

  const ratio = contrastRatio(flattened, background.rgb);
  return { ratio, pass: verdictFor(ratio, pair.minimum) === 'pass' };
}

export function TokenInspector({ fontsSupplied }: { fontsSupplied: boolean }) {
  const lightProbe = useRef<HTMLDivElement>(null);
  const darkProbe = useRef<HTMLDivElement>(null);
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null);

  useEffect(() => {
    const light = lightProbe.current;
    const dark = darkProbe.current;
    if (!light || !dark) return;

    setMeasurements(
      CONTRAST_PAIRS.map((pair) => ({
        pair,
        light: measure(light, pair),
        dark: measure(dark, pair),
      })),
    );
  }, []);

  const failures =
    measurements?.filter((m) => m.light?.pass === false || m.dark?.pass === false) ?? [];

  return (
    <>
      {/* Off-screen probes. Tier-2 selectors are plain attribute selectors, so
          any element carrying data-theme resolves that theme's tokens. */}
      <div ref={lightProbe} data-theme="light" aria-hidden className="sr-only" />
      <div ref={darkProbe} data-theme="dark" aria-hidden className="sr-only" />

      <Section
        title="Typefaces"
        note="Three slots. Until real files exist, each falls back to a system stack so the build still works."
      >
        <div className="rule-t">
          {FONT_SLOTS.map((slot) => (
            <div
              key={slot.token}
              className="rule-b grid grid-cols-1 gap-2 py-4 sm:grid-cols-[13rem_1fr]"
            >
              <div>
                <code className="text-2xs text-ink-faint font-mono">{slot.utility}</code>
                <p
                  className={`mt-1 text-xl ${
                    slot.utility === 'font-mono'
                      ? 'font-mono'
                      : slot.utility === 'font-display'
                        ? 'font-display'
                        : 'font-sans'
                  }`}
                >
                  Kovvi 0123
                </p>
              </div>
              <p className="text-ink-muted text-sm">{slot.usage}</p>
            </div>
          ))}
        </div>
        <p className="text-2xs text-ink-faint mt-4 font-mono">
          {fontsSupplied
            ? 'Status: at least one supplied typeface is active.'
            : 'Status: no typeface supplied — system fallbacks in use. See BRAND-INTAKE.md.'}
        </p>
      </Section>

      <Section
        title="Contrast"
        note="Measured live by painting each token and reading the pixel back, so composed and translucent values are reported as they actually render."
      >
        {measurements === null ? (
          <p className="text-ink-faint text-sm">Measuring…</p>
        ) : (
          <>
            <p className="mb-4 font-mono text-2xs tracking-wide uppercase">
              {failures.length === 0 ? (
                <span className="text-positive">All {measurements.length} pairings pass</span>
              ) : (
                <span className="text-critical">
                  {failures.length} of {measurements.length} pairings fail
                </span>
              )}
            </p>
            <table className="w-full text-left">
              <thead>
                <tr className="rule-b text-2xs text-ink-faint font-mono tracking-wide uppercase">
                  <th className="py-2 font-normal">Pairing</th>
                  <th className="py-2 font-normal">Min</th>
                  <th className="py-2 font-normal">Light</th>
                  <th className="py-2 font-normal">Dark</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map(({ pair, light, dark }) => (
                  <tr key={`${pair.foreground}/${pair.background}`} className="rule-b align-top">
                    <td className="py-2.5">
                      <div className="text-sm">{pair.usage}</div>
                      <code className="text-2xs text-ink-faint font-mono">
                        {pair.foreground.replace('--kv-', '')} on{' '}
                        {pair.background.replace('--kv-', '')}
                      </code>
                    </td>
                    <td className="text-ink-muted py-2.5 font-mono text-xs">
                      {pair.minimum.toFixed(1)}
                    </td>
                    <RatioCell result={light} />
                    <RatioCell result={dark} />
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {COLOR_GROUPS.map((group) => (
        <Section key={group.title} title={group.title} note={group.note}>
          <div className="rule-t">
            {group.tokens.map((token) => (
              <div
                key={token.cssVar}
                className="rule-b grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[1fr_5rem_5rem]"
              >
                <div>
                  <code className="font-mono text-xs">{token.utility}</code>
                  <p className="text-ink-muted mt-0.5 text-sm">{token.role}</p>
                  <code className="text-2xs text-ink-faint mt-0.5 block font-mono">
                    {token.cssVar}
                  </code>
                </div>
                <Swatch cssVar={token.cssVar} theme="light" />
                <Swatch cssVar={token.cssVar} theme="dark" />
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Type scale" note="Editorial steps. Dense metadata at the bottom, marketing at the top.">
        <div className="rule-t">
          {TYPE_STEPS.map((step) => (
            <div key={step.name} className="rule-b flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
              <span className={`font-display ${step.name} leading-none font-medium`}>Kovvi</span>
              <code className="text-2xs text-ink-faint font-mono">{step.name}</code>
              <span className="text-ink-muted text-sm">{step.usage}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius" note="Five steps. Geometry is a brand decision and swaps with the palette.">
        <div className="flex flex-wrap gap-6 pt-2">
          {RADIUS_TOKENS.map((radius) => (
            <div key={radius.name} className="w-40">
              <div
                className="bg-sunken border-line-strong h-16 w-full border"
                style={{ borderRadius: `var(${radius.name})` }}
              />
              <code className="text-2xs text-ink-faint mt-2 block font-mono">{radius.name}</code>
              <p className="text-ink-muted mt-0.5 text-xs">{radius.usage}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Motion"
        note="Every animation reads these tokens, so the reduced-motion block in globals.css disables all of it at once. Hover a bar to play it."
      >
        <div className="rule-t">
          {MOTION_TOKENS.map((motion) => (
            <div key={motion.name} className="rule-b group flex items-center gap-6 py-3">
              <div className="bg-sunken h-2 w-40 overflow-hidden rounded-full">
                <div
                  className="bg-accent ease-out h-full w-0 transition-[width] group-hover:w-full"
                  style={{ transitionDuration: `var(${motion.name})` }}
                />
              </div>
              <code className="text-2xs text-ink-faint font-mono">{motion.name}</code>
              <span className="text-ink-muted text-xs">{motion.usage}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function RatioCell({ result }: { result: { ratio: number; pass: boolean } | null }) {
  if (!result) {
    return <td className="text-ink-faint py-2.5 font-mono text-xs">—</td>;
  }
  return (
    <td className="py-2.5 font-mono text-xs">
      <span className={result.pass ? 'text-positive' : 'text-critical'}>
        {result.pass ? '✓' : '✕'} {formatRatio(result.ratio)}
      </span>
    </td>
  );
}

function Swatch({ cssVar, theme }: { cssVar: string; theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme}>
      {/* The swatch paints the tier-2 variable, which `data-theme` genuinely
          redefines on this element. Painting a tier-3 name here would inherit
          the :root value and show the same colour in both columns. */}
      <div
        className="border-line-strong h-10 w-full rounded-sm border"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <span className="text-2xs text-ink-faint mt-1 block font-mono">{theme}</span>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line-strong border-t py-12">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-ink-muted mt-2 mb-6 max-w-(--spacing-measure) text-sm text-pretty">
        {note}
      </p>
      {children}
    </section>
  );
}
