import { Navigate, Route, Routes } from 'react-router-dom';
import { TabBar } from '@/ui/TabBar';
import { ListsScreen } from '@/screens/lists/ListsScreen';
import { RosterScreen } from '@/screens/roster/RosterScreen';
import { UnitScreen } from '@/screens/roster/UnitScreen';
import { ReferenceScreen } from '@/screens/reference/ReferenceScreen';
import { PlayScreen } from '@/screens/play/PlayScreen';
import { CollectionScreen } from '@/screens/collection/CollectionScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';

export function App() {
  return (
    <div className="shell">
      <Routes>
        <Route path="/" element={<Navigate to="/lists" replace />} />
        <Route path="/lists" element={<ListsScreen />} />
        <Route path="/roster/:id" element={<RosterScreen />} />
        <Route path="/unit/:id" element={<UnitScreen />} />
        <Route path="/reference" element={<ReferenceScreen />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/collection" element={<CollectionScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/lists" replace />} />
      </Routes>
      <TabBar />
    </div>
  );
}
