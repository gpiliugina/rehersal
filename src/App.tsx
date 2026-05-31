import { useStore } from './state/store';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Rehearsing } from './screens/Rehearsing';
import { Insights } from './screens/Insights';
import { Progress } from './screens/Progress';
import { Logo } from './components/Logo';

export default function App() {
  const screen = useStore((s) => s.screen);
  return (
    <div className="app" data-screen={screen}>
      {screen === 'home' && <Home />}
      {screen === 'setup' && <Setup />}
      {screen === 'rehearsing' && <Rehearsing />}
      {screen === 'insights' && <Insights />}
      {screen === 'progress' && <Progress />}
      {/* App wordmark — top-left on every page, returns Home. */}
      <Logo />
    </div>
  );
}
