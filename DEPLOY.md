# Online stellen mit Render (kostenlos)

Die App läuft als ein einziger Dienst bei [Render](https://render.com): Der Server liefert die Oberfläche mit aus und hält die Spiele. Die Einstellungen stehen in [`render.yaml`](render.yaml), man muss nichts von Hand eintragen.

## Einmalig einrichten (ca. 10 Minuten)

1. Auf <https://render.com> ein Konto anlegen, am einfachsten mit „Sign in with GitHub“. Render verlangt zur Missbrauchsprüfung oft eine Kreditkarte, auch für den kostenlosen Tarif. Dabei wird kurz 1 $ reserviert und gleich wieder freigegeben.
2. Im Dashboard **New → Blueprint** wählen.
3. Render den Zugriff auf das Repository `bastian3003/qwirkle` erlauben und es auswählen.
4. Render findet die `render.yaml` und zeigt den Dienst **legespiel** an. Den Branch auswählen, auf dem der Code liegt (zurzeit `claude/peaceful-dijkstra-myoftp`), dann **Apply** bzw. **Deploy Blueprint** klicken.
5. Der erste Build dauert ein paar Minuten. Danach steht oben die Adresse, etwa `https://legespiel-xxxx.onrender.com`.
6. Adresse auf dem Handy öffnen und testen, dann an Mama und ihre Freundin schicken.

Jeder neue Push auf den Branch wird automatisch neu veröffentlicht.

**Kosten prüfen:** Beim Dienst muss als Instance Type **Free** stehen (kommt aus `plan: free` in `render.yaml`). Unter **Billing** sollten die „Unbilled Charges“ bei 0 $ bleiben. Steht dort etwas anderes, den Dienst auf Free umstellen oder löschen.

## Auf den Homescreen legen

- **iPhone (Safari):** Teilen-Knopf → „Zum Home-Bildschirm“.
- **Android (Chrome):** Menü ⋮ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.

Danach öffnet sich das Spiel wie eine App, ohne Adressleiste.

## Was man beim kostenlosen Tarif wissen muss

- **Einschlafen:** Ohne Nachrichten an den Server schläft er nach 15 Minuten ein. Solange jemand die App geöffnet hat, schickt sie alle 4 Minuten ein Lebenszeichen, damit das nicht passiert.
- **Aufwachen dauert:** Ist der Server eingeschlafen, braucht der erste Aufruf etwa eine Minute. Die App zeigt so lange „Verbinde …“ und verbindet sich von selbst.
- **Spiele gehen verloren**, wenn der Server einschläft, neu startet oder neu veröffentlicht wird, z. B. wenn beide das Handy länger als 15 Minuten weglegen. Dann erscheint „Das Spiel gibt es nicht mehr“, und man startet ein neues. Wenn das stört, wäre „Spielstand speichern“ der nächste Ausbauschritt.
- **Freie Stunden:** Render gibt pro Monat ein Kontingent an kostenlosen Laufstunden. Ein einzelner Dienst kommt damit auch bei Dauerbetrieb hin.
