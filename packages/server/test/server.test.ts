import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMessage } from '../src/protocol';
import { type RunningServer, WS_PATH, startServer } from '../src/server';

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** A test client that queues incoming messages so tests can await them in order. */
class Client {
  readonly raw: string[] = [];
  private readonly queue: ServerMessage[] = [];
  private waiter: (() => void) | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.raw.push(data.toString());
      this.queue.push(JSON.parse(data.toString()));
      this.waiter?.();
    });
  }

  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    await new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject));
    return new Client(ws);
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /** Waits for the next message of the given type, skipping others. */
  async next<T extends ServerMessage['type']>(type: T): Promise<Of<T>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const index = this.queue.findIndex((m) => m.type === type);
      if (index !== -1) {
        const [msg] = this.queue.splice(0, index + 1).slice(-1);
        return msg as Of<T>;
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  /** Drops everything received so far. */
  clear(): void {
    this.queue.length = 0;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

let server: RunningServer;
const clients: Client[] = [];

async function connect(): Promise<Client> {
  const c = await Client.connect(server.port);
  clients.push(c);
  return c;
}

/** Two connected players in a started game. */
async function startGame() {
  const mama = await connect();
  mama.send({ type: 'create_room', name: 'Mama' });
  const welcome = await mama.next('welcome');
  const gabi = await connect();
  gabi.send({ type: 'join_room', code: welcome.code, name: 'Gabi' });
  const gabiWelcome = await gabi.next('welcome');
  const mamaRoom = await waitFor(mama, (r) => r.game !== null);
  const gabiRoom = await waitFor(gabi, (r) => r.game !== null);
  return { mama, gabi, code: welcome.code, mamaToken: welcome.token, gabiToken: gabiWelcome.token, mamaRoom, gabiRoom };
}

/** Waits for a room update matching the predicate. */
async function waitFor(client: Client, pred: (room: Of<'room'>['room']) => boolean) {
  for (;;) {
    const { room } = await client.next('room');
    if (pred(room)) return room;
  }
}

beforeEach(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1' });
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => (c.ws.readyState === WebSocket.OPEN ? c.close() : undefined)));
  await server.close();
});

