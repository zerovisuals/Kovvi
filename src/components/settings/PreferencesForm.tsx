'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePreferences, type ActionResult } from '@/server/settings/actions';

export type PreferenceValues = {
  readonly timezone: string;
  readonly locale: string;
  readonly capacity: 'open' | 'booked';
  readonly reducedMotion: boolean;
  readonly defaultRunCap: number;
};

/**
 * Preferences.
 *
 * `capacity` is the one with consequences: a freelancer who is booked does not
 * want a pipeline filling up with work they cannot take, so marking yourself
 * booked pauses saved searches rather than merely recording a mood. The control
 * says so, because a setting with a side effect the user did not expect is
 * indistinguishable from a bug.
 */
export function PreferencesForm({ values }: { readonly values: PreferenceValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(values);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  function submit() {
    startTransition(async () => {
      setNotice(await savePreferences(form));
      router.refresh();
    });
  }

  return (
    <div className="max-w-(--spacing-measure) space-y-6">
      <fieldset>
        <legend className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
          Availability
        </legend>
        <p className="text-ink-muted mt-2 text-sm text-pretty">
          Marking yourself booked pauses every saved search. Nothing you have already found is
          touched.
        </p>
        <div className="mt-3 flex gap-2">
          {(['open', 'booked'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setForm((current) => ({ ...current, capacity: option }))}
              aria-pressed={form.capacity === option}
              className={`ease-out inline-flex h-9 items-center rounded-sm border px-3 text-sm transition-colors duration-instant ${
                form.capacity === option
                  ? 'border-line-strong bg-sunken font-medium'
                  : 'border-line hover:bg-sunken'
              }`}
            >
              {option === 'open' ? 'Open to work' : 'Booked'}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
          Default results per run
        </span>
        <input
          value={form.defaultRunCap}
          inputMode="numeric"
          onChange={(fired) =>
            setForm((current) => ({
              ...current,
              defaultRunCap: Number(fired.target.value.replace(/[^\d]/g, '') || 0),
            }))
          }
          className="border-line-strong bg-page mt-1.5 block h-9 w-28 rounded-sm border px-2.5 text-sm tabular-nums"
        />
        <span className="text-ink-faint mt-1 block text-xs text-pretty">
          The ceiling a new run starts with. A run stops at its cap and keeps what it found.
        </span>
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            Time zone
          </span>
          <input
            value={form.timezone}
            onChange={(fired) =>
              setForm((current) => ({ ...current, timezone: fired.target.value }))
            }
            className="border-line-strong bg-page mt-1.5 block h-9 w-56 rounded-sm border px-2.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
            Language
          </span>
          <input
            value={form.locale}
            onChange={(fired) => setForm((current) => ({ ...current, locale: fired.target.value }))}
            className="border-line-strong bg-page mt-1.5 block h-9 w-28 rounded-sm border px-2.5 text-sm"
          />
        </label>
      </div>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={form.reducedMotion}
          onChange={(fired) =>
            setForm((current) => ({ ...current, reducedMotion: fired.target.checked }))
          }
          className="accent-accent mt-1"
        />
        <span className="text-sm text-pretty">
          Reduce motion regardless of my system setting. Kovvi already honours the system
          preference; this overrides it for people whose system setting is wrong for them.
        </span>
      </label>

      <div>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="bg-accent text-accent-ink ease-out inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
        >
          Save preferences
        </button>

        {notice ? (
          <p className={`mt-3 text-sm ${notice.ok ? 'text-ink-muted' : 'text-caution'}`}>
            {notice.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
