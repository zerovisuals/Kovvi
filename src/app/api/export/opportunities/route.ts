import { getDb } from '@/server/db/client';
import { getTenantContext } from '@/server/auth/session';
import { exportOpportunitiesCsv } from '@/server/account/operations';
import { csvResponse } from '@/lib/export/csv';

export const runtime = 'nodejs';

/**
 * Exports this workspace's opportunities.
 *
 * 404 rather than 401 for a signed-out request, consistently with the rest of
 * the product: a different response would confirm the endpoint has something
 * behind it.
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return new Response('Not found', { status: 404 });

  const csv = await exportOpportunitiesCsv(getDb(), ctx);
  return csvResponse(`kovvi-opportunities-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
