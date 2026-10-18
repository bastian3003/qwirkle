import { type GameState, seededRng } from '@qwirkle/game';
import { describe, expect, it } from 'vitest';
import { type Room, RoomManager } from '../src/rooms';

function setup(codes: string[] = ['AAAAA', 'BBBBB', 'CCCCC']) {
  let time = 0;
  let token = 0;
  const queue = [...codes];
  const manager = new RoomManager({
    rng: seededRng(3),
    now: () => time,
    generateCode: () => queue.shift() ?? `Z${token}`,
    generateToken: () => `token-${token++}`,
  });
  return { manager, advance: (ms: number) => (time += ms) };
}

function value<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function startedRoom() {
  const s = setup();
  const room = value(s.manager.create('Mama')).room;
  value(s.manager.join('AAAAA', 'Gabi'));
  return { ...s, room };
}

/** The id of the player whose turn it is, and the other one. */
function turnOrder(room: Room) {
  const game = room.game as GameState;
  const current = game.players[game.currentPlayerIndex]!.id;
  return { current, other: current === 'p1' ? 'p2' : 'p1' };
}

describe('RoomManager', () => {
  it('creates a waiting room with the creator as first player', () => {
    const { manager } = setup();
    const { room, player } = value(manager.create('  Mama '));
    expect(room.code).toBe('AAAAA');
    expect(player).toEqual({ id: 'p1', name: 'Mama', token: 'token-0' });
    expect(room.game).toBeNull();
  });

  it('skips codes that are already taken', () => {
    const { manager } = setup(['AAAAA', 'AAAAA', 'BBBBB']);
    value(manager.create('Mama'));
    expect(value(manager.create('Gabi')).room.code).toBe('BBBBB');
  });

  it('rejects invalid names', () => {
    const { manager } = setup();
    expect(manager.create('  ')).toEqual({ ok: false, error: 'INVALID_NAME' });
    value(manager.create('Mama'));
    expect(manager.join('AAAAA', '')).toEqual({ ok: false, error: 'INVALID_NAME' });
  });

  it('starts the game when the second player joins, case-insensitive code', () => {
    const { manager } = setup();
    value(manager.create('Mama'));
    const { room, player } = value(manager.join('aaaaa', 'Gabi'));
    expect(player.id).toBe('p2');
    expect(room.game?.players.map((p) => p.name)).toEqual(['Mama', 'Gabi']);
    expect(room.game?.status).toBe('playing');
  });

  it('rejects unknown and full rooms', () => {
    const { manager } = startedRoom();
    expect(manager.join('XXXXX', 'Eva')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(manager.join('AAAAA', 'Eva')).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('resumes only with the right token', () => {
    const { manager } = startedRoom();
    expect(value(manager.resume('AAAAA', 'token-1')).player.id).toBe('p2');
    expect(manager.resume('AAAAA', 'wrong')).toEqual({ ok: false, error: 'SESSION_NOT_FOUND' });
    expect(manager.resume('XXXXX', 'token-1')).toEqual({ ok: false, error: 'SESSION_NOT_FOUND' });
  });

  it('applies actions through the game rules', () => {
    const { manager, room } = startedRoom();
    const { current, other } = turnOrder(room);
    expect(manager.act(room, other, { type: 'pass' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    // The opening move has to place tiles, so a swap is refused.
    const tileId = room.game!.players.find((p) => p.id === current)!.hand[0]!.id;
    expect(manager.act(room, current, { type: 'swap', tileIds: [tileId] })).toEqual({
      ok: false,
      error: 'FIRST_MOVE_MUST_PLACE',
    });
  });

  it('refuses actions before the game starts', () => {
    const { manager } = setup();
    const { room } = value(manager.create('Mama'));
    expect(manager.act(room, 'p1', { type: 'pass' })).toEqual({ ok: false, error: 'GAME_NOT_STARTED' });
  });

  it('starts a new game only after the current one has finished', () => {
    const { manager, room } = startedRoom();
    expect(manager.newGame(room, 'p1')).toEqual({ ok: false, error: 'GAME_NOT_FINISHED' });
    room.game = { ...room.game!, status: 'finished' };
    expect(manager.newGame(room, 'x')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    value(manager.newGame(room, 'p2'));
    expect(room.game.status).toBe('playing');
    expect(room.game.players.every((p) => p.score === 0 && p.hand.length === 6)).toBe(true);
  });

  it('shows each player only their own hand and never a token', () => {
    const { manager, room } = startedRoom();
    const view = manager.view(room, 'p1', (id) => id === 'p1');
    const json = JSON.stringify(view);
    expect(json).not.toContain('token-');
    for (const t of room.game!.players[1]!.hand) expect(json).not.toContain(t.id);
    expect(view.players).toEqual([
      { id: 'p1', name: 'Mama', connected: true },
      { id: 'p2', name: 'Gabi', connected: false },
    ]);
    expect(view.game?.you.id).toBe('p1');
  });

  it('removes idle rooms unless someone is still connected', () => {
    const { manager, advance } = setup();
    value(manager.create('Mama'));
    value(manager.create('Gabi'));
    advance(1000);
    expect(manager.sweep(500, (code) => code === 'BBBBB')).toEqual(['AAAAA']);
    expect(manager.getRoom('AAAAA')).toBeUndefined();
    expect(manager.getRoom('BBBBB')).toBeDefined();
  });
});

describe('turn clock', () => {
  it('reports the remaining time and stops it on request', () => {
    const { manager, room, advance } = startedRoom();
    expect(manager.view(room, 'p1', () => true).turnRemainingMs).toBeNull();
    manager.startClock(room, 70_000);
    advance(20_000);
    expect(manager.view(room, 'p1', () => true).turnRemainingMs).toBe(50_000);
    manager.stopClock(room);
    expect(manager.view(room, 'p1', () => true).turnRemainingMs).toBeNull();
  });

  it('times out only the turn the clock was started for', () => {
    const { manager, room } = startedRoom();
    const { current, other } = turnOrder(room);
    const serial = room.turnSerial;
    expect(manager.timeout(room, serial)).toBe(true);
    expect(room.game!.lastMove).toEqual({ type: 'timeout', playerId: current });
    expect(turnOrder(room).current).toBe(other);
    // A second expiry for the old turn must not skip the new player too.
    expect(manager.timeout(room, serial)).toBe(false);
    expect(turnOrder(room).current).toBe(other);
  });

  it('starts a new turn after every move', () => {
    const { manager, room } = startedRoom();
    const before = room.turnSerial;
    manager.startClock(room, 1000);
    manager.timeout(room, before);
    expect(room.turnSerial).toBe(before + 1);
    expect(room.turnDeadline).toBeNull();
  });
});
