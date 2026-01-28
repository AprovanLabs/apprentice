import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

export async function computeContentHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  await pipeline(stream, hash);

  return hash.digest('hex');
}

export function computeContentHashSync(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