describe('server', () => {
  it('answers health checks', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('creates a room and waits for the second player', async () => {
    const mama = await connect();
    mama.send({ type: 'create_room', name: 'Mama' });
    const welcome = await mama.next('welcome');
    expect(welcome.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(welcome.playerId).toBe('p1');
    const { room } = await mama.next('room');
    expect(room).toEqual({ code: welcome.code, players: [{ id: 'p1', name: 'Mama', connected: true }], game: null });
  });

  it('starts the game for both players when the second one joins', async () => {
    const { mamaRoom, gabiRoom } = await startGame();
    expect(mamaRoom.game!.you.id).toBe('p1');
    expect(gabiRoom.game!.you.id).toBe('p2');
    expect(mamaRoom.game!.you.hand).toHaveLength(6);
    expect(mamaRoom.game!.bagCount).toBe(96);
    expect(mamaRoom.game!.currentPlayerId).toBe(gabiRoom.game!.currentPlayerId);
  });

  it("never sends a player the other player's hand or token", async () => {
    const { mama, gabi, gabiRoom, gabiToken, mamaToken } = await startGame();
    const gabiTiles = gabiRoom.game!.you.hand.map((t) => t.id);
    const mamaAll = mama.raw.join('\n');
    for (const id of gabiTiles) expect(mamaAll).not.toContain(`"${id}"`);
    expect(mamaAll).not.toContain(gabiToken);
    expect(gabi.raw.join('\n')).not.toContain(mamaToken);
  });

  it('plays a move and updates both players', async () => {
    const { mama, gabi, mamaRoom, gabiRoom } = await startGame();
    const starterIsMama = mamaRoom.game!.isYourTurn;
    const [starter, other, view] = starterIsMama ? [mama, gabi, mamaRoom] : [gabi, mama, gabiRoom];

    // The other player is refused.
    other.send({ type: 'action', action: { type: 'pass' } });
    expect((await other.next('error')).error).toBe('NOT_YOUR_TURN');

    // Lay the longest possible line from the starter's hand as the opening move.
    const need = view.game!.minTilesFirstMove;
    const line = findStartLine(view.game!.you.hand, need);
    starter.send({
      type: 'action',
      action: { type: 'place', placements: line.map((tileId, i) => ({ x: i, y: 0, tileId })) },
    });
    const after = await waitFor(other, (r) => r.game!.lastMove !== null);
    expect(after.game!.lastMove).toMatchObject({ type: 'place', score: need });
    expect(after.game!.isYourTurn).toBe(true);
    expect(Object.keys(after.game!.board)).toHaveLength(need);
    const starterAfter = await waitFor(starter, (r) => r.game!.lastMove !== null);
    expect(starterAfter.game!.you.hand).toHaveLength(6);
    expect(starterAfter.game!.you.score).toBe(need);
  });

  it('reports invalid messages and actions outside a room', async () => {
    const c = await connect();
    c.send('{bad json');
    expect((await c.next('error')).error).toBe('INVALID_MESSAGE');
    c.send({ type: 'action', action: { type: 'pass' } });
    expect((await c.next('error')).error).toBe('NOT_IN_ROOM');
    c.send({ type: 'join_room', code: 'ZZZZZ', name: 'Eva' });
    expect((await c.next('error')).error).toBe('ROOM_NOT_FOUND');
  });

  it('refuses a third player', async () => {
    const { code } = await startGame();
    const eva = await connect();
    eva.send({ type: 'join_room', code, name: 'Eva' });
    expect((await eva.next('error')).error).toBe('ROOM_FULL');
  });

  it('shows a disconnect and lets the player resume with the token', async () => {
    const { mama, gabi, code, gabiToken, gabiRoom } = await startGame();
    mama.clear();
    await gabi.close();
    const offline = await waitFor(mama, (r) => r.players[1]!.connected === false);
    expect(offline.players[1]!.name).toBe('Gabi');

    const gabi2 = await connect();
    gabi2.send({ type: 'resume', code, token: 'wrong' });
    expect((await gabi2.next('error')).error).toBe('SESSION_NOT_FOUND');

    gabi2.send({ type: 'resume', code, token: gabiToken });
    expect((await gabi2.next('welcome')).playerId).toBe('p2');
    const resumed = await gabi2.next('room');
    expect(resumed.room.game!.you.hand).toEqual(gabiRoom.game!.you.hand);
    await waitFor(mama, (r) => r.players[1]!.connected === true);
  });
});

/** Picks `need` tiles from the hand that form a valid line (same color or same shape, all different). */
function findStartLine(hand: { id: string; color: string; shape: string }[], need: number): string[] {
  for (const key of ['color', 'shape'] as const) {
    const other = key === 'color' ? 'shape' : 'color';
    const groups = new Map<string, Map<string, string>>();
    for (const t of hand) {
      if (!groups.has(t[key])) groups.set(t[key], new Map());
      const g = groups.get(t[key])!;
      if (!g.has(t[other])) g.set(t[other], t.id);
    }
    for (const g of groups.values()) if (g.size >= need) return [...g.values()].slice(0, need);
  }
  throw new Error('No start line found');
}

describe('static files', () => {
  let dir: string;
  let withStatic: RunningServer;

  beforeEach(async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    dir = await mkdtemp(join(tmpdir(), 'client-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<h1>App</h1>');
    await writeFile(join(dir, 'assets', 'app-123.js'), 'console.log(1)');
    withStatic = await startServer({ port: 0, host: '127.0.0.1', staticDir: dir });
  });

  afterEach(async () => {
    await withStatic.close();
  });

  const get = (path: string) => fetch(`http://127.0.0.1:${withStatic.port}${path}`);

  it('serves index.html, also for invite links and unknown paths', async () => {
    for (const path of ['/', '/?raum=ABCDE', '/irgendwas']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toBe('<h1>App</h1>');
    }
  });

  it('serves hashed assets with long caching', async () => {
    const res = await get('/assets/app-123.js');
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('does not serve files outside the folder', async () => {
    const res = await get('/..%2f..%2fetc%2fpasswd');
    expect(await res.text()).not.toContain('root:');
  });
});
