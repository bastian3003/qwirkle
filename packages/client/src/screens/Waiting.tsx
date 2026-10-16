import type { RoomView } from '@qwirkle/server/protocol';
import { useState } from 'react';
import { inviteLink } from '../session';

export function Waiting({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const link = inviteLink(room.code);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function share() {
    try {
      if (canShare) {
        await navigator.share({ title: 'Legespiel', text: 'Spielst du mit mir?', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // Sharing was cancelled; nothing to do.
    }
  }

  return (
    <main className="screen waiting">
      <h1>Legespiel</h1>
      <div className="card">
        <p className="lead">Schick deiner Mitspielerin diesen Link:</p>
        <button className="primary big" onClick={share}>
          {canShare ? 'Link teilen' : copied ? 'Link kopiert ✓' : 'Link kopieren'}
        </button>
        <p className="link">{link}</p>
        <div className="divider">oder sag ihr den Code</div>
        <p className="code big-code" data-testid="room-code">
          {room.code}
        </p>
        <p className="hint pulse">Warte auf deine Mitspielerin …</p>
      </div>
      <button className="link-button" onClick={onLeave}>
        Abbrechen
      </button>
    </main>
  );
}
