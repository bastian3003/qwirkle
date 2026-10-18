import { type Placement, type Position, type Tile, cellKey, isBoardEmpty } from '@qwirkle/game';
import type { ClientMessage, RoomView } from '@qwirkle/server/protocol';
import { useEffect, useMemo, useState } from 'react';
import { BoardView } from '../components/BoardView';
import { TileFace, tileLabel } from '../components/TileView';
import { candidateSlots, checkMove } from '../logic';
import { errorText, lastMoveText, points, tiles } from '../texts';

interface Props {
  room: RoomView;
  send: (msg: ClientMessage) => void;
  /** Changes on every server error, so the screen can stop waiting for an answer. */
  errorAt: number | null;
  onLeave: () => void;
}

type Mode = 'place' | 'swap';

export function Game({ room, send, errorAt, onLeave }: Props) {
  const game = room.game!;
  const you = game.you;
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? '?';
  const opponent = room.players.find((p) => p.id !== you.id);

  const [mode, setMode] = useState<Mode>('place');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Placement[]>([]);
  const [swapIds, setSwapIds] = useState<ReadonlySet<string>>(new Set());
  const [waiting, setWaiting] = useState(false);
  /** Why the last attempt to confirm was refused. Shown until the move is changed. */
  const [moveError, setMoveError] = useState<string | null>(null);

  // A new state from the server: drop pending tiles that were played or whose cell is now taken.
  useEffect(() => {
    const inHand = new Set(you.hand.map((t) => t.id));
    setPending((ps) => ps.filter((p) => inHand.has(p.tile.id) && !game.board[cellKey(p.x, p.y)]));
    setSwapIds((ids) => new Set([...ids].filter((id) => inHand.has(id))));
    setSelectedId((id) => (id && inHand.has(id) ? id : null));
    setWaiting(false);
    if (!game.isYourTurn) setMode('place');
  }, [game, you.hand]);

  useEffect(() => setWaiting(false), [errorAt]);

  const pendingIds = new Set(pending.map((p) => p.tile.id));
  const hand = you.hand.filter((t) => !pendingIds.has(t.id));
  const selected = hand.find((t) => t.id === selectedId) ?? null;
  const myTurn = game.isYourTurn && !waiting;
  const firstMove = isBoardEmpty(game.board);

  // All free cells next to the tiles, not just the ones where the selected tile fits:
  // spotting a fitting place is the point of the game.
  const slots = useMemo(
    () => (myTurn && mode === 'place' && selected ? candidateSlots(game.board, pending) : []),
    [myTurn, mode, selected, game.board, pending],
  );
  const missingForStart = firstMove ? Math.max(0, game.minTilesFirstMove - pending.length) : 0;

  // Any change to the move clears the old complaint.
  useEffect(() => setMoveError(null), [pending]);

  const highlight = useMemo(() => {
    const m = game.lastMove;
    return new Set(m?.type === 'place' ? m.placements.map((p) => cellKey(p.x, p.y)) : []);
  }, [game.lastMove]);

  function tapHandTile(tile: Tile) {
    if (mode === 'swap') {
      setSwapIds((ids) => {
        const next = new Set(ids);
        if (next.has(tile.id)) next.delete(tile.id);
        else next.add(tile.id);
        return next;
      });
    } else {
      setSelectedId((id) => (id === tile.id ? null : tile.id));
    }
  }

  function placeAt(cell: Position) {
    if (!selected) return;
    setPending((ps) => [...ps, { x: cell.x, y: cell.y, tile: selected }]);
    setSelectedId(null);
  }

  function takeBack(cell: Position) {
    setPending((ps) => ps.filter((p) => p.x !== cell.x || p.y !== cell.y));
  }

  function act(msg: ClientMessage) {
    setWaiting(true);
    send(msg);
  }

  function confirmPlace() {
    // The rules are checked only now, like a table partner checking after the tiles are down.
    if (missingForStart > 0) {
      setMoveError(`Im ersten Zug musst du ${tiles(game.minTilesFirstMove)} legen.`);
      return;
    }
    const result = checkMove(game.board, pending);
    if (!result.ok) {
      setMoveError(`So geht das nicht: ${errorText(result.error)}`);
      return;
    }
    act({
      type: 'action',
      action: { type: 'place', placements: pending.map((p) => ({ x: p.x, y: p.y, tileId: p.tile.id })) },
    });
  }

  function confirmSwap() {
    act({ type: 'action', action: { type: 'swap', tileIds: [...swapIds] } });
    setMode('place');
  }

  const swapBlocked = firstMove ? 'Im ersten Zug wird gelegt.' : game.bagCount === 0 ? 'Der Beutel ist leer.' : null;

  function hint(): string {
    if (game.status === 'finished') return 'Das Spiel ist vorbei.';
    if (!game.isYourTurn) return `${nameOf(game.currentPlayerId)} ist dran …`;
    if (waiting) return 'Einen Moment …';
    if (mode === 'swap') {
      return swapIds.size === 0
        ? `Tippe die Steine an, die du tauschen willst (höchstens ${Math.min(game.bagCount, 6)}).`
        : `${tiles(swapIds.size)} ausgewählt.`;
    }
    if (moveError) return moveError;
    if (selected) return 'Tippe auf ein freies Feld.';
    if (firstMove && pending.length === 0) return `Du fängst an! Lege ${tiles(game.minTilesFirstMove)} in eine Reihe.`;
    if (pending.length > 0) return 'Weiter legen oder auf „Legen“ tippen.';
    if (game.canPass) return 'Kein Stein passt mehr. Du kannst nur passen.';
    return 'Du bist dran! Tippe einen Stein an.';
  }

  return (
    <main className="screen game">
      <header className="scores">
        {room.players.map((p) => {
          const view = game.players.find((g) => g.id === p.id)!;
          const active = game.status === 'playing' && game.currentPlayerId === p.id;
          return (
            <div key={p.id} className={`player${active ? ' active' : ''}`} data-testid={`player-${p.id}`}>
              <span className="player-name">
                {p.id === you.id ? 'Du' : p.name}
                {!p.connected && p.id !== you.id && (
                  <span className="offline" title="nicht verbunden">
                    {' '}
                    (weg)
                  </span>
                )}
              </span>
              <span className="player-score" data-testid="score">
                {view.score}
              </span>
            </div>
          );
        })}
        <div className="bag" aria-label={`${game.bagCount} Steine im Beutel`}>
          <span className="bag-label">Beutel</span>
          <span className="bag-count">{game.bagCount}</span>
        </div>
      </header>

      {game.lastMove && (
        <p className="last-move" data-testid="last-move">
          {lastMoveText(game.lastMove, nameOf, you.id)}
        </p>
      )}

      <BoardView
        board={game.board}
        pending={pending}
        slots={slots}
        highlight={highlight}
        onSlotTap={placeAt}
        onPendingTap={takeBack}
        fitKey={Object.keys(game.board).length}
      />

      <footer className="controls">
        <p
          className={`hint${moveError ? ' error' : game.isYourTurn ? ' your-turn' : ''}`}
          data-testid="hint"
          aria-live="polite"
        >
          {hint()}
        </p>

        <div className="hand" role="group" aria-label="Deine Steine">
          {hand.map((t) => {
            const isSelected = mode === 'place' ? t.id === selectedId : swapIds.has(t.id);
            return (
              <button
                key={t.id}
                className={`hand-tile${isSelected ? ' selected' : ''}${mode === 'swap' ? ' swap' : ''}`}
                data-testid="hand-tile"
                data-color={t.color}
                data-shape={t.shape}
                aria-pressed={isSelected}
                aria-label={tileLabel(t)}
                onClick={() => tapHandTile(t)}
                disabled={game.status === 'finished'}
              >
                <TileFace tile={t} />
              </button>
            );
          })}
        </div>

        <div className="actions">
          {mode === 'swap' ? (
            <>
              <button className="secondary" onClick={() => (setMode('place'), setSwapIds(new Set()))}>
                Abbrechen
              </button>
              <button
                className="primary"
                onClick={confirmSwap}
                disabled={!myTurn || swapIds.size === 0 || swapIds.size > game.bagCount}
              >
                {swapIds.size > 0 ? `${tiles(swapIds.size)} tauschen` : 'Tauschen'}
              </button>
            </>
          ) : pending.length > 0 ? (
            <>
              <button className="secondary" onClick={() => setPending([])}>
                Zurücknehmen
              </button>
              <button className="primary" onClick={confirmPlace} disabled={!myTurn} data-testid="confirm">
                Legen
              </button>
            </>
          ) : game.canPass ? (
            <button className="primary" onClick={() => act({ type: 'action', action: { type: 'pass' } })} disabled={!myTurn}>
              Passen
            </button>
          ) : (
            <button
              className="secondary"
              onClick={() => (setMode('swap'), setSelectedId(null))}
              disabled={!myTurn || swapBlocked !== null}
              title={swapBlocked ?? undefined}
            >
              Steine tauschen
            </button>
          )}
        </div>
      </footer>

      {game.status === 'finished' && (
        <GameOver room={room} onNewGame={() => send({ type: 'new_game' })} onLeave={onLeave} opponentName={opponent?.name} />
      )}
    </main>
  );
}

