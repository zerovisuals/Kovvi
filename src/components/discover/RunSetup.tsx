'use client';

import { useMemo, useState } from 'react';

/**
 * Setting up a research run.
 *
 * Two design decisions carry the brief's requirements:
 *
 *  - The cost estimate is a CEILING, not a projection. The user sets a limit
 *    and the run stops there with its results intact. A projection would invite
 *    the question "what if it goes over", and the answer would have to be
 *    "it cannot", so the control says that directly.
 *  - Unbuilt modules are selectable, with their limitation stated. Hiding them
 *    would be tidier and would misrepresent what the product covers; greying
 *    them out would imply they do nothing, when in fact imported URLs still get
 *    the full general assessment.
 */

export type ModuleOption = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly assessmentFocus: string;
  readonly reasonsToInvestigate: readonly string[];
  readonly filters: readonly { key: string; label: string; kind: string; options?: readonly string[]; hint?: string }[];
  readonly built: boolean;
  readonly coverageNote: string;
  readonly discoveryLive: boolean;
  readonly needsSearchProvider: boolean;
};

export function RunSetup({
  modules,
  balance,
  searchProviderConnected,
}: {
  readonly modules: readonly ModuleOption[];
  readonly balance: number;
  readonly searchProviderConnected: boolean;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['local_services']));
  const [cap, setCap] = useState(25);
  const [importedUrls, setImportedUrls] = useState('');

  const chosen = modules.filter((module) => selected.has(module.id));
  const unbuiltChosen = chosen.filter((module) => !module.built);

  const importCount = useMemo(
    () => importedUrls.split(/\s+/).filter((line) => line.trim().length > 0).length,
    [importedUrls],
  );

  const effectiveCap = Math.min(cap, balance);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-(--spacing-measure)">
      {/* ── Industries ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Industries</h2>
        <p className="text-ink-muted mt-2 text-sm text-pretty">
          Two modules are fully built. The rest share the same evidence, identity and inspection
          machinery but have no tuned assessment rules yet — each says which it is.
        </p>

        <ul className="rule-t mt-4">
          {modules.map((module) => {
            const isSelected = selected.has(module.id);

            return (
              <li key={module.id} className="rule-b py-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(module.id)}
                    className="mt-1 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-base font-medium">{module.label}</span>
                      <span
                        className={`text-2xs font-mono tracking-wide uppercase ${
                          module.built ? 'text-positive' : 'text-uncertain'
                        }`}
                      >
                        {module.built ? '● built' : '○ declared only'}
                      </span>
                    </span>

                    <span className="text-ink-muted mt-1 block text-sm text-pretty">
                      {module.description}
                    </span>

                    {isSelected ? (
                      <span className="bg-sunken mt-3 block rounded-sm p-3">
                        <span className="text-2xs text-ink-faint block font-mono tracking-wide uppercase">
                          What this checks
                        </span>
                        <span className="text-ink-muted mt-1 block text-sm text-pretty">
                          {module.assessmentFocus}
                        </span>

                        <span className="text-2xs text-ink-faint mt-3 block font-mono tracking-wide uppercase">
                          Coverage
                        </span>
                        <span className="text-ink-muted mt-1 block text-sm text-pretty">
                          {module.coverageNote}
                        </span>

                        {module.filters.length > 0 ? (
                          <span className="mt-3 flex flex-wrap gap-2">
                            {module.filters.map((filter) => (
                              <span
                                key={filter.key}
                                className="border-line text-2xs text-ink-muted rounded-xs border px-2 py-1 font-mono"
                              >
                                {filter.label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Sources ───────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Sources</h2>

        <ul className="rule-t mt-3">
          <li className="rule-b flex items-baseline justify-between gap-4 py-3">
            <span className="text-sm">Manual URL and CSV import</span>
            <span className="text-2xs text-positive font-mono tracking-wide uppercase">
              ● available
            </span>
          </li>
          <li className="rule-b flex items-baseline justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm">Web search discovery</span>
              {!searchProviderConnected ? (
                <span className="text-ink-faint mt-0.5 block text-xs text-pretty">
                  Not connected. This run will cover only the URLs you import — the result is a
                  partial list, and it will be labelled as one.
                </span>
              ) : null}
            </span>
            <span
              className={`text-2xs shrink-0 font-mono tracking-wide uppercase ${
                searchProviderConnected ? 'text-positive' : 'text-uncertain'
              }`}
            >
              {searchProviderConnected ? '● available' : '○ not connected'}
            </span>
          </li>
        </ul>

        <div className="mt-6">
          <label htmlFor="urls" className="block text-sm font-medium">
            Import URLs
          </label>
          <p className="text-ink-muted mt-1 text-sm text-pretty">
            One per line. These are fetched and assessed exactly as discovered prospects are.
          </p>
          <textarea
            id="urls"
            value={importedUrls}
            onChange={(changeEvent) => setImportedUrls(changeEvent.target.value)}
            rows={4}
            placeholder={'https://example.com\nhttps://another.example'}
            className="border-line-strong bg-card mt-2 w-full rounded-sm border p-3 font-mono text-sm"
          />
          {importCount > 0 ? (
            <p className="text-ink-faint mt-1.5 font-mono text-2xs">
              {importCount} URL{importCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Budget ────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Limit</h2>
        <p className="text-ink-muted mt-2 text-sm text-pretty">
          A ceiling, not an estimate. The run stops here and keeps everything it has already found —
          you are never charged for work it did not do.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label htmlFor="cap" className="sr-only">
            Maximum assessments
          </label>
          <input
            id="cap"
            type="range"
            min={5}
            max={Math.max(5, Math.min(100, balance))}
            step={5}
            value={cap}
            onChange={(changeEvent) => setCap(Number(changeEvent.target.value))}
            className="max-w-xs flex-1"
          />
          <span className="font-display text-xl font-medium tabular-nums" data-numeric>
            {effectiveCap}
          </span>
          <span className="text-ink-muted text-sm">assessments at most</span>
        </div>

        {cap > balance ? (
          <p className="text-caution mt-2 font-mono text-2xs">
            Your allowance is {balance}, so the run will stop there.
          </p>
        ) : null}
      </section>

      {/* ── What will happen ──────────────────────────────────────────────── */}
      <section className="rule-t mt-12 pt-8 pb-16">
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
          What will happen
        </h2>

        <ul className="text-ink-muted mt-3 flex flex-col gap-2 text-sm">
          <li>
            · Up to <strong className="text-ink">{effectiveCap}</strong> organizations assessed
            across <strong className="text-ink">{chosen.length || 'no'}</strong> industr
            {chosen.length === 1 ? 'y' : 'ies'}
            {importCount > 0 ? `, starting with your ${importCount} imported URL${importCount === 1 ? '' : 's'}` : ''}.
          </li>
          <li>· Each assessed site is loaded in a real browser and captured on desktop and mobile.</li>
          <li>
            · A site that blocks us is recorded as inconclusive with no findings, and still costs an
            assessment — the attempt is the same work either way.
          </li>
          {!searchProviderConnected ? (
            <li className="text-caution">
              · Without a search provider, coverage is limited to what you import, and the results
              will be shown as partial.
            </li>
          ) : null}
          {unbuiltChosen.length > 0 ? (
            <li className="text-caution">
              · {unbuiltChosen.map((module) => module.label).join(', ')}{' '}
              {unbuiltChosen.length === 1 ? 'has' : 'have'} no tuned assessment rules, so those
              prospects get the general checks only.
            </li>
          ) : null}
        </ul>

        <button
          type="button"
          disabled={chosen.length === 0 || effectiveCap === 0}
          className="bg-accent text-accent-ink ease-out mt-6 inline-flex h-10 items-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-50"
        >
          Start research
        </button>
        <p className="text-ink-faint mt-2 font-mono text-2xs">
          Running a search is wired up in the next phase; the setup, estimate and limits above are
          live.
        </p>
      </section>
    </div>
  );
}
