import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BOARD } from '../game/board';
import { TIERS, canPayOff, chargeFor, netWorth, payoffCost, taskOf } from '../game/engine';
import { chapterAt, CURRENCY, moodName } from '../game/story';
import { normCode, type Role } from '../net/protocol';
import { useGame, useMoveTimers, type NetParams, type SessionConfig } from '../net/useGame';
import { linkLabel } from '../net/transport';
import { hasWebGL } from './three/capabilities';
import { A, SiteNav } from './SiteChrome';
import { HostLobbyScreen, JoinForm, makeRoomCode, Menu, savedName, Setup } from './Lobby';
import type { Action, GameState, Tier } from '../game/types';

const Board3D = lazy(() => import('./three/Board3D'));

const ownersOf = (state: GameState) => {
  const map: Partial<Record<string, 0 | 1>> = {};
  state.players.forEach((p) => p.owned.forEach((id) => (map[id] = p.id)));
  return map;
};

function TurnPanel({
  state,
  dispatch,
  locked,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  locked: boolean;
}) {
  const player = state.players[state.current];

  if (state.phase === 'awaiting-roll') {
    return (
      <div className={`panel${locked ? ' panel--locked' : ''}`}>
        <p className="muted" style={{ fontSize: 13 }}>
          {locked ? 'Ждём бросок партнёра' : 'Сейчас ходит'}
        </p>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>
          {player.name} <span className="muted" style={{ fontSize: 14 }}>· {player.alias}</span>
        </p>
        <div className="dice" style={{ margin: '14px 0' }}>
          <div className="die">?</div>
          <div className="die">?</div>
        </div>
        {locked ? (
          <p className="muted" style={{ fontSize: 13.5 }}>
            Ход за {player.name}.
          </p>
        ) : (
          <button className="btn btn--primary btn--block" onClick={() => dispatch({ type: 'roll' })}>
            Бросить кубики
          </button>
        )}
      </div>
    );
  }

  if (state.phase === 'moving' || state.phase === 'walking') {
    return (
      <div className="panel center">
        <p className="muted" style={{ fontSize: 13 }}>
          {state.phase === 'moving' ? `${player.name} бросает…` : `${player.name} идёт на ${state.dice?.[0]} + ${state.dice?.[1]}`}
        </p>
        <div className="dice" style={{ margin: '14px 0' }}>
          <div className={state.phase === 'moving' ? 'die die--rolling' : 'die'}>
            {state.dice?.[0] ?? '?'}
          </div>
          <div className={state.phase === 'moving' ? 'die die--rolling' : 'die'}>
            {state.dice?.[1] ?? '?'}
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'chapter-break') {
    return (
      <div className="panel">
        <p className="eyebrow">Глава закрыта</p>
        <p className="muted" style={{ fontSize: 14 }}>
          Перерыв: обсудите, кто кем был в этой главе. Дальше начисления вырастут.
        </p>
        <button className="btn btn--primary btn--block" style={{ marginTop: 14 }} onClick={() => dispatch({ type: 'enter-chapter' })}>
          Следующая глава
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="muted" style={{ fontSize: 13 }}>
        Ожидайте… ход {player.name}
      </p>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 6 }}>
        {state.phase === 'buy' ? 'Локация свободна' : state.phase === 'resolve' ? 'Откройте карту' : 'Сюрприз из сюжета'}
      </p>
    </div>
  );
}

function Modal({ children, locked = false }: { children: React.ReactNode; locked?: boolean }) {
  return (
    <div className="modal">
      <div className={`modal__box${locked ? ' modal__box--locked' : ''}`}>{children}</div>
    </div>
  );
}

