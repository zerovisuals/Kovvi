'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  approveMessage,
  editMessageBody,
  logManualSend,
  revokeApproval,
  type ActionResult,
} from '@/server/outreach/actions';
import type { ReviewRow } from '@/server/db/repo/outreach';

/**
 * THE CAMPAIGN REVIEW SCREEN.
 *
 * The brief's requirement is unusually specific here, and it is the right
 * requirement: the user sees the ACTUAL batch — every recipient and every exact
 * message body — before approving. So every row expands to the full text, not a
 * preview, not a first line, and not a merge-field template with placeholders
 * that will be filled in later by something the user never saw.
 *
 * Consequences of that, all visible on this screen:
 *
 *  - Approval is per message. There is no "approve all" button, because the
 *    thing being approved is each individual message's text.
 *  - Editing a message you already approved withdraws the approval, and the row
 *    says so in those words rather than silently reverting to unapproved.
 *  - Sending is a manual log while no email provider is connected. The button
 *    says what it does — it records that YOU sent it — instead of implying a
 *    dispatch that would not happen.
 */
export function ReviewBatch({
  rows,
  sendingLive,
}: {
  readonly rows: readonly ReviewRow[];
  /** Whether an email provider is actually connected. */
  readonly sendingLive: boolean;
}) {
  const [open, setOpen] = useState<string | null>(rows[0]?.messageId ?? null);

  const approved = rows.filter((row) => row.approvedForThisVersion);
  const stale = rows.filter((row) => row.staleApproval);
  const blocked = rows.filter((row) => row.blockedReason !== null);

  return (
    <div>
      <div className="border-line-strong bg-sunken rounded-md border p-4">
        <p className="text-sm text-pretty">
          <span className="font-medium">
            {approved.length} of {rows.length} approved.
          </span>{' '}
          Each message is approved on its own text. Editing one withdraws its approval, and there
          is no way to approve the batch without reading it.
        </p>

        {stale.length > 0 ? (
          <p className="text-caution mt-2 text-sm text-pretty">
            ▲ {stale.length} message{stale.length === 1 ? ' was' : 's were'} edited after being
            approved. The earlier approval no longer covers the current text.
          </p>
        ) : null}

        {blocked.length > 0 ? (
          <p className="text-ink-muted mt-2 text-sm text-pretty">
            {blocked.length} cannot be sent regardless of approval. The reason is on the row.
          </p>
        ) : null}

        {!sendingLive ? (
          <p className="text-ink-faint mt-3 text-sm text-pretty">
            No email provider is connected, so nothing can be dispatched from here. Approved
            messages can be copied and sent yourself, then logged so follow-ups and replies stay
            accurate.
          </p>
        ) : null}
      </div>

      <ul className="rule-t mt-8">
        {rows.map((row) => (
          <ReviewRowView
            key={row.messageId}
            row={row}
            expanded={open === row.messageId}
            onToggle={() => setOpen(open === row.messageId ? null : row.messageId)}
            sendingLive={sendingLive}
          />
        ))}
      </ul>
    </div>
  );
}

function ReviewRowView({
  row,
  expanded,
  onToggle,
  sendingLive,
}: {
  readonly row: ReviewRow;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly sendingLive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.body);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  function run(work: () => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await work();
      setNotice(outcome);
      router.refresh();
    });
  }

  const sent = row.sendStatus !== null && row.sendStatus !== 'pending';

  return (
    <li className="rule-b py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={onToggle}
          className="ease-out flex min-w-0 items-baseline gap-3 text-left transition-opacity duration-instant hover:opacity-70"
          aria-expanded={expanded}
        >
          <span aria-hidden className="text-ink-faint font-mono text-2xs">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="font-display text-base font-medium tracking-tight">
            {row.organization}
          </span>
        </button>

        <div className="text-2xs text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
          <span>{row.recipient ?? 'no contact'}</span>
          {row.recipientVerification ? <span>{row.recipientVerification}</span> : null}
          <span aria-hidden>·</span>
          <span>v{row.version}</span>
          <span>
            {row.groundingCount} source{row.groundingCount === 1 ? '' : 's'}
          </span>
          {row.approvedForThisVersion ? (
            <span className="text-positive">● approved</span>
          ) : row.staleApproval ? (
            <span className="text-caution">▲ approval out of date</span>
          ) : (
            <span>○ not approved</span>
          )}
          {sent ? <span className="text-positive">✓ logged as sent</span> : null}
        </div>
      </div>

      {row.blockedReason ? (
        <p className="text-caution mt-2 text-sm text-pretty">
          Blocked: {row.blockedReason.replace(/_/g, ' ')}. Approval does not override this.
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-4 pl-6">
          {row.subject ? (
            <p className="text-sm">
              <span className="text-ink-faint font-mono text-2xs">SUBJECT </span>
              {row.subject}
            </p>
          ) : null}

          {editing ? (
            <textarea
              value={draft}
              onChange={(fired) => setDraft(fired.target.value)}
              rows={12}
              className="border-line-strong bg-page mt-3 block w-full max-w-(--spacing-measure) rounded-sm border p-3 text-sm"
            />
          ) : (
            /* The exact bytes that would go out. Not a preview. */
            <pre className="border-line bg-card mt-3 max-w-(--spacing-measure) rounded-sm border p-4 text-sm whitespace-pre-wrap">
              {row.body}
            </pre>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    run(() => editMessageBody(row.messageId, draft));
                    setEditing(false);
                  }}
                  className="bg-accent text-accent-ink ease-out inline-flex h-8 items-center rounded-sm px-3 text-sm transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
                >
                  Save as a new version
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(row.body);
                    setEditing(false);
                  }}
                  className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {row.approvedForThisVersion ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeApproval(row.messageId))}
                    className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
                  >
                    Withdraw approval
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => approveMessage(row.messageId))}
                    className="bg-accent text-accent-ink ease-out inline-flex h-8 items-center rounded-sm px-3 text-sm transition-opacity duration-instant hover:opacity-90 disabled:opacity-40"
                  >
                    Approve this text
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken"
                >
                  Edit
                </button>

                {row.approvedForThisVersion && !sent && row.blockedReason === null ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => logManualSend(row.messageId))}
                    className="border-line-strong ease-out inline-flex h-8 items-center rounded-sm border px-3 text-sm transition-colors duration-instant hover:bg-sunken disabled:opacity-40"
                    title={
                      sendingLive
                        ? 'Records that this message went out.'
                        : 'No provider is connected. This records that you sent it yourself.'
                    }
                  >
                    {sendingLive ? 'Log as sent' : 'I sent this myself — log it'}
                  </button>
                ) : null}

                <Link
                  href={`/opportunities/${row.opportunityId}`}
                  className="text-ink-muted ease-out inline-flex h-8 items-center text-sm underline underline-offset-4 transition-opacity duration-instant hover:opacity-70"
                >
                  Check the evidence
                </Link>
              </>
            )}
          </div>

          {row.pendingFollowUps > 0 ? (
            <p className="text-ink-faint mt-3 font-mono text-2xs">
              {row.pendingFollowUps} follow-up{row.pendingFollowUps === 1 ? '' : 's'} scheduled ·
              cancelled automatically if they reply
            </p>
          ) : null}

          {notice ? (
            <p
              className={`mt-3 text-sm text-pretty ${notice.ok ? 'text-ink-muted' : 'text-caution'}`}
            >
              {notice.detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
