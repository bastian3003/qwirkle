import { type Action, type GameError, HAND_SIZE, type PlayerView } from '@qwirkle/game';

export const MAX_NAME_LENGTH = 20;
/** Upper bound for a single WebSocket message; real messages are far smaller. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

// ---- Client -> server ----

export type ClientMessage =
  | { type: 'create_room'; name: string }
  | { type: 'join_room'; code: string; name: string }
  /** Re-attach after a reload or a dropped connection, using the token from `welcome`. */
  | { type: 'resume'; code: string; token: string }
  | { type: 'action'; action: Action }
  /** Start another game in the same room once the current one is over. */
  | { type: 'new_game' }
  /** Keep-alive while the app is open; free hosting sleeps without incoming messages. No reply. */
  | { type: 'ping' };

// ---- Server -> client ----

export interface RoomView {
  code: string;
  players: { id: string; name: string; connected: boolean }[];
  /** null while waiting for the second player. */
  game: PlayerView | null;
}

export type ServerError =
  | GameError
  | 'INVALID_MESSAGE'
  | 'INVALID_NAME'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'SESSION_NOT_FOUND'
  | 'NOT_IN_ROOM'
  | 'GAME_NOT_STARTED'
  | 'GAME_NOT_FINISHED';

export type ServerMessage =
  /** Sent once after create/join/resume. The client stores the token to resume later. */
  | { type: 'welcome'; code: string; playerId: string; token: string }
  /** Sent to every player of a room after each change, each with their own view. */
  | { type: 'room'; room: RoomView }
  | { type: 'error'; error: ServerError };

// ---- Parsing untrusted input ----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isShortString(v: unknown, max = 64): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isCoord(v: unknown): v is number {
  // The board grows by at most a few dozen cells in any direction.
  return Number.isInteger(v) && Math.abs(v as number) <= 1000;
}

function parseAction(v: unknown): Action | null {
  if (!isObject(v)) return null;
  switch (v.type) {
    case 'pass':
      return { type: 'pass' };
    case 'swap': {
      const ids = v.tileIds;
      if (!Array.isArray(ids) || ids.length > HAND_SIZE || !ids.every((id) => isShortString(id))) return null;
      return { type: 'swap', tileIds: ids as string[] };
    }
    case 'place': {
      const ps = v.placements;
      if (!Array.isArray(ps) || ps.length > HAND_SIZE) return null;
      const placements: { x: number; y: number; tileId: string }[] = [];
      for (const p of ps) {
        if (!isObject(p) || !isCoord(p.x) || !isCoord(p.y) || !isShortString(p.tileId)) return null;
        placements.push({ x: p.x, y: p.y, tileId: p.tileId });
      }
      return { type: 'place', placements };
    }
    default:
      return null;
  }
}

/** Parses a raw message. Returns null for anything malformed; game rules are checked later. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'create_room':
      return typeof data.name === 'string' ? { type: 'create_room', name: data.name } : null;
    case 'join_room':
      return isShortString(data.code, 16) && typeof data.name === 'string'
        ? { type: 'join_room', code: data.code, name: data.name }
        : null;
    case 'resume':
      return isShortString(data.code, 16) && isShortString(data.token, 128)
        ? { type: 'resume', code: data.code, token: data.token }
        : null;
    case 'action': {
      const action = parseAction(data.action);
      return action ? { type: 'action', action } : null;
    }
    case 'new_game':
      return { type: 'new_game' };
    case 'ping':
      return { type: 'ping' };
    default:
      return null;
  }
}

/** Trims and collapses whitespace. Returns null if the name is empty or too long. */
export function normalizeName(name: string): string | null {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.length > 0 && clean.length <= MAX_NAME_LENGTH ? clean : null;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
