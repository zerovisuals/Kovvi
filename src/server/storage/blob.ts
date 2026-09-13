import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where captured bytes live.
 *
 * One interface, two backends. The filesystem is used everywhere today; S3
 * exists in the capability registry for deployments without a durable disk and
 * slots in behind the same three methods. Callers never learn which is active,
 * so retention and deletion work identically either way.
 */

export type BlobRef = string;

export type StoredBlob = {
  readonly ref: BlobRef;
  readonly bytes: number;
  readonly sha256: string;
  readonly contentType: string;
};

export interface BlobStore {
  put(key: string, data: Buffer, contentType: string): Promise<StoredBlob>;
  get(ref: BlobRef): Promise<Buffer>;
  delete(ref: BlobRef): Promise<void>;
}

const ROOT = resolve(process.cwd(), process.env.KOVVI_BLOB_DIR ?? '.blobs');

/**
 * Keys are built from ids we generate, but they still get validated: a key
 * containing `..` would write outside the blob root, and "it can't happen"
 * is not a property worth relying on for a path.
 */
function safePath(key: string): string {
  if (key.includes('..') || key.startsWith('/') || key.includes('\0')) {
    throw new Error(`Unsafe blob key: ${key}`);
  }

  const full = resolve(ROOT, key);
  if (!full.startsWith(ROOT + sep)) {
    throw new Error(`Blob key escapes the storage root: ${key}`);
  }
  return full;
}

export class FilesystemBlobStore implements BlobStore {
  async put(key: string, data: Buffer, contentType: string): Promise<StoredBlob> {
    const path = safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);

    return {
      ref: key,
      bytes: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
      contentType,
    };
  }

  async get(ref: BlobRef): Promise<Buffer> {
    return readFile(safePath(ref));
  }

  async delete(ref: BlobRef): Promise<void> {
    try {
      await unlink(safePath(ref));
    } catch (error) {
      // Deleting something already gone is the desired end state, not an error.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

let store: BlobStore | undefined;

export function getBlobStore(): BlobStore {
  store ??= new FilesystemBlobStore();
  return store;
}

/** Deterministic key for an assessment capture. */
export function captureKey(assessmentId: string, viewport: string, index: number): string {
  return join('captures', assessmentId, `${viewport}-${index}.png`);
}
