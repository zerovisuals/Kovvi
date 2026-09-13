import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAPABILITIES,
  CapabilityAbsentError,
  capabilityState,
  isLive,
  requireCapability,
  resolveAllCapabilities,
  type CapabilityId,
} from '@/server/capabilities/registry';

/**
 * THE HONESTY GUARD
 *
 * Written now, in phase 2, rather than at the end — on purpose.
 *
 * The temptation to fake an integration does not arrive while the registry is
 * being designed. It arrives later, when a screen looks empty and a demo is
 * due. By then a test that would have caught it feels like an obstacle. So it
 * goes in before the pressure exists.
 *
 * What this asserts:
 *   1. With every optional credential unset, the capabilities that need none
 *      stay live and the rest report themselves absent.
 *   2. Absence is descriptive: each one states what is lost without it.
 *   3. No source file contains a fallback that fabricates output when a
 *      capability is missing.
 */

const OPTIONAL_ENV = [
  'ANTHROPIC_API_KEY',
  'SEARCH_API_PROVIDER',
  'SEARCH_API_KEY',
  'RESEND_API_KEY',
  'KOVVI_SENDING_DOMAIN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

/** Capabilities that must work with no credentials whatsoever. */
const MUST_BE_LIVE_WITH_NOTHING: CapabilityId[] = [
  'manual_url_import',
  'public_web_fetch',
  'website_inspection',
  'contact_extraction',
  'template_drafting',
  'capture_storage',
];

/** Capabilities that must be absent without the user's own credentials. */
const MUST_BE_ABSENT_WITHOUT_KEYS: CapabilityId[] = [
  'llm_drafting',
  'web_search_discovery',
  'email_sending',
  'billing',
  'object_storage_s3',
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const name of OPTIONAL_ENV) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('with zero credentials', () => {
  it('keeps the core research workflow live', () => {
    for (const id of MUST_BE_LIVE_WITH_NOTHING) {
      expect(isLive(id), `${id} should work with no setup at all`).toBe(true);
    }
  });

  it('reports every credentialled capability as absent, never as working', () => {
    for (const id of MUST_BE_ABSENT_WITHOUT_KEYS) {
      const status = capabilityState(id);
      expect(status.state, `${id} must be absent without credentials`).toBe('absent');
      if (status.state === 'absent') {
        expect(status.missing.length, `${id} should name what it needs`).toBeGreaterThan(0);
      }
    }
  });

  it('names what is lost, rather than only that something is missing', () => {
    for (const capability of resolveAllCapabilities()) {
      expect(capability.provides.length, `${capability.id} does not say what it does`).toBeGreaterThan(
        10,
      );

      // Only capabilities that CAN be absent owe the user an explanation of
      // the loss. For one that needs no credentials, "always available" is the
      // complete and correct answer.
      if (capability.requires.length === 0) continue;

      expect(
        capability.withoutIt.length,
        `${capability.id} can be absent but does not explain what is lost without it`,
      ).toBeGreaterThan(40);
    }
  });

  it('throws a descriptive error rather than returning empty output', () => {
    expect(() => requireCapability('llm_drafting')).toThrow(CapabilityAbsentError);

    try {
      requireCapability('email_sending');
      expect.unreachable('requireCapability must throw when a capability is absent');
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityAbsentError);
      // The message has to carry the consequence, because it is what the UI
      // shows the user when a stage reports source_unavailable.
      expect((error as Error).message).toMatch(/not connected/i);
      expect((error as Error).message).toMatch(/RESEND_API_KEY/);
    }
  });

  it('becomes live as soon as the credentials appear', () => {
    expect(isLive('llm_drafting')).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key';
    expect(isLive('llm_drafting')).toBe(true);
  });
});

describe('the registry is the single source of truth', () => {
  it('has a unique id per capability', () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifies every capability as either free or credentialled', () => {
    const classified = [...MUST_BE_LIVE_WITH_NOTHING, ...MUST_BE_ABSENT_WITHOUT_KEYS];
    const unclassified = CAPABILITIES.map((c) => c.id).filter((id) => !classified.includes(id));

    expect(
      unclassified,
      unclassified.length === 0
        ? ''
        : `\nNew capabilities are not classified in this guard: ${unclassified.join(', ')}.\n` +
          `Add each to MUST_BE_LIVE_WITH_NOTHING or MUST_BE_ABSENT_WITHOUT_KEYS so its\n` +
          `absence behaviour is asserted rather than assumed.\n`,
    ).toEqual([]);
  });
});

/**
 * A source-level check for the shape a fake takes: code that notices a
 * capability is missing and produces plausible output anyway.
 */
describe('no simulation path exists in the source', () => {
  const ROOT = fileURLToPath(new URL('../..', import.meta.url));
  const SRC = join(ROOT, 'src');

  const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
    {
      pattern: /\b(?:MOCK|FAKE|DEMO|SIMULATE)_(?:MODE|DATA|RESPONSE)\b/g,
      why: 'A mode flag that substitutes invented output for a real integration.',
    },
    {
      pattern: /\bfakeResponse|simulateProvider|pretendSent|mockSend\b/g,
      why: 'A function that manufactures a provider result.',
    },
  ];

  function walk(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...walk(full));
      else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(full);
    }
    return found;
  }

  it('contains no mock-mode escape hatch', () => {
    const violations: string[] = [];

    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN) {
        const matches = source.match(rule.pattern);
        if (matches) {
          violations.push(`${relative(ROOT, file)} — "${matches[0]}"\n      ${rule.why}`);
        }
      }
    }

    expect(
      violations,
      violations.length === 0
        ? ''
        : `\nAn absent capability must stay absent, never simulated:\n\n${violations.join('\n')}\n`,
    ).toEqual([]);
  });
});
