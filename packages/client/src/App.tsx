import { useEffect } from 'react';
import { useConnection } from './connection';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Waiting } from './screens/Waiting';
import { errorText } from './texts';

const ERROR_VISIBLE_MS = 4500;

export function App() {
  const { status, room, error, resuming, send, leave, clearError } = useConnection();

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, ERROR_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  let screen;
  if (room?.game) screen = <Game room={room} send={send} errorAt={error?.at ?? null} onLeave={leave} />;
  else if (room) screen = <Waiting room={room} onLeave={leave} />;
  else if (resuming) screen = <main className="screen center"><p className="hint pulse">Spiel wird geladen …</p></main>;
  else screen = <Home send={send} disabled={status !== 'open'} />;

  return (
    <>
      {status !== 'open' && (
        <div className="banner" role="status">
          {status === 'connecting' ? 'Verbinde …' : 'Verbindung unterbrochen – versuche es erneut …'}
        </div>
      )}
      {screen}
      {error && (
        <div className="toast" role="alert" onClick={clearError} data-testid="toast">
          {errorText(error.code)}
        </div>
      )}
    </>
  );
}
