import { Game } from './components/Game';
import { Landing } from './components/Landing';
import { Legal, Rules } from './components/Rules';
import { AgeGate, SiteFooter } from './components/SiteChrome';
import { useHashPath } from './components/SiteChrome';

export function App() {
  const path = useHashPath();

  if (path === '/play') {
    return (
      <>
        <AgeGate onAccept={() => {}} />
        <Game />
      </>
    );
  }

  return (
    <>
      {path === '/rules' ? <Rules /> : path === '/terms' ? <Legal kind="terms" /> : path === '/privacy' ? <Legal kind="privacy" /> : <Landing />}
      <SiteFooter />
    </>
  );
}
