import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { type ClientMessage, MAX_MESSAGE_BYTES, type ServerMessage, parseClientMessage } from './protocol';
import { type Room, RoomManager, type Seat } from './rooms';
import { createStaticHandler } from './static';

export const WS_PATH = '/ws';
const HEARTBEAT_MS = 30_000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
/** Rooms nobody has touched for a week are dropped. */
const ROOM_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ServerOptions {
  port: number;
  host?: string;
  manager?: RoomManager;
  /** Folder with the built client. Without it, only the WebSocket and /health are served. */
  staticDir?: string;
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

interface Binding {
  code: string;
  playerId: string;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const manager = opts.manager ?? new RoomManager();
  const serveStatic = opts.staticDir ? createStaticHandler(opts.staticDir) : null;
  const http: Server = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
      return;
    }
    if (serveStatic && (await serveStatic(req, res))) return;
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  });
  const wss = new WebSocketServer({ server: http, path: WS_PATH, maxPayload: MAX_MESSAGE_BYTES });

  const bindings = new Map<WebSocket, Binding>();
  const roomSockets = new Map<string, Set<WebSocket>>();
  const alive = new WeakMap<WebSocket, boolean>();

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function isConnected(code: string, playerId: string): boolean {
    for (const ws of roomSockets.get(code) ?? []) {
      if (bindings.get(ws)?.playerId === playerId) return true;
    }
    return false;
  }

  /** Sends every socket in the room its own view of it. */
  function broadcast(room: Room): void {
    for (const ws of roomSockets.get(room.code) ?? []) {
      const binding = bindings.get(ws);
      if (!binding) continue;
      send(ws, { type: 'room', room: manager.view(room, binding.playerId, (id) => isConnected(room.code, id)) });
    }
  }

  function unbind(ws: WebSocket): void {
    const binding = bindings.get(ws);
    if (!binding) return;
    bindings.delete(ws);
    const sockets = roomSockets.get(binding.code);
    sockets?.delete(ws);
    if (sockets?.size === 0) roomSockets.delete(binding.code);
    const room = manager.getRoom(binding.code);
    if (room) broadcast(room);
  }

  function bind(ws: WebSocket, seat: Seat): void {
    unbind(ws);
    bindings.set(ws, { code: seat.room.code, playerId: seat.player.id });
    if (!roomSockets.has(seat.room.code)) roomSockets.set(seat.room.code, new Set());
    roomSockets.get(seat.room.code)!.add(ws);
    send(ws, { type: 'welcome', code: seat.room.code, playerId: seat.player.id, token: seat.player.token });
    broadcast(seat.room);
  }

  function handle(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'ping':
        return;
      case 'create_room':
      case 'join_room':
      case 'resume': {
        const result =
          msg.type === 'create_room'
            ? manager.create(msg.name)
            : msg.type === 'join_room'
              ? manager.join(msg.code, msg.name)
              : manager.resume(msg.code, msg.token);
        if (result.ok) bind(ws, result.value);
        else send(ws, { type: 'error', error: result.error });
        return;
      }
      case 'action':
      case 'new_game': {
        const binding = bindings.get(ws);
        const room = binding && manager.getRoom(binding.code);
        if (!binding || !room) {
          send(ws, { type: 'error', error: 'NOT_IN_ROOM' });
          return;
        }
        const result =
          msg.type === 'action' ? manager.act(room, binding.playerId, msg.action) : manager.newGame(room, binding.playerId);
        if (result.ok) broadcast(room);
        else send(ws, { type: 'error', error: result.error });
        return;
      }
    }
  }

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('message', (data: RawData, isBinary) => {
      const msg = isBinary ? null : parseClientMessage(data.toString());
      if (!msg) send(ws, { type: 'error', error: 'INVALID_MESSAGE' });
      else handle(ws, msg);
    });
    ws.on('close', () => unbind(ws));
    ws.on('error', () => ws.terminate());
  });

  // Phones often drop connections without closing them. Ping regularly so
  // "connected" stays accurate and dead sockets get cleaned up.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  const sweeper = setInterval(() => manager.sweep(ROOM_IDLE_MS, (code) => roomSockets.has(code)), SWEEP_EVERY_MS);

  return new Promise((resolve) => {
    http.listen(opts.port, opts.host, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            clearInterval(sweeper);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
