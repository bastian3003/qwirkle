import { describe, expect, it } from 'vitest';
import { normalizeCode, normalizeName, parseClientMessage } from '../src/protocol';

const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));

describe('parseClientMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parse({ type: 'create_room', name: 'Mama' })).toEqual({ type: 'create_room', name: 'Mama' });
    expect(parse({ type: 'join_room', code: 'ABCDE', name: 'Gabi' })).toEqual({ type: 'join_room', code: 'ABCDE', name: 'Gabi' });
    expect(parse({ type: 'resume', code: 'ABCDE', token: 'secret' })).toEqual({ type: 'resume', code: 'ABCDE', token: 'secret' });
    expect(parse({ type: 'new_game' })).toEqual({ type: 'new_game' });
    expect(parse({ type: 'ping' })).toEqual({ type: 'ping' });
    expect(parse({ type: 'action', action: { type: 'pass' } })).toEqual({ type: 'action', action: { type: 'pass' } });
    expect(parse({ type: 'action', action: { type: 'swap', tileIds: ['a', 'b'] } })).toEqual({
      type: 'action',
      action: { type: 'swap', tileIds: ['a', 'b'] },
    });
    expect(parse({ type: 'action', action: { type: 'place', placements: [{ x: 0, y: -1, tileId: 'a' }] } })).toEqual({
      type: 'action',
      action: { type: 'place', placements: [{ x: 0, y: -1, tileId: 'a' }] },
    });
  });

  it('drops unknown extra fields', () => {
    expect(parse({ type: 'action', action: { type: 'place', placements: [{ x: 0, y: 0, tileId: 'a', evil: 1 }] } })).toEqual({
      type: 'action',
      action: { type: 'place', placements: [{ x: 0, y: 0, tileId: 'a' }] },
    });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse([1, 2])).toBeNull();
    expect(parse({ type: 'hack' })).toBeNull();
    expect(parse({ type: 'create_room' })).toBeNull();
    expect(parse({ type: 'join_room', name: 'x' })).toBeNull();
    expect(parse({ type: 'resume', code: 'ABCDE' })).toBeNull();
    expect(parse({ type: 'action', action: { type: 'fly' } })).toBeNull();
  });

  it('rejects bad placements', () => {
    const place = (placements: unknown) => parse({ type: 'action', action: { type: 'place', placements } });
    expect(place('x')).toBeNull();
    expect(place([{ x: 0.5, y: 0, tileId: 'a' }])).toBeNull();
    expect(place([{ x: 0, y: 99999, tileId: 'a' }])).toBeNull();
    expect(place([{ x: 0, y: 0, tileId: '' }])).toBeNull();
    expect(place([{ x: '0', y: 0, tileId: 'a' }])).toBeNull();
    expect(place(Array.from({ length: 7 }, (_, i) => ({ x: i, y: 0, tileId: `t${i}` })))).toBeNull();
  });

  it('rejects bad swaps', () => {
    expect(parse({ type: 'action', action: { type: 'swap', tileIds: 'a' } })).toBeNull();
    expect(parse({ type: 'action', action: { type: 'swap', tileIds: [1] } })).toBeNull();
    expect(parse({ type: 'action', action: { type: 'swap', tileIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } })).toBeNull();
  });
});

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Oma   Gabi ')).toBe('Oma Gabi');
  });

  it('rejects empty and overly long names', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('x'.repeat(21))).toBeNull();
    expect(normalizeName('x'.repeat(20))).toBe('x'.repeat(20));
  });
});

describe('normalizeCode', () => {
  it('ignores case and surrounding spaces', () => {
    expect(normalizeCode(' abcde ')).toBe('ABCDE');
  });
});
