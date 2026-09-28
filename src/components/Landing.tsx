import { Suspense, lazy, useMemo, useState } from 'react';
import { BOARD, SPOTS } from '../game/board';
import { DECK } from '../content/deck';
import { BOARD_PREVIEW, FAQ, MOOD_CARDS, SAMPLE_CARD, SITE, STEPS } from '../content/copy';
import { A, SiteNav } from './SiteChrome';
import type { Mood, PlayerState, SpaceId, Tier } from '../game/types';

const Board3D = lazy(() => import('./three/Board3D'));

const demoPawn = (id: 0 | 1, pos: number): PlayerState => ({
  id,
  name: '',
  alias: '',
  pos,
  coins: 0,
  heat: 0,
  owned: [],
  crown: null,
});

const DEMO_P0 = demoPawn(0, 0);
const DEMO_P1 = demoPawn(1, 6);

const TIER_ORDER: Tier[] = ['base', 'tease', 'bold'];
const TIER_RU: Record<Tier, string> = { base: 'База', tease: 'Дразнить', bold: 'Смелее' };

function SampleCard() {
  const [tier, setTier] = useState<Tier>('base');
  const card = SAMPLE_CARD.tiers.find((t) => t.label === TIER_RU[tier])!;
  return (
    <div className="card card--pad">
      <div className="spread" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            {SAMPLE_CARD.space} · настроение «{SAMPLE_CARD.mood}»
          </p>
          <h3 className="h3">Одна карта — три уровня смелости</h3>
        </div>
        <div className="row" role="tablist" aria-label="Уровень смелости">
          {TIER_ORDER.map((t) => (
            <button
              key={t}
              className={`btn btn--sm ${tier === t ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setTier(t)}
            >
              {TIER_RU[t]}
            </button>
          ))}
        </div>
      </div>
      <p className="task-text">{card.text}</p>
      <div className="spread" style={{ marginTop: 18, flexWrap: 'wrap', gap: 10 }}>
        <span className="pill mono">{card.cost}</span>
        <span className="pill" style={{ color: 'var(--pink)', borderColor: 'rgba(255,77,141,.5)' }}>
          {card.heat}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>
        Это был всего один ход. На поле их двадцать.
      </p>
    </div>
  );
}

function BoardExplorer() {
  const [selected, setSelected] = useState<SpaceId>('jukebox');
  const [mood, setMood] = useState<Mood>('flirty');
  const space = BOARD.find((s) => s.id === selected)!;
  const owners = useMemo(() => {
    const map: Partial<Record<SpaceId, 0 | 1>> = {};
    SPOTS.slice(0, 4).forEach((s, i) => (map[s.id] = i % 2 === 0 ? 0 : 1));
    return map;
  }, []);
  const task = DECK[mood][selected];

  return (
    <div className="split split--board">
      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 22 }}>
        <Suspense fallback={<div className="board3d board3d--skeleton" />}>
          <Board3D
            owners={owners}
            selectedId={selected}
            interactive
            onSelect={setSelected}
            hint="кликни по улице"
            brand={SITE.brand}
            overlay={
              <div className="board3d__overlay">
                <span className="board3d__chip">
                  <b
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      color: 'var(--text)',
                    }}
                  >
                    {space.name}
                  </b>
                  {space.kind === 'spot'
                    ? `Выкуп: ${space.price} монет`
                    : space.kind === 'start'
                      ? 'Старт: +200 монет'
                      : 'Случайный поворот сюжета'}
                </span>
              </div>
            }
            fallbackHub={
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  Поле вечера
                </p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.1 }}>
                  {space.name}
                </p>
              </div>
            }
          />
        </Suspense>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {MOOD_CARDS.map((m) => (
            <button
              key={m.id}
              className={`pill ${mood === m.id ? 'btn btn--primary btn--sm' : ''}`}
              onClick={() => setMood(m.id as Mood)}
              style={{ cursor: 'pointer' }}
            >
              {m.h}
            </button>
          ))}
        </div>
      </div>

      <div className="card card--pad">
        <p className="eyebrow">Задания локации</p>
        <h3 className="h3" style={{ marginBottom: 14 }}>
          {space.name}
        </h3>
        {task ? (
          TIER_ORDER.map((t) => (
            <div key={t} style={{ marginBottom: 14 }}>
              <p style={{ fontFamily: 'var(--font-display)', color: 'var(--amber)', fontSize: 13 }}>
                {TIER_RU[t]}
              </p>
              <p style={{ fontSize: 14.5 }}>{task[t]}</p>
            </div>
          ))
        ) : (
          <p className="muted" style={{ fontSize: 14.5 }}>
            Здесь правил нет — только случай. Кубики решают, что вы сделаете дальше.
          </p>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>
          Нажмите на любую улицу слева, чтобы увидеть её задания.
        </p>
      </div>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div>
      {FAQ.map((item, i) => (
        <div className="faq__item" key={item.q}>
          <button className="faq__q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            {item.q}
            <span className="faq__icon">{open === i ? '−' : '+'}</span>
          </button>
          {open === i && <p className="faq__a">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}

export function Landing() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="wrap hero">
          <div>
            <p className="eyebrow">Настольная игра на двоих · 18+</p>
            <h1 className="h-display">{SITE.hero.h1}</h1>
            <p className="hero__sub">{SITE.hero.sub}</p>
            <div className="hero__cta">
              <A href="/play" className="btn btn--primary">
                {SITE.hero.cta}
              </A>
              <A href="/#how" className="btn btn--ghost">
                {SITE.hero.ctaAlt}
              </A>
            </div>
            <div className="hero__meta">
              {SITE.hero.meta.map((m) => (
                <span className="pill" key={m}>
                  {m}
                </span>
              ))}
            </div>
          </div>
          <Suspense fallback={<div className="board3d board3d--skeleton" />}>
            <Board3D
              autoRotate
              brand={SITE.brand}
              players={[DEMO_P0, DEMO_P1]}
              overlay={
                <div className="board3d__overlay">
                  <span className="board3d__chip">
                    {BOARD.length} полей · 3 главы · 2 короны
                  </span>
                </div>
              }
              fallbackHub={
                <div>
                  <p
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 30,
                      letterSpacing: '.08em',
                    }}
                  >
                    {SITE.brand}
                  </p>
                  <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    {BOARD.length} полей · 3 главы · 2 короны
                  </p>
                </div>
              }
            />
          </Suspense>
        </section>

        <section className="wrap section--tight">
          <div className="card card--pad" style={{ textAlign: 'center', padding: '44px 28px' }}>
            <p className="lead" style={{ margin: '0 auto', maxWidth: '58ch', color: 'var(--text)' }}>
              {SITE.promise}
            </p>
          </div>
        </section>

        <section className="wrap section" id="how">
          <p className="eyebrow">Как это работает</p>
          <h2 className="h2">Четыре шага до вечера, который вы запомните</h2>
          <div className="steps" style={{ marginTop: 30 }}>
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <p className="step__n">{s.n}</p>
                <h3 className="h3">{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 26 }}>
            <A href="/rules" className="btn btn--ghost btn--sm">
              Полные правила →
            </A>
          </p>
        </section>

        <section className="wrap section" id="moods">
          <p className="eyebrow">Настроения</p>
          <h2 className="h2">Одно поле, три вечера</h2>
          <div className="moods" style={{ marginTop: 30 }}>
            {MOOD_CARDS.map((m) => (
              <div className={`mood mood--${m.id}`} key={m.id}>
                <p className="eyebrow" style={{ marginBottom: 8 }}>
                  {m.tag}
                </p>
                <h3 className="h3" style={{ fontSize: 26 }}>
                  {m.h}
                </h3>
                <p className="mood__hearts" style={{ margin: '10px 0 12px' }}>
                  {m.hearts}
                </p>
                <p className="muted">{m.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="wrap section" id="board">
          <p className="eyebrow">Поле</p>
          <h2 className="h2">Девятнадцать улиц и два сюрприза</h2>
          <p className="lead" style={{ marginBottom: 30 }}>
            Цены растут от Открыточного переулка к Полуночному особняку. Каждые четыре-пять улиц —
            «Сюрприз»: он меняет деньги, жар или место на поле.
          </p>
          <BoardExplorer />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
            {BOARD_PREVIEW.map((n) => (
              <span className="pill" key={n}>
                {n}
              </span>
            ))}
          </div>
        </section>

        <section className="wrap section">
          <div className="split" style={{ alignItems: 'center' }}>
            <div>
              <p className="eyebrow">Механика</p>
              <h2 className="h2">Деньги против желания</h2>
              <p className="lead">
                Каждая карта стоит монет — но чем смелее уровень, тем меньше вы платите и тем больше
                получаете жара. Откупиться можно, если в кармане есть полтора цены улицы. Пустой
                карман — значит придётся целоваться.
              </p>
              <ul style={{ marginTop: 20, display: 'grid', gap: 10 }}>
                {[
                  'Старт с 1000 монет у каждого',
                  'Выкупленная улица выдаёт партнёру карту',
                  'Финальная глава удваивает начисления',
                  'Корона Жадности и Корона Страсти',
                ].map((t) => (
                  <li key={t} className="row" style={{ gap: 10, color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--amber)' }}>✦</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <SampleCard />
          </div>
        </section>

        <section className="wrap section" id="faq">
          <p className="eyebrow">Вопросы</p>
          <h2 className="h2">Что спрашивают пары</h2>
          <div style={{ marginTop: 24 }}>
            <Faq />
          </div>
        </section>

        <section className="wrap section--tight" style={{ paddingBottom: 90 }}>
          <div
            className="card"
            style={{
              padding: '46px 30px',
              textAlign: 'center',
              background:
                'radial-gradient(120% 140% at 50% 0%, rgba(255,77,141,.3), rgba(23,11,32,.9) 60%)',
            }}
          >
            <h2 className="h2" style={{ fontSize: 'clamp(28px,5vw,46px)' }}>
              Ваш ход
            </h2>
            <p className="lead" style={{ margin: '0 auto 26px' }}>
              Одно поле. Два игрока. Вечер, который может пойти куда угодно.
            </p>
            <A href="/play" className="btn btn--primary">
              Играть в ЧМОК
            </A>
            <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
              Бесплатно на раннем доступе · без установки · 18+
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
