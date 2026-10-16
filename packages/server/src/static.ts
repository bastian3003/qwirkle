import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built client from `root`. Unknown paths fall back to index.html so
 * invite links like /?raum=ABCDE always open the app. Returns false if the
 * request is not a GET/HEAD, so the caller can answer it.
 */
export function createStaticHandler(root: string) {
  const base = resolve(root);
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      return false;
    }
    let file = normalize(join(base, pathname));
    // Never serve anything outside the client folder.
    if (file !== base && !file.startsWith(base + sep)) return false;
    if (!(await isFile(file))) file = join(base, 'index.html');
    if (!(await isFile(file))) return false;

    const hashed = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // Vite puts a content hash into asset names, so those can be cached forever.
      // Everything else (index.html, manifest) must be revalidated to pick up updates.
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
    return true;
  };
}
