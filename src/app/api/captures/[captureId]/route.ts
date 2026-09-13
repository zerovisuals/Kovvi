import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { capture } from '@/server/db/schema';
import { getTenantContext } from '@/server/auth/session';
import { getBlobStore } from '@/server/storage/blob';

export const runtime = 'nodejs';

/**
 * Serves a stored screenshot.
 *
 * Captures are bytes fetched from someone else's website, so they are served
 * through an authorised route rather than from a public directory. Two
 * consequences worth stating:
 *
 *  - A signed-out request gets 404, not 401. A different response for "exists
 *    but not yours" would let anyone enumerate which businesses have been
 *    assessed, which is commercially sensitive information about other users.
 *  - The Content-Security-Policy is maximal: the payload is a PNG from an
 *    untrusted origin, and `sandbox` plus `default-src 'none'` means even a
 *    crafted file that a browser mis-sniffs as HTML can do nothing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { captureId } = await params;

  const ctx = await getTenantContext();
  if (!ctx) return new Response('Not found', { status: 404 });

  const [row] = await getDb().select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!row) return new Response('Not found', { status: 404 });

  try {
    const bytes = await getBlobStore().get(row.blobRef);

    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.byteLength),
        // Immutable: a capture is a record of one moment and never changes.
        'cache-control': 'private, max-age=86400, immutable',
        'content-security-policy': "default-src 'none'; sandbox",
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    // The row exists but the bytes are gone — a pruned retention window, or a
    // filesystem that did not survive a redeploy.
    return new Response('Capture is no longer stored', { status: 410 });
  }
}
