import { Navigate, Route, Routes } from 'react-router-dom';
import { TabBar } from '@/ui/TabBar';
import { ListsScreen } from '@/screens/lists/ListsScreen';
import { NewListScreen } from '@/screens/lists/NewListScreen';
import { RosterScreen } from '@/screens/roster/RosterScreen';
import { AddUnitScreen } from '@/screens/roster/AddUnitScreen';
import { UnitScreen } from '@/screens/roster/UnitScreen';
import { ArmyScreen } from '@/screens/roster/ArmyScreen';
import { ExportScreen } from '@/screens/roster/ExportScreen';
import { PrintScreen } from '@/screens/roster/PrintScreen';
import { ImportScreen } from '@/screens/importer/ImportScreen';
import { ReferenceScreen } from '@/screens/reference/ReferenceScreen';
import { CoreRulesScreen } from '@/screens/reference/CoreRulesScreen';
import { FactionScreen } from '@/screens/reference/FactionScreen';
import { RefUnitScreen } from '@/screens/reference/RefUnitScreen';
import { PlayScreen } from '@/screens/play/PlayScreen';
import { NewGameScreen } from '@/screens/play/NewGameScreen';
import { GameScreen } from '@/screens/play/GameScreen';
import { GameUnitScreen } from '@/screens/play/GameUnitScreen';
import { OpponentUnitScreen } from '@/screens/play/OpponentUnits';
import { JoinScreen } from '@/screens/play/JoinScreen';
import { LayoutsScreen } from '@/screens/play/layouts';
import { CollectionScreen } from '@/screens/collection/CollectionScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { RulePopupProvider } from '@/ui/RulePopup';
import { DataBanner } from '@/ui/DataBanner';
import { ToastHost } from '@/ui/Toast';
import { PinnedScreen } from '@/screens/reference/PinnedScreen';
import { useEffect } from 'react';
import { startupSync } from '@/data/bootstrap';
import { watchIdleGames } from '@/data/idle';

export function App() {
  useEffect(() => startupSync(), []);
  useEffect(() => watchIdleGames(), []);
  return (
    <RulePopupProvider>
      <div className="shell">
        <DataBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/lists" replace />} />
          <Route path="/lists" element={<ListsScreen />} />
          <Route path="/new" element={<NewListScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/roster/:id" element={<RosterScreen />} />
          <Route path="/roster/:id/add" element={<AddUnitScreen />} />
          <Route path="/roster/:id/army" element={<ArmyScreen />} />
          <Route path="/roster/:id/export" element={<ExportScreen />} />
          <Route path="/roster/:id/print" element={<PrintScreen />} />
          <Route path="/roster/:id/unit/:unitId" element={<UnitScreen />} />
          <Route path="/reference" element={<ReferenceScreen />} />
          <Route path="/reference/core" element={<CoreRulesScreen />} />
          <Route path="/reference/pinned" element={<PinnedScreen />} />
          <Route path="/reference/faction/:catalogueId" element={<FactionScreen />} />
          <Route path="/reference/unit/:catalogueId/:key" element={<RefUnitScreen />} />
          <Route path="/play" element={<PlayScreen />} />
          <Route path="/play/new" element={<NewGameScreen />} />
          <Route path="/play/join" element={<JoinScreen />} />
          <Route path="/play/layouts" element={<LayoutsScreen />} />
          <Route path="/play/:gameId" element={<GameScreen />} />
          <Route path="/play/:gameId/unit/:unitId" element={<GameUnitScreen />} />
          <Route path="/play/:gameId/opp/:playerId/:idx" element={<OpponentUnitScreen />} />
          <Route path="/collection" element={<CollectionScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/lists" replace />} />
        </Routes>
        <TabBar />
        <ToastHost />
      </div>
    </RulePopupProvider>
  );
}
