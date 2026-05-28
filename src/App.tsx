import { useStore } from './state/store';
import { Home } from './screens/Home';
import { RoomSelect } from './screens/RoomSelect';
import { AudiencePreview } from './screens/AudiencePreview';
import { Rehearsing } from './screens/Rehearsing';
import { Insights } from './screens/Insights';
import { Progress } from './screens/Progress';

export default function App() {
  const screen = useStore((s) => s.screen);
  return (
    <div className="app">
      {screen === 'home' && <Home />}
      {screen === 'roomSelect' && <RoomSelect />}
      {screen === 'audiencePreview' && <AudiencePreview />}
      {screen === 'rehearsing' && <Rehearsing />}
      {screen === 'insights' && <Insights />}
      {screen === 'progress' && <Progress />}
    </div>
  );
}
