import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WS_PATH, startServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
// The built client, unless STATIC_DIR points elsewhere.
const defaultStatic = fileURLToPath(new URL('../../client/dist', import.meta.url));
const staticDir = process.env.STATIC_DIR ?? (existsSync(defaultStatic) ? defaultStatic : undefined);

const server = await startServer({ port, host, staticDir });
console.log(`Server läuft auf http://${host}:${server.port} (WebSocket: ${WS_PATH})`);
console.log(staticDir ? `Oberfläche aus ${staticDir}` : 'Keine gebaute Oberfläche gefunden (npm run build)');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
