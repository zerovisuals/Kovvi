import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { resolveAllCapabilities, type ResolvedCapability } from '@/server/capabilities/registry';
import { requireTenant } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'Connections' };

/**
 * What Kovvi can actually do right now.
 *
 * This screen is the capability registry rendered honestly. An unconnected
 * integration is shown with what you lose without it, stated plainly rather
 * than softened — because the alternative, a product that looks complete and
 * quietly does less, is exactly what the brief forbids.
 */
export default async function ConnectionsPage() {
  await requireTenant('/settings/connections');
  // Capability state is read from the environment, so this page must be
  // rendered per request. Without `connection()` Next would bake in whatever
  // the build machine had configured.
  await connection();

  const capabilities = resolveAllCapabilities();
  const live = capabilities.filter((c) => c.status.state === 'live');
  const absent = capabilities.filter((c) => c.status.state !== 'live');

  return (
    <>
      <PageHeader
        title="Connections"
        lede="Everything Kovvi can do without any setup, and everything that needs a key you supply. Nothing here is simulated: an unconnected service does not run, and the product says so wherever that matters."
        meta={
          <>
            <span>{live.length} available now</span>
            <span aria-hidden>·</span>
            <span>{absent.length} need credentials</span>
          </>
        }
      />

      <PageBody>
        <section>
          <h2 className="text-ink-faint font-mono text-2xs tracking-wide uppercase">
            Available now — no setup
          </h2>
          <ul className="rule-t mt-3">
            {live.map((capability) => (
              <CapabilityRow key={capability.id} capability={capability} />
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-ink-faint font-mono text-2xs tracking-wide uppercase">
            Not connected
          </h2>
          <p className="text-ink-muted mt-2 max-w-(--spacing-measure) text-sm text-pretty">
            These are built and tested. They are switched off because their credentials are not
            present — add a key and the feature works immediately, with no migration and nothing to
            redo.
          </p>
          <ul className="rule-t mt-4">
            {absent.map((capability) => (
              <CapabilityRow key={capability.id} capability={capability} />
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}

function CapabilityRow({ capability }: { capability: ResolvedCapability }) {
  const isLive = capability.status.state === 'live';

  return (
    <li className="rule-b grid grid-cols-1 gap-x-8 gap-y-3 py-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-base font-medium">{capability.label}</h3>
          <StatusMark live={isLive} />
        </div>

        <p className="text-ink-muted mt-1.5 max-w-(--spacing-measure) text-sm text-pretty">
          {capability.provides}
        </p>

        {!isLive ? (
          <p className="text-ink-faint mt-2 max-w-(--spacing-measure) text-sm text-pretty">
            <span className="text-ink-muted font-medium">Without it: </span>
            {capability.withoutIt}
          </p>
        ) : null}

        {capability.status.state === 'absent' && capability.status.missing.length > 0 ? (
          <p className="text-ink-faint mt-2 font-mono text-2xs">
            Needs {capability.status.missing.join(', ')}
          </p>
        ) : null}
      </div>

      {!isLive && capability.setupUrl ? (
        <div className="sm:pt-1">
          <a
            href={capability.setupUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="border-line-strong ease-out inline-flex items-center rounded-sm border px-3 py-1.5 text-sm transition-colors duration-instant hover:bg-sunken"
          >
            Get a key
          </a>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Status carried by glyph and label as well as colour, so it survives a
 * monochrome palette and colour-vision deficiency.
 */
function StatusMark({ live }: { live: boolean }) {
  return (
    <span
      data-capability-status={live ? 'live' : 'absent'}
      className={`text-2xs inline-flex items-center gap-1.5 font-mono tracking-wide uppercase ${
        live ? 'text-positive' : 'text-uncertain'
      }`}
    >
      <span aria-hidden>{live ? '●' : '○'}</span>
      {live ? 'Connected' : 'Not connected'}
    </span>
  );
}
