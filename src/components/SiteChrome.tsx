import { useEffect, useState } from 'react';
import { FOOTER, SITE } from '../content/copy';

export const go = (path: string) => {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
};

export function A({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={`#${href}`}
      className={className}
      onClick={() => {
        window.scrollTo({ top: 0 });
      }}
    >
      {children}
    </a>
  );
}

export function SiteNav() {
  return (
    <header className="nav">
      <div className="wrap nav__in">
        <A href="/" className="brand">
          {SITE.brand}
        </A>
        <nav className="nav__links">
          <A href="/#how">Как это работает</A>
          <A href="/#moods">Настроения</A>
          <A href="/#board">Поле</A>
          <A href="/rules">Как играть</A>
          <A href="/#faq">Вопросы</A>
        </nav>
        <A href="/play" className="btn btn--primary btn--sm">
          Играть
        </A>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="h3" style={{ maxWidth: '34ch' }}>
          {FOOTER.line}
        </p>
        <div className="footer__grid" style={{ marginTop: 28 }}>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            {FOOTER.links.map((l) => (
              <A key={l.href} href={l.href} className="muted">
                {l.label}
              </A>
            ))}
          </div>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            {FOOTER.legal.map((l) => (
              <A key={l.href} href={l.href} className="muted">
                {l.label}
              </A>
            ))}
          </div>
        </div>
        <p className="muted" style={{ marginTop: 26, fontSize: 13 }}>
          {FOOTER.copy} · 18+
        </p>
      </div>
    </footer>
  );
}

const AGREED_KEY = 'chmok.agreed18';

export function AgeGate({ onAccept }: { onAccept: () => void }) {
  const [show, setShow] = useState(() => localStorage.getItem(AGREED_KEY) !== '1');

  if (!show) return null;
  return (
    <div className="agegate" role="dialog" aria-modal="true" aria-label="Подтверждение возраста">
      <div className="card card--pad" style={{ maxWidth: 460 }}>
        <p className="eyebrow">18+</p>
        <h2 className="h2" style={{ fontSize: 30 }}>
          Здесь игры для взрослых
        </h2>
        <p className="muted">
          ЧМОК — игра для пар старше 18 лет, основанная на взаимном согласии. Продолжая, вы
          подтверждаете совершеннолетие и то, что играете со взрослым партнёром.
        </p>
        <div className="row" style={{ marginTop: 22, flexWrap: 'wrap' }}>
          <button
            className="btn btn--primary"
            onClick={() => {
              localStorage.setItem(AGREED_KEY, '1');
              setShow(false);
              onAccept();
            }}
          >
            Мне есть 18 — играть
          </button>
          <A href="/" className="btn btn--ghost">
            Вернуться на сайт
          </A>
        </div>
      </div>
    </div>
  );
}

export function useHashPath() {
  const read = () => {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    return raw.split(/[?#]/)[0] || '/';
  };
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}
