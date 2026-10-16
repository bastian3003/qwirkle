# Projekt: Legespiel-App (Arbeitstitel "Qwirkle-Clone")

## Worum es geht
Eine Handy-Webanwendung, mit der meine Mutter und ihre Freundin ein Qwirkle-artiges Legespiel gegeneinander spielen können, jede auf ihrem eigenen Handy. Die App ist rein privat. Sollte sie je öffentlich werden, braucht sie einen eigenen Namen, weil "Qwirkle" eine geschützte Marke ist.

## Ziel der ersten Version (MVP)
- Raum erstellen und per Code oder Link beitreten (zwei Spielerinnen)
- 108 Steine im Beutel, jede Spielerin hat 6 Steine auf der Hand
- Zug: Steine legen ODER Steine tauschen
- Automatische Punkteberechnung inkl. Qwirkle-Bonus
- Spielende und Siegerin anzeigen
- Bedienung per Touch: Stein antippen, aufs Feld setzen, Zug bestätigen

Später möglich: Zug-Benachrichtigungen, Spielstand speichern, mehr als 2 Spielerinnen.

## Geplanter Stack
- Web-App als PWA (läuft im Handy-Browser, auf den Homescreen legbar)
- Frontend: React
- Backend: Node.js mit WebSockets
- Hosting: kleiner, kostenloser oder günstiger Anbieter

Der Server ist die einzige Instanz, die Spielregeln prüft und Punkte berechnet. Die Handsteine der Gegnerin dürfen nie an den Client geschickt werden.

## Spielregeln
- 108 Steine: 6 Farben x 6 Symbole, jeder Stein 3-mal vorhanden.
- Start: Alle Steine in den Beutel, jede zieht 6. Wer die meisten Steine mit gemeinsamer Farbe oder gemeinsamem Symbol in einer Reihe legen kann, beginnt und legt diese aus.
- Ein Zug ist entweder Legen oder Tauschen. Danach wird auf 6 Steine nachgezogen.
- **Legen:** 1 oder mehrere Steine, alle in einer Linie (Zeile oder Spalte). Mindestens ein Stein muss an einen bereits liegenden angrenzen.
- **Tauschen:** beliebig viele Steine zurück in den Beutel, neue ziehen, keine Punkte.
- **Legeregel:** Jede entstehende Reihe hat entweder eine gemeinsame Farbe mit lauter unterschiedlichen Symbolen oder ein gemeinsames Symbol mit lauter unterschiedlichen Farben. Kein Stein darf in einer Reihe doppelt vorkommen, also maximal 6 Steine pro Reihe.
- **Punkte:** Für jede Reihe, die neu entsteht oder verlängert wird, zählen alle Steine dieser Reihe (auch die schon liegenden). Ein Stein in zwei Reihen zählt zweimal. Ein einzelner Stein ohne Nachbarn in einer Richtung bildet dort keine Reihe.
- **Qwirkle:** Wer eine Reihe auf 6 Steine vervollständigt, bekommt 6 Punkte für die Reihe plus 6 Bonus, also 12.
- **Ende:** Ist der Beutel leer und eine Spielerin legt ihren letzten Stein, bekommt sie 6 Bonuspunkte und das Spiel endet. Die meisten Punkte gewinnen.

### Festgelegte Detailregeln (abgestimmt)
- **Startspielerin:** Die App ermittelt automatisch, wer die längste mögliche Startreihe auf der Hand hat (gemeinsame Farbe mit verschiedenen Symbolen oder umgekehrt). Diese Spielerin beginnt und muss im ersten Zug mindestens so viele Steine legen. Der erste Zug wird normal gewertet. Bei Gleichstand entscheidet der Zufall.
- **Tauschen:** Man darf höchstens so viele Steine tauschen, wie im Beutel liegen. Ist der Beutel leer, ist Tauschen nicht mehr möglich. Getauschte Steine kommen erst nach dem Ziehen zurück in den Beutel.
- **Passen / Blockade:** Passen ist nur erlaubt, wenn der Beutel leer ist und die Spielerin keinen gültigen Stein legen kann. Passen alle Spielerinnen hintereinander, endet das Spiel ohne Bonus und ohne Abzug.
- **Einzelstein im ersten Zug:** zählt 1 Punkt.

## Code-Struktur
- `packages/game`: reine Spiellogik (TypeScript, ohne Abhängigkeiten), Tests mit Vitest. Wird von Server und Client gemeinsam genutzt.
- `packages/server`: Node.js-Server mit WebSockets (`ws`), läuft per `tsx`. Räume liegen nur im Arbeitsspeicher (nach einem Neustart weg; Speichern kommt später). Nachrichtenformat in `src/protocol.ts`, Raumverwaltung ohne Sockets in `src/rooms.ts`, Verdrahtung in `src/server.ts`.
- `packages/client`: React-Oberfläche (Vite), mobil zuerst. Prüft Züge zur Vorschau mit derselben Spiellogik, entscheidend bleibt der Server. Bildschirme in `src/screens`, Brett mit Verschieben/Zoomen in `src/components`, deutsche Texte und Fehlermeldungen in `src/texts.ts`. Browser-Tests mit Playwright in `e2e/`.
- Der Server liefert die gebaute Oberfläche (`packages/client/dist`) mit aus, es gibt also nur eine Adresse.
- Code, Bezeichner und Kommentare auf Englisch; Dokumentation und Texte in der App auf Deutsch.
- Tests: `npm test` im Hauptverzeichnis (Unit-Tests), `npm run e2e` (Browser-Tests; in der Cloud-Umgebung mit `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

## Arbeitsweise
- Spiellogik (Legen prüfen, Punkte zählen) als reine, gut testbare Funktionen schreiben und mit Unit-Tests abdecken, besonders Punkte-Sonderfälle (Stein in zwei Reihen, Qwirkle, Einzelstein).
- Mobile first: große Touch-Flächen, Brett muss auf dem Handy verschiebbar und zoombar sein.
- Code und Kommentare auf Deutsch oder Englisch, aber einheitlich. Erst ein lauffähiges MVP, dann Erweiterungen.
- Bei Unklarheiten zu den Regeln lieber nachfragen, statt Annahmen zu treffen.
