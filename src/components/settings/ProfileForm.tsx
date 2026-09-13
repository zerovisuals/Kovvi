'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addPortfolioProject,
  removePortfolioProject,
  saveServiceProfile,
  setRepresentative,
  type ActionResult,
} from '@/server/settings/actions';

export type ProfileValues = {
  readonly headline: string;
  readonly services: string;
  readonly regions: string;
  readonly languages: string;
  readonly exclusions: string;
  readonly minProjectPrice: string;
  readonly confirmed: boolean;
};

export type ProjectRow = {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  readonly role: string | null;
  readonly isRepresentative: boolean;
};

/**
 * The service profile.
 *
 * The confirm checkbox is the load-bearing control on this screen, and it is
 * separated from "save" on purpose. Ranking matches against these claims and
 * drafts cite them by name, so the product needs a moment where the user
 * actively stands behind the text rather than having typed it once.
 */
export function ProfileForm({
  values,
  projects,
}: {
  readonly values: ProfileValues;
  readonly projects: readonly ProjectRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(values);
  const [confirm, setConfirm] = useState(values.confirmed);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const [project, setProject] = useState({
    url: '',
    title: '',
    role: '',
    summary: '',
    representative: true,
  });

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      setNotice(await work());
      router.refresh();
    });
  }

  function field<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const representatives = projects.filter((row) => row.isRepresentative);

  return (
    <div>
      {!values.confirmed ? (
        <p className="border-line-strong bg-sunken mb-8 max-w-(--spacing-measure) rounded-sm border p-3 text-sm text-pretty">
          This profile is a draft. Research runs refuse to start until it is confirmed — matching
          against claims you have not stood behind would put words in your mouth.
        </p>
      ) : null}

      <section className="max-w-(--spacing-measure) space-y-5">
        <Field
          label="Headline"
          hint="One line. Appears nowhere public; it orients the matching."
          value={form.headline}
          onChange={(value) => field('headline', value)}
        />
        <Field
          label="Services"
          hint="Comma separated. These are matched against what a prospect appears to need."
          value={form.services}
          onChange={(value) => field('services', value)}
        />
        <Field
          label="Regions"
          hint="Where you will take work. Comma separated."
          value={form.regions}
          onChange={(value) => field('regions', value)}
        />
        <Field
          label="Languages"
          hint="Languages you can hold a sales conversation in — not an offer to do translation."
          value={form.languages}
          onChange={(value) => field('languages', value)}
        />
        <Field
          label="Never approach"
          hint="Domains, names or handles to exclude outright. Comma separated."
          value={form.exclusions}
          onChange={(value) => field('exclusions', value)}
        />
        <Field
          label="Minimum project (€)"
          hint="Below this a lead is not worth the conversation. Filters discovery."
          value={form.minProjectPrice}
          onChange={(value) => field('minProjectPrice', value.replace(/[^\d]/g, ''))}
        />

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(fired) => setConfirm(fired.target.checked)}
            className="accent-accent mt-1"
          />
          <span className="text-sm text-pretty">
            I confirm this describes what I do. Kovvi may match prospects against it and cite it in
            drafts written for me.
          </span>
        </label>

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => saveServiceProfile({ ...form, confirm }))}
          className="bg-accent text-accent-ink ease-out inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
        >
          {confirm ? 'Save and confirm' : 'Save as a draft'}
        </button>

        {notice ? (
          <p className={`text-sm text-pretty ${notice.ok ? 'text-ink-muted' : 'text-caution'}`}>
            {notice.detail}
          </p>
        ) : null}
      </section>

      <section className="rule-t mt-12 pt-8">
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">Portfolio</h2>
        <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">
          Drafts cite one piece of your own confirmed work, chosen to match the prospect&rsquo;s
          industry. Mark the pieces you are happy to have named.{' '}
          {representatives.length === 0
            ? 'Nothing is marked yet, so drafts will not cite any work.'
            : `${representatives.length} marked.`}
        </p>

        {projects.length > 0 ? (
          <ul className="rule-t mt-4">
            {projects.map((row) => (
              <li
                key={row.id}
                className="rule-b flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{row.title ?? row.url}</span>
                  {row.role ? (
                    <span className="text-ink-faint ml-2 font-mono text-2xs">{row.role}</span>
                  ) : null}
                  <span className="text-ink-faint ml-2 font-mono text-2xs">{row.url}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setRepresentative(row.id, !row.isRepresentative))}
                    className="border-line ease-out rounded-xs border px-2 py-0.5 font-mono text-2xs transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
                  >
                    {row.isRepresentative ? '● cited in drafts' : '○ not cited'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => removePortfolioProject(row.id))}
                    className="text-ink-faint ease-out font-mono text-2xs underline underline-offset-4 transition-opacity duration-instant hover:opacity-70 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex max-w-(--spacing-measure) flex-wrap items-end gap-3">
          <Field
            label="Project URL"
            value={project.url}
            onChange={(value) => setProject((current) => ({ ...current, url: value }))}
          />
          <Field
            label="Title"
            value={project.title}
            onChange={(value) => setProject((current) => ({ ...current, title: value }))}
          />
          <Field
            label="Your role"
            value={project.role}
            onChange={(value) => setProject((current) => ({ ...current, role: value }))}
          />
          <button
            type="button"
            disabled={pending || project.url.trim().length === 0}
            onClick={() => {
              run(() => addPortfolioProject(project));
              setProject({ url: '', title: '', role: '', summary: '', representative: true });
            }}
            className="border-line-strong ease-out inline-flex h-9 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
          >
            Add project
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">{label}</span>
      <input
        value={value}
        onChange={(fired) => onChange(fired.target.value)}
        className="border-line-strong bg-page mt-1.5 block h-9 w-full rounded-sm border px-2.5 text-sm"
      />
      {hint ? <span className="text-ink-faint mt-1 block text-xs text-pretty">{hint}</span> : null}
    </label>
  );
}
