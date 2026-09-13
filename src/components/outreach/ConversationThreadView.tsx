'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { classifyReply, logReply, type ActionResult } from '@/server/outreach/actions';
import type { ConversationThread } from '@/server/db/repo/outreach';

const INTENTS = [
  ['interested', 'Interested'],
  ['not_now', 'Not now'],
  ['not_interested', 'Not interested'],
  ['opt_out', 'Asked not to be contacted'],
  ['auto_reply', 'Automatic reply'],
] as const;

/**
 * One conversation.
 *
 * Inbound messages arrive `unclassified` and stay that way until the user says
 * otherwise. That is not a missing feature — a polite brush-off reads a great
 * deal like interest to a classifier, and a wrong guess sends the freelancer
 * chasing exactly the conversations that were never going anywhere. The label
 * under each reply says whose reading it is.
 */
export function ConversationThreadView({ thread }: { readonly thread: ConversationThread }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState<ActionResult | null>(null);

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      setNotice(await work());
      router.refresh();
    });
  }

  return (
    <div className="max-w-(--spacing-measure)">
      <ol className="space-y-6">
        {thread.messages.map((entry) => {
          const inbound = entry.direction === 'inbound';

          return (
            <li key={entry.id}>
              <div className="text-2xs text-ink-faint flex flex-wrap items-center gap-x-3 font-mono tracking-wide uppercase">
                <span>
                  {inbound
                    ? 'They wrote'
                    : entry.direction === 'manual_log'
                      ? 'You sent — logged by hand'
                      : 'Sent'}
                </span>
                <span aria-hidden>·</span>
                <span>{entry.occurredAt.toISOString().slice(0, 16).replace('T', ' ')}</span>
              </div>

              <pre
                className={`mt-2 rounded-sm border p-4 text-sm whitespace-pre-wrap ${
                  inbound ? 'border-line-strong bg-card' : 'border-line bg-sunken'
                }`}
              >
                {entry.body}
              </pre>

              {inbound ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-2xs text-ink-faint font-mono">
                    {entry.intent === 'unclassified'
                      ? 'Not classified — the system does not guess what a reply meant'
                      : `You read this as: ${entry.intent.replace(/_/g, ' ')}`}
                  </span>
                  {INTENTS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={pending || entry.intent === value}
                      onClick={() => run(() => classifyReply(entry.id, value))}
                      className="border-line ease-out rounded-xs border px-2 py-0.5 font-mono text-2xs transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="rule-t mt-10 pt-6">
        <h2 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
          Log a reply you received
        </h2>
        <p className="text-ink-muted mt-2 text-sm text-pretty">
          With no inbox connected, replies are recorded by pasting them. Doing so cancels every
          scheduled follow-up for this opportunity in the same transaction.
        </p>

        <textarea
          value={reply}
          onChange={(fired) => setReply(fired.target.value)}
          rows={5}
          placeholder="Paste what they wrote back."
          className="border-line-strong bg-page mt-3 block w-full rounded-sm border p-3 text-sm"
        />

        <button
          type="button"
          disabled={pending || reply.trim().length === 0}
          onClick={() => {
            run(() => logReply(thread.opportunityId, reply));
            setReply('');
          }}
          className="bg-accent text-accent-ink ease-out mt-3 inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
        >
          Record the reply
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