function Overlays({
  state,
  dispatch,
  onRestart,
  locked,
}: {
  state: GameState;
  dispatch: (a: Action) => void;
  onRestart: () => void;
  locked: boolean;
}) {
  const chapter = chapterAt(state.mood, state.chapter);

  if (state.phase === 'premise') {
    return (
      <Modal>
        <p className="eyebrow">Глава {state.chapter} из {state.totalChapters}</p>
        <h2 className="h2" style={{ fontSize: 30 }}>{chapter.title}</h2>
        <p className="lead" style={{ marginTop: 10 }}>{chapter.premise}</p>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 16 }}>
          Псевдонимы этой главы: {state.players[0].name} — {chapter.aliases[0]}, {state.players[1].name} — {chapter.aliases[1]}
        </p>
        <button className="btn btn--primary btn--block" style={{ marginTop: 22 }} onClick={() => dispatch({ type: 'start' })}>
          Вперёд
        </button>
      </Modal>
    );
  }

  if (state.phase === 'buy') {
    const player = state.players[state.current];
    const space = BOARD[player.pos];
    return (
      <Modal locked={locked}>
        <p className="eyebrow">Свободная локация</p>
        <h2 className="h2" style={{ fontSize: 28 }}>{space.name}</h2>
        <p className="lead" style={{ marginTop: 6 }}>
          Выкуп за {space.price} {CURRENCY}. Партнёр сразу тянет карту этой улицы: сам выбирает
          уровень смелости и платит вам начисления.
        </p>
        <div className="row" style={{ marginTop: 22, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={() => dispatch({ type: 'buy' })} disabled={player.coins < space.price}>
            Выкупить за {space.price}
          </button>
          <button className="btn btn--ghost" onClick={() => dispatch({ type: 'decline-buy' })}>
            Оставить свободной
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
          У вас {player.coins} {CURRENCY}.
        </p>
      </Modal>
    );
  }

  if (state.phase === 'resolve' && state.pending) {
    const { pending } = state;
    const payer = state.players[pending.playerId];
    const space = BOARD.find((s) => s.id === pending.spaceId)!;
    return (
      <Modal locked={locked}>
        <p className="eyebrow">
          {pending.fromPurchase ? 'Карта за покупку' : 'Карта улицы'} · {moodName(state.mood)}
          {pending.multiplier > 1 ? ' · финальная глава ×2' : ''}
        </p>
        <h2 className="h2" style={{ fontSize: 28 }}>{space.name}</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          {pending.fromPurchase
            ? `Карту тянет: ${payer.name} (${payer.alias}). Фишку не двигаем — улицу только что выкупили.`
            : `Ходит: ${payer.name} (${payer.alias}).`}{' '}
          {pending.ownerId !== null &&
            `Владелец улицы: ${state.players[pending.ownerId].name} — начисления уходят владельцу.`}
        </p>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>
          Чем смелее уровень, тем меньше монет и больше жара.
        </p>
        <div style={{ marginTop: 18 }}>
          {(['base', 'tease', 'bold'] as Tier[]).map((t) => {
            const cost = chargeFor(pending.spaceId, t, pending.multiplier);
            const short = payer.coins < cost;
            return (
              <button
                key={t}
                className="tier"
                onClick={() => dispatch({ type: 'resolve-tier', tier: t })}
                title={short ? 'Монет не хватит — заплатите сколько есть' : undefined}
              >
                <span className="tier__label">
                  {TIERS[t].label}
                  <span className="tier__cost">
                    {cost} {CURRENCY}
                    {TIERS[t].heat ? ` · +${TIERS[t].heat} жара` : ''}
                  </span>
                </span>
                <span className="tier__text">{taskOf(state.mood, pending.spaceId, t)}</span>
              </button>
            );
          })}
        </div>
        <button
          className="btn btn--ghost btn--block"
          style={{ marginTop: 14 }}
          disabled={!canPayOff(state, pending)}
          onClick={() => dispatch({ type: 'pay-off' })}
        >
          {canPayOff(state, pending)
            ? `Откупиться за ${payoffCost(pending)} ${CURRENCY} — без задания`
            : `Откуп ${payoffCost(pending)} ${CURRENCY} недоступен — не хватает монет`}
        </button>
      </Modal>
    );
  }

  if (state.phase === 'fate' && state.fate) {
    return (
      <Modal locked={locked}>
        <p className="eyebrow">Сюрприз</p>
        <p className="task-text">{state.fate.text}</p>
        <p className="muted" style={{ marginTop: 14 }}>
          {state.fate.money
            ? `${state.fate.money > 0 ? '+' : ''}${state.fate.money} ${CURRENCY}`
            : state.fate.heat
              ? `+${state.fate.heat} жара`
              : state.fate.move
                ? `Сдвиг на ${state.fate.move > 0 ? '+' : ''}${state.fate.move} полей`
                : 'Без последствий — просто сюжет.'}
        </p>
        <button className="btn btn--primary btn--block" style={{ marginTop: 22 }} onClick={() => dispatch({ type: 'take-fate' })}>
          Принять как есть
        </button>
      </Modal>
    );
  }

  if (state.phase === 'gameover') {
    const [a, b] = state.players;
    const both = state.winner && state.winner.greedy === state.winner.passionate;
    return (
      <Modal>
        <p className="eyebrow">Финал</p>
        <h2 className="h2" style={{ fontSize: 30 }}>
          {both ? `${(state.winner!.greedy === 0 ? a : b).name} берёт обе короны` : 'Короны розданы'}
        </h2>
        <p className="lead" style={{ marginTop: 4 }}>
          Вечер окончен. Капитал против жара — как и договаривались.
        </p>
        <div className="crowns" style={{ marginTop: 22 }}>
          <div className="crown">
            <p className="eyebrow" style={{ marginBottom: 4 }}>Корона Жадности</p>
            <p className="crown__who">{state.winner!.greedy === 0 ? a.name : b.name}</p>
            <p className="muted" style={{ fontSize: 14 }}>
              капитал {Math.max(netWorth(a), netWorth(b))} · локаций{' '}
              {state.winner!.greedy === 0 ? a.owned.length : b.owned.length}
            </p>
          </div>
          <div className="crown crown--heat">
            <p className="eyebrow" style={{ marginBottom: 4 }}>Корона Страсти</p>
            <p className="crown__who">{state.winner!.passionate === 0 ? a.name : b.name}</p>
            <p className="muted" style={{ fontSize: 14 }}>
              жар {Math.max(a.heat, b.heat)}
            </p>
          </div>
        </div>
        <div className="card card--pad" style={{ marginTop: 18, padding: 18 }}>
          {[a, b].map((p) => (
            <div className="spread" key={p.id} style={{ padding: '6px 0', fontSize: 14 }}>
              <span>{p.name} · {p.alias}</span>
              <span className="mono muted">
                {p.coins} монет + {netWorth(p) - p.coins} в локациях · {p.heat} жара
              </span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={onRestart}>
            Новый вечер
          </button>
          <A href="/" className="btn btn--ghost">
            На главную
          </A>
        </div>
      </Modal>
    );
  }

  return null;
}

function ChatPanel({ chat, say }: { chat: { id: number; from: 'me' | 'peer'; text: string }[]; say: (t: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="panel">
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        Письмами
      </p>
      <div className="chat">
        {chat.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Здесь можно договориться о границах и напомнить партнёру, что вы рядом.
          </p>
        ) : (
          chat.map((c) => (
            <p key={c.id} className={`chat__row${c.from === 'me' ? ' chat__row--me' : ''}`}>
              {c.text}
            </p>
          ))
        )}
      </div>
      <form
        className="row"
        style={{ gap: 8, marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          say(draft);
          setDraft('');
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Написать партнёру"
          maxLength={200}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Сообщение партнёру"
        />
        <button className="btn btn--ghost" type="submit" disabled={!draft.trim()}>
          →
        </button>
      </form>
    </div>
  );
}

function Session({ cfg, net, onExit }: { cfg: SessionConfig; net: NetParams | null; onExit: () => void }) {
  const { state, dispatch, room, seat, me, chat, say } = useGame(cfg, net);
  /** В CSS-поле фишка не идёт по кольцу, там карточку держим короткой паузой. */
  const [animated] = useState(hasWebGL);
  const host = seat !== 'guest';
  const diceSum = state?.dice ? state.dice[0] + state.dice[1] : 0;

  useMoveTimers(state, dispatch, host, animated);

  const onArrive = useCallback(() => {
    if (host) dispatch({ type: 'land' });
  }, [host, dispatch]);

  const chapter = state ? chapterAt(state.mood, state.chapter) : null;
  const turn = state?.players[state.current] ?? null;

  const myTurn =
    !state || !net
      ? true
      : state.phase === 'resolve'
        ? state.pending?.playerId === me
        : state.current === me;
  const locked =
    !!state &&
    !!net &&
    !myTurn &&
    state.phase !== 'premise' &&
    state.phase !== 'chapter-break' &&
    state.phase !== 'gameover';

  if (state && chapter && turn) {
    return (
      <main className="wrap game">
        <div className="game__head">
          <A href="/" className="brand">
            ЧМОК
          </A>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="pill">{moodName(state.mood)}</span>
            <span className="pill">
              {chapter.title.replace(/^Глава \d+\.\s*/, '')} · осталось ходов: {state.roundsLeftInChapter}
            </span>
            {net && (
              <span className="pill">
                {linkLabel(room.kind)} ·{' '}
                {room.status === 'open' ? (room.peerPresent ? `${room.peerName || 'партнёр'} на связи` : 'ждём партнёра') : 'связь…'}
                {room.latency !== null ? ` · ${room.latency} мс` : ''}
              </span>
            )}
            <button className="pill" onClick={onExit}>
              Новая партия
            </button>
          </div>
        </div>

        <div className="game__layout">
          <Suspense fallback={<div className="board3d board3d--skeleton" />}>
            <Board3D
              players={state.players}
              owners={ownersOf(state)}
              currentIndex={turn.pos}
              dice={state.dice}
              rolling={state.phase === 'moving'}
              onArrive={onArrive}
              zoom
              hint="покрути поле"
              brand="ЧМОК"
              overlay={
                <div className="board3d__overlay">
                  <span className="board3d__chip">
                    <b
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-display)',
                        fontSize: 17,
                        color: 'var(--text)',
                      }}
                    >
                      {turn.name}
                    </b>
                    {state.phase === 'gameover' ? 'финал' : `ходит · ${turn.alias}`}
                  </span>
                  <span className="board3d__chip">
                    {state.phase === 'moving'
                      ? 'кубики прыгают…'
                      : state.phase === 'walking'
                        ? `${state.dice?.[0]} · ${state.dice?.[1]} = ${diceSum}`
                        : state.dice
                          ? `${state.dice[0]} · ${state.dice[1]}`
                          : 'кубики ждут'}
                  </span>
                </div>
              }
              fallbackHub={
                <div>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>
                    {state.phase === 'gameover' ? 'Финал' : 'Ходит'}
                  </p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1.1 }}>{turn.name}</p>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {turn.alias}
                  </p>
                </div>
              }
            />
          </Suspense>

          <div className="grid" style={{ gap: 14 }}>
            {state.players.map((p) => (
              <div className={`player${state.current === p.id ? ' player--turn' : ''}`} key={p.id}>
                <span className="player__dot" style={{ background: p.id === 0 ? 'var(--mint)' : 'var(--amber)' }} />
                <span>
                  <span className="player__name">{p.name}</span>
                  <span className="player__alias" style={{ display: 'block' }}>
                    {p.alias} · {p.owned.length} улиц
                    {net && p.id === me ? ' · вы' : ''}
                  </span>
                </span>
                <span className="player__stats">
                  <span className="player__coins">{netWorth(p)}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    капитал
                  </span>
                  <span className="stat--heat" style={{ fontSize: 13 }}>
                    ♥ {p.heat}
                  </span>
                </span>
              </div>
            ))}

            <TurnPanel state={state} dispatch={dispatch} locked={locked} />

            <div className="panel">
              <p className="eyebrow" style={{ marginBottom: 10 }}>
                Журнал вечера
              </p>
              <div className="log">
                {state.log.map((l) => (
                  <div key={l.id} className={`log__row log__row--${l.tone}`}>
                    {l.text}
                  </div>
                ))}
              </div>
            </div>

            {net && <ChatPanel chat={chat} say={say} />}
          </div>
        </div>

        <Overlays state={state} dispatch={dispatch} onRestart={onExit} locked={locked} />
      </main>
    );
  }

  return (
    <main className="wrap" style={{ padding: '60px 22px 80px' }}>
      <div className="card card--pad" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
        <p className="eyebrow">
          {room.kind === 'bc' ? 'Локальная комната' : 'Онлайн'} · {net?.room}
        </p>
        <h1 className="h2" style={{ fontSize: 30 }}>
          {room.status === 'open' ? 'Ждём первый ход хоста' : 'Соединяемся с комнатой'}
        </h1>
        <p className="muted" style={{ marginTop: 10 }}>
          {room.status === 'closed'
            ? 'Связи нет — пробуем снова. Проверьте, что партнёр держит свою вкладку открытой.'
            : 'Хост выбирает настроение и начинает главу — поле появится у вас само.'}
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <span className="pill">{room.peerPresent ? 'партнёр на связи' : 'ждём вторых'}</span>
          <button className="btn btn--ghost" onClick={onExit}>
            Выйти
          </button>
        </div>
      </div>
    </main>
  );
}

type Stage = { kind: 'menu' } | { kind: 'solo' } | { kind: 'online'; room: string; role: Role };

const GUEST_CFG: SessionConfig = { mood: 'tender', names: ['', ''], rounds: 6 };

/** Ссылка-приглашение: #/play?room=КОД&as=host|guest */
function readHash(): Stage {
  const params = new URLSearchParams(location.hash.replace(/^[^?]*\??/, ''));
  const room = normCode(params.get('room') || '');
  const as = params.get('as');
  if (room.length < 3) return { kind: 'menu' };
  if (as === 'host') return { kind: 'online', room, role: 'host' };
  if (as === 'guest') return { kind: 'online', room, role: 'guest' };
  return { kind: 'menu' };
}

export function Game() {
  const [stage, setStage] = useState<Stage>(readHash);
  const [cfg, setCfg] = useState<SessionConfig | null>(null);
  const [id, setId] = useState(0);

  useEffect(() => {
    const on = () => setStage(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const leave = () => {
    setCfg(null);
    location.hash = '/play';
    setStage({ kind: 'menu' });
  };

  const join = (room: string) => {
    location.hash = `/play?room=${room}&as=guest`;
    setStage({ kind: 'online', room, role: 'guest' });
  };

  if (stage.kind === 'online') {
    if (stage.role === 'guest') {
      if (!savedName())
        return (
          <>
            <SiteNav />
            <main className="wrap" style={{ padding: '40px 22px 80px' }}>
              <JoinForm initialCode={stage.room} onJoin={join} />
            </main>
          </>
        );
      return (
        <Session
          key={`g${stage.room}${id}`}
          cfg={GUEST_CFG}
          net={{ room: stage.room, role: 'guest', name: savedName() }}
          onExit={leave}
        />
      );
    }
    if (!cfg)
      return <HostLobbyScreen code={stage.room} name={savedName() || 'Хост'} onStart={setCfg} onExit={leave} />;
    return (
      <Session
        key={`h${stage.room}${id}`}
        cfg={cfg}
        net={{ room: stage.room, role: 'host', name: cfg.names[0] }}
        onExit={leave}
      />
    );
  }

  if (cfg) return <Session key={`s${id}`} cfg={cfg} net={null} onExit={() => setCfg(null)} />;

  if (stage.kind === 'solo') {
    return (
      <>
        <SiteNav />
        <main className="wrap" style={{ padding: '40px 22px 80px' }}>
          <Setup
            onBegin={(mood, names, rounds) => {
              setCfg({ mood, names, rounds });
              setId((n) => n + 1);
            }}
          />
        </main>
      </>
    );
  }

  return (
    <Menu
      onPick={(m) => {
        if (m === 'solo') setStage({ kind: 'solo' });
        else if (m === 'guest') setStage({ kind: 'online', room: '', role: 'guest' });
        else {
          const code = makeRoomCode();
          location.hash = `/play?room=${code}&as=host`;
          setStage({ kind: 'online', room: code, role: 'host' });
        }
      }}
    />
  );
}
