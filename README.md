# Legespiel-App (Arbeitstitel „Qwirkle-Clone“)

Private Handy-Web-App, mit der zwei Spielerinnen ein Qwirkle-artiges Legespiel gegeneinander spielen. Projektziele und Regeln stehen in [`CLAUDE.md`](CLAUDE.md).

## Stand

- [x] Spiellogik (`packages/game`): Beutel, Hand, Legen, Tauschen, Passen, Punkte inkl. Qwirkle, Startspielerin, Spielende
- [ ] Server (Node.js + WebSockets, Räume per Code/Link)
- [ ] Oberfläche (React-PWA, Touch, verschiebbares/zoombares Brett)

## Entwickeln

```sh
npm install
npm test          # Unit-Tests (Vitest)
npm run typecheck
```

## Spiellogik in Kürze

- `createGame(players, rng)` teilt aus und bestimmt die Startspielerin.
- `applyAction(state, playerId, action, rng)` prüft und führt einen Zug aus (`place`, `swap`, `pass`) und gibt einen neuen Zustand oder einen Fehlercode zurück.
- `getPlayerView(state, playerId)` liefert nur das, was eine Spielerin sehen darf (keine fremden Handsteine, kein Beutelinhalt).
- `evaluatePlacement(board, placements)` prüft eine Legung und berechnet die Punkte.