function GameOver({
  room,
  onNewGame,
  onLeave,
  opponentName,
}: {
  room: RoomView;
  onNewGame: () => void;
  onLeave: () => void;
  opponentName?: string;
}) {
  const game = room.game!;
  const youWon = game.winnerIds.includes(game.you.id);
  const tie = game.winnerIds.length > 1;
  const title = tie ? 'Unentschieden!' : youWon ? 'Du hast gewonnen! 🎉' : `${opponentName ?? 'Deine Mitspielerin'} hat gewonnen!`;
  const finisher = game.lastMove?.type === 'place' && game.endReason === 'hand_emptied' ? game.lastMove.playerId : null;
  const reason =
    game.endReason === 'blocked'
      ? 'Keine von euch konnte mehr legen.'
      : finisher === game.you.id
        ? 'Du hast den letzten Stein gelegt (+6 Bonus).'
        : `${opponentName ?? 'Deine Mitspielerin'} hat den letzten Stein gelegt (+6 Bonus).`;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <div className="card">
        <h2 id="game-over-title">{title}</h2>
        <p>{reason}</p>
        <ul className="final-scores">
          {[...game.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <li key={p.id}>
                <span>{p.id === game.you.id ? 'Du' : p.name}</span>
                <strong>{points(p.score)}</strong>
              </li>
            ))}
        </ul>
        <button className="primary big" onClick={onNewGame}>
          Neue Runde
        </button>
        <button className="link-button" onClick={onLeave}>
          Zurück zum Start
        </button>
      </div>
    </div>
  );
}
