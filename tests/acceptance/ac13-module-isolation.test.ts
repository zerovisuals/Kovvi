import { describe, expect, it } from 'vitest';
import { BUILT_MODULES, getModule, MODULES } from '@/server/modules/registry';

/**
 * ACCEPTANCE CASE 13 — "Multi-industry search: correct sources and filters for
 * each selected module; no game-specific assumptions applied to other
 * businesses."
 *
 * The brief is emphatic that esports is "one use case, not the product's
 * identity". The failure this guards against is subtle: a product built
 * esports-first leaks its vocabulary outward, and a consultancy gets assessed
 * for roster presentation.
 *
 * It also pins the honest coverage claim. Two modules are built, five are
 * declared, and every one says which — a module that quietly returned nothing
 * would look identical to an industry with no prospects in it.
 */

describe('module coverage claims', () => {
  it('declares all seven industries from the brief', () => {
    expect(MODULES.map((entry) => entry.id).sort()).toEqual([
      'creators',
      'esports',
      'fashion',
      'hospitality',
      'local_services',
      'professional',
      'software',
    ]);
  });

  it('marks exactly the modules that are genuinely built', () => {
    expect(BUILT_MODULES.map((entry) => entry.id).sort()).toEqual([
      'fashion',
      'local_services',
    ]);
  });

  it('makes every unbuilt module say so in its own coverage note', () => {
    for (const entry of MODULES.filter((candidate) => !candidate.built)) {
      expect(entry.coverageNote, entry.id).toMatch(/declared, not built/i);
    }
  });

  it('makes every built module claim only what it has', () => {
    for (const entry of BUILT_MODULES) {
      expect(entry.coverageNote, entry.id).toMatch(/benchmark cases/i);
      // Even a built module is honest about needing a search provider.
      expect(entry.coverageNote, entry.id).toMatch(/search provider|imported URLs/i);
    }
  });

  it('names a discovery source for every module, even if only manual import', () => {
    for (const entry of MODULES) {
      expect(entry.discoveryCapabilities.length, entry.id).toBeGreaterThan(0);
      expect(entry.discoveryCapabilities).toContain('manual_url_import');
    }
  });
});

describe('no industry leaks its vocabulary into another', () => {
  const ESPORTS_TERMS = /\broster|jersey|tournament|squad|tier 1|esports\b/i;

  it('keeps esports language inside the esports module', () => {
    for (const entry of MODULES.filter((candidate) => candidate.id !== 'esports')) {
      expect(entry.assessmentFocus, `${entry.id} assessmentFocus`).not.toMatch(ESPORTS_TERMS);
      expect(entry.description, `${entry.id} description`).not.toMatch(ESPORTS_TERMS);
      expect(
        entry.reasonsToInvestigate.join(' '),
        `${entry.id} reasonsToInvestigate`,
      ).not.toMatch(ESPORTS_TERMS);
    }
  });

  it('does use that language where it belongs', () => {
    const esports = getModule('esports');
    expect(esports.assessmentFocus).toMatch(/roster/i);
    // And distinguishes an amateur squad from a funded organization, rather
    // than assuming any team has a budget.
    expect(esports.assessmentFocus).toMatch(/independent squad|funded organization/i);
  });

  it('gives each module filters that make sense only for it', () => {
    const keys = new Map<string, string[]>();

    for (const entry of MODULES) {
      for (const filter of entry.filters) {
        keys.set(filter.key, [...(keys.get(filter.key) ?? []), entry.id]);
      }
    }

    // `radius` belongs to local services; `tier` to esports. A filter shared
    // across unrelated industries usually means one module's assumptions have
    // been generalised where they do not apply.
    expect(keys.get('radius')).toEqual(['local_services']);
    expect(keys.get('tier')).toEqual(['esports']);
    expect(keys.get('venue_type')).toEqual(['hospitality']);
  });
});

describe('each module states what it refuses to conclude', () => {
  it.each([
    ['hospitality', /OpenTable|Resy|booking route/i],
    ['software', /funding is context|never a promised/i],
    ['creators', /not evidence of budget/i],
    ['professional', /never inferred|confidential/i],
    ['fashion', /functioning commercial route|not a missing one/i],
    ['local_services', /directory listings are frequently wrong|verified beyond/i],
  ] as const)('%s names its characteristic false positive', (id, pattern) => {
    // Each module's assessment focus carries the mistake it is most likely to
    // make. Writing it down is what stops it being made.
    expect(getModule(id).assessmentFocus).toMatch(pattern);
  });
});
