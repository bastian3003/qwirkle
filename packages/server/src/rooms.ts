import { randomBytes, randomInt } from 'node:crypto';
import { type Action, type GameState, type Rng, applyAction, createGame, getPlayerView } from '@qwirkle/game';
import { type RoomView, type ServerError, normalizeCode, normalizeName } from './protocol';

export const PLAYERS_PER_ROOM = 2;
/** Without I, O, 0, 1 so codes are easy to read out and type. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export interface RoomPlayer {
  id: string;
  name: string;
  /** Secret that lets this player reconnect. Never sent to anyone else. */
  token: string;
}

export interface Room {
  code: string;
  players: RoomPlayer[];
  game: GameState | null;
  lastActivity: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ServerError };

export interface Seat {
  room: Room;
  player: RoomPlayer;
}

export interface RoomManagerOptions {
  rng?: Rng;
  now?: () => number;
  generateCode?: () => string;
  generateToken?: () => string;
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function randomToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Holds all rooms in memory and applies the rules. Knows nothing about sockets,
 * so it can be tested directly.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly generateCode: () => string;
  private readonly generateToken: () => string;

  constructor(opts: RoomManagerOptions = {}) {
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
    this.generateCode = opts.generateCode ?? randomCode;
    this.generateToken = opts.generateToken ?? randomToken;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  create(name: string): Result<Seat> {
    const clean = normalizeName(name);
    if (!clean) return { ok: false, error: 'INVALID_NAME' };
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();
    const player: RoomPlayer = { id: 'p1', name: clean, token: this.generateToken() };
    const room: Room = { code, players: [player], game: null, lastActivity: this.now() };
    this.rooms.set(code, room);
    return { ok: true, value: { room, player } };
  }

  /** Joins a waiting room. The game starts as soon as the room is full. */
  join(code: string, name: string): Result<Seat> {
    const clean = normalizeName(name);
    if (!clean) return { ok: false, error: 'INVALID_NAME' };
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (room.players.length >= PLAYERS_PER_ROOM) return { ok: false, error: 'ROOM_FULL' };

    const player: RoomPlayer = { id: `p${room.players.length + 1}`, name: clean, token: this.generateToken() };
    room.players.push(player);
    if (room.players.length === PLAYERS_PER_ROOM) room.game = createGame(room.players, this.rng);
    this.touch(room);
    return { ok: true, value: { room, player } };
  }

  resume(code: string, token: string): Result<Seat> {
    const room = this.getRoom(code);
    const player = room?.players.find((p) => p.token === token);
    if (!room || !player) return { ok: false, error: 'SESSION_NOT_FOUND' };
    this.touch(room);
    return { ok: true, value: { room, player } };
  }

  act(room: Room, playerId: string, action: Action): Result<Room> {
    if (!room.game) return { ok: false, error: 'GAME_NOT_STARTED' };
    const result = applyAction(room.game, playerId, action, this.rng);
    if (!result.ok) return { ok: false, error: result.error };
    room.game = result.state;
    this.touch(room);
    return { ok: true, value: room };
  }

  newGame(room: Room, playerId: string): Result<Room> {
    if (!room.players.some((p) => p.id === playerId)) return { ok: false, error: 'NOT_IN_ROOM' };
    if (!room.game) return { ok: false, error: 'GAME_NOT_STARTED' };
    if (room.game.status !== 'finished') return { ok: false, error: 'GAME_NOT_FINISHED' };
    room.game = createGame(room.players, this.rng);
    this.touch(room);
    return { ok: true, value: room };
  }

  /** What one player gets to see of a room. Tokens and the other hand stay on the server. */
  view(room: Room, playerId: string, isConnected: (playerId: string) => boolean): RoomView {
    return {
      code: room.code,
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: isConnected(p.id) })),
      game: room.game ? getPlayerView(room.game, playerId) : null,
    };
  }

  /** Removes rooms without activity for longer than maxIdleMs. Returns the removed codes. */
  sweep(maxIdleMs: number, isActive: (code: string) => boolean = () => false): string[] {
    const cutoff = this.now() - maxIdleMs;
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < cutoff && !isActive(code)) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  private touch(room: Room): void {
    room.lastActivity = this.now();
  }
}
