import { useState } from 'react';
import { makeCode, normCode } from '../net/protocol';
import { linkHint, relayUrl, transportKind } from '../net/transport';
import { useRoom } from '../net/useRoom';
import type { SessionConfig } from '../net/useGame';
import { MOODS } from '../game/story';
import { SiteNav } from './SiteChrome';
import type { Mood } from '../game/types';

const NAME_KEY = 'chmok.name';

export const savedName = () => localStorage.getItem(NAME_KEY) || '';
export const rememberName = (name: string) => localStorage.setItem(NAME_KEY, name.trim());

/** Ссылка-приглашение везёт и адрес ретранслятора: без него гость попадёт в пустоту. */
export function inviteLink(code: string, role: string) {
  const { origin, pathname } = location;
  const relay = relayUrl();
  const q = relay ? `?relay=${encodeURIComponent(relay)}` : '';
  return `${origin}${pathname}${q}#/play?room=${code}&as=${role}`;
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength = 16,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} />
      {hint && (
        <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Setup({
  players = 'two',
  waiting = false,
  onBegin,
}: {
  players?: 'two' | 'one';
  waiting?: boolean;
  onBegin: (mood: Mood, names: [string, string], rounds: number) => void;
}) {
  const [mood, setMood] = useState<Mood>('tender');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [rounds, setRounds] = useState(6);
  const [name, setName] = useState(savedName);

  if (players === 'one') {
    return (
      <div className="card card--pad">
        <p className="eyebrow">Настройки</p>
        <h1 className="h2" style={{ fontSize: 28 }}>
          Настройте вечер
        </h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Партнёр назовётся сам, когда откроет ссылку.
        </p>
        <div style={{ marginTop: 16 }}>
          <Field id="myname" label="Как вас зовут" value={name} onChange={setName} placeholder="Имя для поля" maxLength={16} />
        </div>
        <MoodPicker mood={mood} onPick={setMood} />
        <LengthPicker rounds={rounds} onPick={setRounds} />
        <button
          className="btn btn--primary btn--block"
          style={{ marginTop: 22 }}
          disabled={!name.trim()}
          onClick={() => {
            rememberName(name);
            onBegin(mood, [name.trim(), ''], rounds);
          }}
        >
          {waiting ? 'Все ещё ждём партнёра' : 'Начать первую главу'}
        </button>
      </div>
    );
  }

  return (
    <div className="card card--pad" style={{ maxWidth: 640, margin: '0 auto' }}>
      <p className="eyebrow">Новая игра</p>
      <h1 className="h2" style={{ fontSize: 34 }}>
        Настройте вечер
      </h1>
      <MoodPicker mood={mood} onPick={setMood} />
      <div className="setup__grid" style={{ marginTop: 20 }}>
        <Field id="p1" label="Игрок 1" value={a} onChange={setA} placeholder="Как вас зовут" />
        <Field id="p2" label="Игрок 2" value={b} onChange={setB} placeholder="Как зовут партнёра" />
      </div>
      <div style={{ marginTop: 16 }}>
        <LengthPicker rounds={rounds} onPick={setRounds} />
      </div>
      <button
        className="btn btn--primary btn--block"
        style={{ marginTop: 22 }}
        onClick={() => onBegin(mood, [a, b], rounds)}
      >
        Начать первую главу
      </button>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>
        Игра идёт на этом устройстве, ничего не отправляется.
      </p>
    </div>
  );
}

function MoodPicker({ mood, onPick }: { mood: Mood; onPick: (m: Mood) => void }) {
  return (
    <div style={{ marginTop: 18 }}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.12em' }}>
        Настроение
      </p>
      {MOODS.map((m) => (
        <button key={m.id} className={`choice ${mood === m.id ? 'choice--on' : ''}`} onClick={() => onPick(m.id)}>
          <span className="player__dot" style={{ background: m.id === 'tender' ? 'var(--rose)' : m.id === 'flirty' ? 'var(--amber)' : 'var(--violet)' }} />
          <span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{m.name}</span>
            <span className="muted" style={{ display: 'block', fontSize: 13.5 }}>
              {m.blurb}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function LengthPicker({ rounds, onPick }: { rounds: number; onPick: (r: number) => void }) {
  return (
    <div className="field" style={{ marginTop: 16 }}>
      <label htmlFor="len">Длина вечера</label>
      <select id="len" value={rounds} onChange={(e) => onPick(Number(e.target.value))}>
        <option value={4}>Короткий — 3 главы по 4 хода</option>
        <option value={6}>Классический — 3 главы по 6 ходов</option>
        <option value={9}>Затяжной — 3 главы по 9 ходов</option>
      </select>
    </div>
  );
}

const MODES: { id: 'solo' | 'host' | 'guest'; h: string; p: string }[] = [
  { id: 'solo', h: 'Вдвоём за экраном', p: 'Один телефон или ноутбук на двоих: ходите по очереди.' },
  { id: 'host', h: 'Создать комнату', p: 'Отправьте партнёру ссылку — у каждого будет своё поле.' },
  { id: 'guest', h: 'Войти по ссылке или коду', p: 'Партнёр уже ждёт — открывайте ссылку или вставьте код.' },
];

export function Menu({ onPick }: { onPick: (mode: 'solo' | 'host' | 'guest') => void }) {
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ padding: '40px 22px 80px' }}>
        <div className="card card--pad" style={{ maxWidth: 640, margin: '0 auto' }}>
          <p className="eyebrow">Играем</p>
          <h1 className="h2" style={{ fontSize: 32 }}>
            Выберите, как играете
          </h1>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>
            {transportKind() === 'bc'
              ? 'Браузер без WebRTC: онлайн останется между двумя вкладками одного браузера.'
              : `Онлайн — ${linkHint(transportKind())}: играть можно с разных устройств.`}
          </p>
          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            {MODES.map((m) => (
              <button key={m.id} className="choice" onClick={() => onPick(m.id)}>
                <span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{m.h}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 13.5 }}>
                    {m.p}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

export function JoinForm({
  initialCode = '',
  onJoin,
}: {
  initialCode?: string;
  onJoin: (code: string, name: string) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(savedName);
  return (
    <div className="card card--pad" style={{ maxWidth: 520, margin: '0 auto' }}>
      <p className="eyebrow">Вход в комнату</p>
      <h1 className="h2" style={{ fontSize: 28 }}>
        Код партнёра
      </h1>
      <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
        <Field
          id="code"
          label="Код или ссылка комнаты"
          value={code}
          onChange={(v) => setCode(codeFromPaste(v))}
          placeholder="NAZR"
          maxLength={6}
          hint={transportKind() === 'bc' ? 'Без WebRTC это будет вторая вкладка этого браузера.' : undefined}
        />
        <Field id="gname" label="Как вас зовут" value={name} onChange={setName} maxLength={16} />
      </div>
      <button
        className="btn btn--primary btn--block"
        style={{ marginTop: 20 }}
        disabled={code.length < 3 || !name.trim()}
        onClick={() => {
          rememberName(name);
          onJoin(code, name.trim());
        }}
      >
        Войти
      </button>
    </div>
  );
}

const noop = () => {};

/** Лобби хоста: своя пара каналов для присутствия, игра начнётся по кнопке. */
export function HostLobbyScreen({
  code,
  name,
  onStart,
  onExit,
}: {
  code: string;
  name: string;
  onStart: (cfg: SessionConfig) => void;
  onExit: () => void;
}) {
  const room = useRoom({
    room: code,
    role: 'host',
    name,
    hostState: () => null,
    onIntent: noop,
    onState: noop,
    onChat: noop,
  });
  const [copied, setCopied] = useState(false);
  const link = inviteLink(code, 'guest');

  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ padding: '40px 22px 80px' }}>
        <div style={{ display: 'grid', gap: 14, maxWidth: 640, margin: '0 auto' }}>
          <div className="card card--pad">
            <p className="eyebrow">Комната</p>
            <p className="h2" style={{ fontSize: 34, letterSpacing: '.14em' }}>
              {code}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span className="pill">{linkHint(room.kind === 'off' ? transportKind() : room.kind)}</span>
              <span className="pill">
                {room.status === 'open'
                  ? room.peerPresent
                    ? `${room.peerName || 'партнёр'} в комнате`
                    : 'ждём партнёра'
                  : 'соединение…'}
              </span>
              <button className="pill" onClick={onExit}>
                Выйти
              </button>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button
                className="btn btn--ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    /* ссылку можно скопировать и вручную */
                  }
                }}
              >
                {copied ? 'Скопировано' : 'Скопировать ссылку'}
              </button>
            </div>
            <p className="muted mono" style={{ fontSize: 12, marginTop: 10, overflowWrap: 'anywhere' }}>
              {link}
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Отправьте ссылку партнёру или откройте её на втором устройстве. Как только он появится,
              настраивайте вечер ниже и начинайте.
            </p>
          </div>

          <Setup
            players="one"
            waiting={!room.peerPresent}
            onBegin={(mood, names, rounds) => onStart({ mood, names: [names[0], ''], rounds })}
          />
        </div>
      </main>
    </>
  );
}

export const makeRoomCode = () => makeCode(4);

/** Код из ссылки, если партнёр кинул полный URL вместо кода. */
export function codeFromPaste(raw: string): string {
  const fromUrl = /room=([A-Za-z0-9]+)/.exec(raw);
  return normCode(fromUrl ? fromUrl[1] : raw);
}
