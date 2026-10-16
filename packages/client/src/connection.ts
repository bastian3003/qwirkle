import type { ClientMessage, RoomView, ServerMessage } from '@qwirkle/server/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Session, loadSession, roomFromUrl, saveSession, setRoomInUrl } from './session';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface Connection {
  status: ConnectionStatus;
  room: RoomView | null;
  playerId: string | null;
  /** Last error from the server; `at` changes on every error so repeats show again. */
  error: { code: string; at: number } | null;
  /** True while resuming a stored session, so the start screen can wait. */
  resuming: boolean;
  send: (msg: ClientMessage) => void;
  leave: () => void;
  clearError: () => void;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 8000;

function socketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/** The session to resume on start, unless an invite link points to a different room. */
function initialSession(): Session | null {
  const session = loadSession();
  const invited = roomFromUrl();
  return session && (!invited || invited === session.code) ? session : null;
}

/**
 * Keeps one WebSocket open to the game server, reconnects with backoff and
 * resumes the stored session after every reconnect.
 */
export function useConnection(): Connection {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<Connection['error']>(null);
  const [resuming, setResuming] = useState(() => initialSession() !== null);

  const session = useRef<Session | null>(initialSession());
  const socket = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError({ code: 'OFFLINE', at: Date.now() });
  }, []);

  useEffect(() => {
    let retryMs = RETRY_MIN_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect() {
      if (stopped) return;
      setStatus('connecting');
      const ws = new WebSocket(socketUrl());
      socket.current = ws;

      ws.onopen = () => {
        retryMs = RETRY_MIN_MS;
        setStatus('open');
        if (session.current) ws.send(JSON.stringify({ type: 'resume', ...session.current } satisfies ClientMessage));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        switch (msg.type) {
          case 'welcome':
            session.current = { code: msg.code, token: msg.token };
            saveSession(session.current);
            setRoomInUrl(msg.code);
            setPlayerId(msg.playerId);
            setResuming(false);
            break;
          case 'room':
            setRoom(msg.room);
            break;
          case 'error':
            if (msg.error === 'SESSION_NOT_FOUND') {
              // The server forgot the room (e.g. after a restart). Back to the start screen.
              session.current = null;
              saveSession(null);
              setRoom(null);
              setPlayerId(null);
              setResuming(false);
            }
            setError({ code: msg.error, at: Date.now() });
            break;
        }
      };

      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        setStatus('closed');
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      };
    }

    // Phones suspend background tabs; reconnect right away when the app is shown again.
    function onVisible() {
      if (document.visibilityState === 'visible' && socket.current === null) {
        clearTimeout(retryTimer);
        retryMs = RETRY_MIN_MS;
        connect();
      }
    }

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      socket.current?.close();
    };
  }, []);

  const leave = useCallback(() => {
    session.current = null;
    saveSession(null);
    setRoomInUrl(null);
    setRoom(null);
    setPlayerId(null);
    // A fresh connection drops this socket's seat on the server, so the other player sees us leave.
    socket.current?.close();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { status, room, playerId, error, resuming, send, leave, clearError };
}
