import { RULES, SITE } from '../content/copy';
import { A, SiteNav } from './SiteChrome';

export function Rules() {
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ padding: '54px 22px 90px', maxWidth: 860 }}>
        <p className="eyebrow">Правила</p>
        <h1 className="h2">Как играть в {SITE.brand}</h1>
        <p className="lead" style={{ marginBottom: 34 }}>
          {RULES.intro}
        </p>
        {RULES.blocks.map((b) => (
          <section key={b.h} style={{ marginBottom: 34 }}>
            <h2 className="h3" style={{ color: 'var(--amber)', marginBottom: 12 }}>
              {b.h}
            </h2>
            <ul style={{ display: 'grid', gap: 10 }}>
              {b.items.map((i) => (
                <li key={i} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ color: 'var(--rose)', lineHeight: '1.6' }}>•</span>
                  <span className="muted" style={{ color: 'var(--text)', fontSize: 15.5 }}>
                    {i}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="card card--pad" style={{ marginTop: 40 }}>
          <h2 className="h3">Коротко о ходах</h2>
          <p className="muted" style={{ margin: '10px 0 18px' }}>
            Бросок → движение → разыгрыш поля → передача хода. Всё остальное игра объяснит по пути.
          </p>
          <A href="/play" className="btn btn--primary">
            Начать вечер
          </A>
        </div>
      </main>
    </>
  );
}

export function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const isPrivacy = kind === 'privacy';
  const blocks = isPrivacy
    ? [
        {
          h: 'Что мы не собираем',
          p: 'Игра идёт полностью в вашем браузере. Имена игроков, выбранные задания, результаты партий и переписка никуда не отправляются и не покидают ваше устройство.',
        },
        {
          h: 'Аккаунт',
          p: 'На раннем доступе аккаунт не нужен. Если мы подключим сетевые комнаты, статусы партий будут храниться только время сессии и удаляться по её завершении.',
        },
        {
          h: 'Cookies',
          p: 'Сайт использует локальное хранилище браузера, чтобы хранить подтверждение возраста и настройки последней партии. Базовые аналитические cookies измеряют, что работает.',
        },
        {
          h: 'Контент 18+',
          p: 'Задания рассчитаны на взрослых, играющих по взаимному согласию. Любое задание можно пропустить откупом или договорённостью — это не ломает игру.',
        },
      ]
    : [
        {
          h: 'Это игра',
          p: 'ЧМОК — развлекательная игра для пар старше 18 лет. Она не является медицинской, психологической или юридической помощью.',
        },
        {
          h: 'Согласие',
          p: 'Все задания выполняются только по обоюдному согласию. Любой из игроков может отказаться от задания, воспользоваться откупом или остановить вечер в любой момент.',
        },
        {
          h: 'Доступность',
          p: 'Игра предоставляется бесплатно на раннем доступе «как есть». Мы можем менять набор заданий, правила и интерфейс.',
        },
        {
          h: 'Ответственность',
          p: 'Вы отвечаете за то, чтобы играть во взрослом составе и в безопасной обстановке. Не играйте за рулём и не выполняйте задания, требующие риска для здоровья.',
        },
      ];
  return (
    <>
      <SiteNav />
      <main className="wrap" style={{ padding: '54px 22px 90px', maxWidth: 780 }}>
        <p className="eyebrow">{isPrivacy ? 'Документы' : 'Документы'}</p>
        <h1 className="h2">{isPrivacy ? 'Конфиденциальность' : 'Условия использования'}</h1>
        {blocks.map((b) => (
          <section key={b.h} style={{ marginBottom: 28 }}>
            <h2 className="h3" style={{ marginBottom: 8 }}>
              {b.h}
            </h2>
            <p className="muted">{b.p}</p>
          </section>
        ))}
      </main>
    </>
  );
}
