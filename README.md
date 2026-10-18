# Legespiel-App (Arbeitstitel „Qwirkle-Clone“)

Private Handy-Web-App, mit der zwei Spielerinnen ein Qwirkle-artiges Legespiel gegeneinander spielen. Projektziele und Regeln stehen in [`CLAUDE.md`](CLAUDE.md).

## Stand

- [x] Spiellogik (`packages/game`): Beutel, Hand, Legen, Tauschen, Passen, Punkte inkl. Qwirkle, Startspielerin, Spielende
- [x] Server (`packages/server`): Node.js + WebSockets, Räume per 5-stelligem Code, Wiederverbinden nach Neuladen
- [x] Oberfläche (`packages/client`): React, Raum per Link oder Code, Steine antippen und legen (ohne Lege-Hilfen, geprüft wird erst beim Bestätigen), Tauschen, Passen, Spielende mit neuer Runde, Brett verschieb- und zoombar, auf den Homescreen legbar
- [x] Hosting vorbereitet: kostenlos bei Render, Anleitung in [`DEPLOY.md`](DEPLOY.md)

## Entwickeln

```sh
npm install
npm test          # Unit-Tests (Vitest)
npm run typecheck
npm run build     # Oberfläche bauen
npm start         # Server + Oberfläche auf http://localhost:3000 (PORT=… zum Ändern)
npm run e2e       # Browser-Tests mit zwei simulierten Handys
```

Zum Entwickeln mit automatischem Neuladen: `npm run dev -w @qwirkle/server` und parallel `npm run dev -w @qwirkle/client` (Oberfläche auf Port 5173, leitet `/ws` an den Server weiter).

## Server-Protokoll

WebSocket unter `/ws`, Nachrichten als JSON. Details und Typen: `packages/server/src/protocol.ts`.

| Client → Server | Bedeutung |
| --- | --- |
| `{type:"create_room", name}` | Raum anlegen, man ist Spielerin 1 |
| `{type:"join_room", code, name}` | Raum beitreten; mit der 2. Spielerin startet das Spiel |
| `{type:"resume", code, token}` | Nach Neuladen/Verbindungsabbruch wieder einsteigen |
| `{type:"action", action}` | Zug: `place`, `swap` oder `pass` |
| `{type:"new_game"}` | Nach Spielende neue Runde im selben Raum |
| `{type:"ping"}` | Lebenszeichen alle 4 Minuten, hält den kostenlosen Server wach; keine Antwort |

| Server → Client | Bedeutung |
| --- | --- |
| `{type:"welcome", code, playerId, token}` | Bestätigung; `token` im Browser speichern |
| `{type:"room", room}` | Aktueller Stand aus Sicht dieser Spielerin, nach jeder Änderung |
| `{type:"error", error}` | Fehlercode, z. B. `NOT_YOUR_TURN`, `INVALID_LINE` |

`GET /health` antwortet mit `ok` (für den Hosting-Anbieter).

## Spiellogik in Kürze

- `createGame(players, rng)` teilt aus und bestimmt die Startspielerin.
- `applyAction(state, playerId, action, rng)` prüft und führt einen Zug aus (`place`, `swap`, `pass`) und gibt einen neuen Zustand oder einen Fehlercode zurück.
- `getPlayerView(state, playerId)` liefert nur das, was eine Spielerin sehen darf (keine fremden Handsteine, kein Beutelinhalt).
- `evaluatePlacement(board, placements)` prüft eine Legung und berechnet die Punkte.
