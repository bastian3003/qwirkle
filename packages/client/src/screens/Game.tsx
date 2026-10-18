import { type Placement, type Position, type Tile, cellKey, isBoardEmpty } from '@qwirkle/game';
import { COUNTDOWN_MS, type ClientMessage, type RoomView } from '@qwirkle/server/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type BoardHandle, BoardView } from '../components/BoardView';
import { TileFace, tileLabel } from '../components/TileView';
import { useTileDrag } from '../components/useTileDrag';
import { checkMove } from '../logic';
import { errorText, lastMoveText, points, tiles } from '../texts';

interface Props {
  room: RoomView;
  send: (msg: ClientMessage) => void;
  /** Changes on every server error, so the screen can stop waiting for an answer. */
  errorAt: number | null;
  onLeave: () => void;
}

type Mode = 'place' | 'swap';
/** Where a dragged tile comes from: the hand, or a pending tile's cell on the board. */
type DragSource = 'hand' | Position;

const sameCell = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

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
  const boardRef = useRef<BoardHandle>(null);
  const handRef = useRef<HTMLDivElement>(null);

  // A new state from the server: drop pending tiles that were played or whose cell is now taken.
  // When the turn is over (also by timeout), unconfirmed tiles go back to the hand.
  useEffect(() => {
    const inHand = new Set(you.hand.map((t) => t.id));
    setPending((ps) =>
      game.isYourTurn ? ps.filter((p) => inHand.has(p.tile.id) && !game.board[cellKey(p.x, p.y)]) : [],
    );
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
  const canPlace = myTurn && mode === 'place';
  const firstMove = isBoardEmpty(game.board);
  const missingForStart = firstMove ? Math.max(0, game.minTilesFirstMove - pending.length) : 0;

  // Any change to the move clears the old complaint.
  useEffect(() => setMoveError(null), [pending]);

  const highlight = useMemo(() => {
    const m = game.lastMove;
    return new Set(m?.type === 'place' ? m.placements.map((p) => cellKey(p.x, p.y)) : []);
  }, [game.lastMove]);

  // ---- Turn clock ----
  // The server sends the time left; anchor it to this device's clock on arrival.
  const deadline = useMemo(
    () => (room.turnRemainingMs === null ? null : performance.now() + room.turnRemainingMs),
    [room],
  );
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, [deadline]);
  const remainingMs = deadline === null ? null : Math.max(0, deadline - now);
  const showCountdown = game.status === 'playing' && remainingMs !== null && remainingMs <= COUNTDOWN_MS;

  // ---- Placing tiles ----

  /** The free cell a tile would land on at this screen point, or null. */
  function targetCell(x: number, y: number, source: DragSource): Position | null {
    const cell = boardRef.current?.cellAt(x, y);
    if (!cell || game.board[cellKey(cell.x, cell.y)]) return null;
    const occupant = pending.find((p) => sameCell(p, cell));
    if (occupant && !(source !== 'hand' && sameCell(source, cell))) return null;
    return cell;
  }

  function isOverHand(x: number, y: number): boolean {
    const r = handRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom;
  }

  const { drag, press, consumeClick } = useTileDrag<DragSource>((tile, source, x, y) => {
    if (!canPlace) return;
    const cell = targetCell(x, y, source);
    if (cell) {
      setPending((ps) => [
        ...ps.filter((p) => source === 'hand' || !sameCell(p, source)),
        { x: cell.x, y: cell.y, tile },
      ]);
      setSelectedId(null);
    } else if (source !== 'hand' && isOverHand(x, y)) {
      takeBack(source);
    }
  });
  const dropTarget = drag && canPlace ? targetCell(drag.x, drag.y, drag.source) : null;

  function tapHandTile(tile: Tile) {
    if (consumeClick()) return;
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
    if (!selected || !canPlace) return;
    setPending((ps) => [...ps, { x: cell.x, y: cell.y, tile: selected }]);
    setSelectedId(null);
  }

  function takeBack(cell: Position) {
    setPending((ps) => ps.filter((p) => !sameCell(p, cell)));
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
    if (selected) return 'Tippe aufs Spielfeld, wo der Stein hin soll.';
    if (firstMove && pending.length === 0) return `Du fängst an! Lege ${tiles(game.minTilesFirstMove)} in eine Reihe.`;
    if (pending.length > 0) return 'Weiter legen oder auf „Legen“ tippen.';
    if (game.canPass) return 'Kein Stein passt mehr. Du kannst nur passen.';
    return 'Du bist dran! Zieh einen Stein aufs Spielfeld.';
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

      <div className="board-area">
        <BoardView
          handle={boardRef}
          board={game.board}
          pending={pending}
          highlight={highlight}
          dropTarget={dropTarget}
          draggingFrom={drag && drag.source !== 'hand' ? drag.source : null}
          onEmptyCellTap={placeAt}
          onPendingTap={(cell) => !consumeClick() && takeBack(cell)}
          onPendingPress={(e, p) => canPlace && press(e, p.tile, { x: p.x, y: p.y })}
          fitKey={Object.keys(game.board).length}
        />
        {showCountdown && (
          <div className={`countdown${game.isYourTurn ? ' mine' : ''}`} role="timer" data-testid="countdown">
            <span className="countdown-number">{Math.ceil(remainingMs / 1000)}</span>
            <span className="countdown-text">
              {game.isYourTurn ? 'Schnell, deine Zeit läuft ab!' : `${nameOf(game.currentPlayerId)} muss sich beeilen`}
            </span>
          </div>
        )}
      </div>

      <footer className="controls">
        <p
          className={`hint${moveError ? ' error' : game.isYourTurn ? ' your-turn' : ''}`}
          data-testid="hint"
          aria-live="polite"
        >
          {hint()}
        </p>

        <div className="hand" role="group" aria-label="Deine Steine" ref={handRef}>
          {hand.map((t) => {
            const isSelected = mode === 'place' ? t.id === selectedId : swapIds.has(t.id);
            const lifted = drag?.source === 'hand' && drag.tile.id === t.id;
            return (
              <button
                key={t.id}
                className={`hand-tile${isSelected ? ' selected' : ''}${mode === 'swap' ? ' swap' : ''}${lifted ? ' lifted' : ''}`}
                data-testid="hand-tile"
                data-color={t.color}
                data-shape={t.shape}
                aria-pressed={isSelected}
                aria-label={tileLabel(t)}
                onPointerDown={(e) => canPlace && press(e, t, 'hand')}
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

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <TileFace tile={drag.tile} />
        </div>
      )}

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
