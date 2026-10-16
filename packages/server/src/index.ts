import { WS_PATH, startServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = await startServer({ port, host });
console.log(`Server läuft auf http://${host}:${server.port} (WebSocket: ${WS_PATH})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
