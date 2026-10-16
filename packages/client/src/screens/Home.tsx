import type { ClientMessage } from '@qwirkle/server/protocol';
import { type FormEvent, useState } from 'react';
import { loadName, roomFromUrl, saveName } from '../session';

interface Props {
  send: (msg: ClientMessage) => void;
  disabled: boolean;
}

export function Home({ send, disabled }: Props) {
  const invited = roomFromUrl();
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(invited ?? '');
  const nameOk = name.trim().length > 0;

  function submit(e: FormEvent, msg: ClientMessage) {
    e.preventDefault();
    saveName(name.trim());
    send(msg);
  }

  const nameField = (
    <label className="field">
      <span>Dein Name</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={20}
        autoComplete="given-name"
        placeholder="z. B. Gabi"
      />
    </label>
  );

  if (invited) {
    return (
      <main className="screen home">
        <h1>Legespiel</h1>
        <form className="card" onSubmit={(e) => submit(e, { type: 'join_room', code: invited, name })}>
          <p className="lead">
            Du wurdest zu Raum <strong className="code">{invited}</strong> eingeladen.
          </p>
          {nameField}
          <button className="primary big" disabled={disabled || !nameOk}>
            Mitspielen
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="screen home">
      <h1>Legespiel</h1>
      <div className="card">
        {nameField}
        <form onSubmit={(e) => submit(e, { type: 'create_room', name })}>
          <button className="primary big" disabled={disabled || !nameOk}>
            Neues Spiel starten
          </button>
        </form>
        <div className="divider">oder mit Code beitreten</div>
        <form className="join" onSubmit={(e) => submit(e, { type: 'join_room', code, name })}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="CODE"
            aria-label="Raum-Code"
            className="code-input"
          />
          <button className="secondary big" disabled={disabled || !nameOk || code.trim().length < 5}>
            Beitreten
          </button>
        </form>
      </div>
    </main>
  );
}
