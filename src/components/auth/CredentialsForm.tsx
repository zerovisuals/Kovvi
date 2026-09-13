'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AuthResult } from '@/server/auth/actions';

/**
 * Sign-in and sign-up share a form; only the copy and the action differ.
 *
 * `useActionState` keeps the error next to the fields and preserves what the
 * user typed on failure. Retyping an email because the password was wrong is a
 * small insult that a form has no excuse for.
 */
export function CredentialsForm({
  mode,
  action,
}: {
  readonly mode: 'sign-in' | 'sign-up';
  readonly action: (prev: unknown, formData: FormData) => Promise<AuthResult>;
}) {
  const [result, formAction] = useActionState<AuthResult | null, FormData>(
    async (prev, formData) => action(prev, formData),
    null,
  );

  const isSignUp = mode === 'sign-up';
  const error = result && 'error' in result ? result.error : null;

  return (
    <div>
      <h1 className="font-display text-xl font-semibold tracking-tight">
        {isSignUp ? 'Create your workspace' : 'Sign in'}
      </h1>
      <p className="text-ink-muted mt-2 text-sm text-pretty">
        {isSignUp
          ? 'No card required. Nothing is sent on your behalf until you approve it.'
          : 'Welcome back.'}
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          required
          hint={isSignUp ? 'At least 10 characters. Length beats symbols.' : undefined}
        />

        {error ? (
          <p role="alert" className="text-critical text-sm text-pretty">
            {error}
          </p>
        ) : null}

        <Submit label={isSignUp ? 'Create workspace' : 'Sign in'} />
      </form>

      <p className="text-ink-muted mt-6 text-sm">
        {isSignUp ? 'Already have an account? ' : 'No account yet? '}
        <Link
          href={isSignUp ? '/sign-in' : '/sign-up'}
          className="text-ink underline underline-offset-4"
        >
          {isSignUp ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  name,
  ...props
}: {
  readonly label: string;
  readonly hint?: string;
  readonly name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-describedby={hintId}
        className="border-line-strong bg-card ease-out mt-1.5 h-10 w-full rounded-sm border px-3 text-sm transition-colors duration-instant focus:border-line-strong"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-ink-faint mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-ink ease-out mt-2 inline-flex h-10 items-center justify-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-60"
    >
      {/* Deliberately not a spinner: the label says what is happening. */}
      {pending ? 'Working…' : label}
    </button>
  );
}
