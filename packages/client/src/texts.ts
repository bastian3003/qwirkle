import type { Color, LastMove, Shape } from '@qwirkle/game';

export const COLOR_NAMES: Record<Color, string> = {
  red: 'rot',
  orange: 'orange',
  yellow: 'gelb',
  green: 'grün',
  blue: 'blau',
  purple: 'lila',
};

export const SHAPE_NAMES: Record<Shape, string> = {
  circle: 'Kreis',
  square: 'Quadrat',
  diamond: 'Raute',
  star: 'Stern',
  clover: 'Kleeblatt',
  cross: 'Kreuz',
};

const ERRORS: Record<string, string> = {
  EMPTY_MOVE: 'Lege zuerst mindestens einen Stein.',
  DUPLICATE_CELL: 'Auf ein Feld passt nur ein Stein.',
  CELL_OCCUPIED: 'Dieses Feld ist schon belegt.',
  NOT_IN_LINE: 'Alle Steine eines Zuges müssen in einer Reihe liegen.',
  GAP_IN_LINE: 'Zwischen den Steinen darf keine Lücke sein.',
  NOT_CONNECTED: 'Mindestens ein Stein muss an einen liegenden Stein grenzen.',
  INVALID_LINE: 'Eine Reihe braucht gleiche Farbe oder gleiches Symbol, ohne doppelte Steine.',
  GAME_FINISHED: 'Das Spiel ist schon vorbei.',
  UNKNOWN_PLAYER: 'Du bist in diesem Spiel nicht dabei.',
  NOT_YOUR_TURN: 'Du bist gerade nicht dran.',
  TILE_NOT_IN_HAND: 'Dieser Stein ist nicht auf deiner Hand.',
  DUPLICATE_TILE: 'Jeder Stein kann nur einmal gelegt werden.',
  FIRST_MOVE_TOO_SHORT: 'Im ersten Zug musst du deine längste Reihe legen.',
  FIRST_MOVE_MUST_PLACE: 'Im ersten Zug wird gelegt, nicht getauscht.',
  SWAP_EMPTY: 'Wähle mindestens einen Stein zum Tauschen.',
  SWAP_TOO_MANY: 'So viele Steine sind nicht mehr im Beutel.',
  PASS_NOT_ALLOWED: 'Passen geht erst, wenn der Beutel leer ist und nichts mehr passt.',
  INVALID_MESSAGE: 'Da ist etwas schiefgelaufen. Bitte noch einmal versuchen.',
  INVALID_NAME: 'Bitte gib einen Namen mit höchstens 20 Zeichen ein.',
  ROOM_NOT_FOUND: 'Diesen Raum gibt es nicht. Stimmt der Code?',
  ROOM_FULL: 'In diesem Raum spielen schon zwei.',
  SESSION_NOT_FOUND: 'Das Spiel gibt es nicht mehr. Bitte ein neues starten.',
  NOT_IN_ROOM: 'Du bist in keinem Raum.',
  GAME_NOT_STARTED: 'Das Spiel hat noch nicht begonnen.',
  GAME_NOT_FINISHED: 'Das Spiel läuft noch.',
  OFFLINE: 'Keine Verbindung zum Server. Einen Moment bitte …',
};

export function errorText(code: string): string {
  return ERRORS[code] ?? 'Da ist etwas schiefgelaufen.';
}

export function tiles(n: number): string {
  return n === 1 ? '1 Stein' : `${n} Steine`;
}

export function points(n: number): string {
  return n === 1 ? '1 Punkt' : `${n} Punkte`;
}

/** One line describing the last move, from the point of view of `youId`. */
export function lastMoveText(move: LastMove, nameOf: (id: string) => string, youId: string): string {
  const you = move.playerId === youId;
  const who = you ? 'Du hast' : `${nameOf(move.playerId)} hat`;
  switch (move.type) {
    case 'place': {
      const bonus = move.qwirkles > 0 ? (move.qwirkles === 1 ? ' – Qwirkle!' : ` – ${move.qwirkles} Qwirkles!`) : '';
      return `${who} ${tiles(move.placements.length)} gelegt: +${points(move.score)}${bonus}`;
    }
    case 'swap':
      return `${who} ${tiles(move.count)} getauscht.`;
    case 'pass':
      return `${who} gepasst.`;
    case 'timeout':
      return you ? 'Deine Zeit ist abgelaufen – der Zug ist verfallen.' : `${nameOf(move.playerId)} war zu langsam – der Zug ist verfallen.`;
  }
}
