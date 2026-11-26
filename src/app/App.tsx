import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from '@/ui/TabBar';
// The list builder is what opens first and is used most: it stays in the main bundle.
import { ListsScreen } from '@/screens/lists/ListsScreen';
import { NewListScreen } from '@/screens/lists/NewListScreen';
import { RosterScreen } from '@/screens/roster/RosterScreen';
import { AddUnitScreen } from '@/screens/roster/AddUnitScreen';
import { UnitScreen } from '@/screens/roster/UnitScreen';
import { ArmyScreen } from '@/screens/roster/ArmyScreen';
import { RulePopupProvider } from '@/ui/RulePopup';
import { DataBanner } from '@/ui/DataBanner';
import { ToastHost } from '@/ui/Toast';
import { SplitRoute } from '@/ui/layout';
import { Loading } from '@/ui/Loading';
import { startupSync } from '@/data/bootstrap';
import { watchIdleGames } from '@/data/idle';
import { keepStorage, watchStorageErrors } from '@/data/storage';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { UpdatePrompt } from '@/ui/UpdatePrompt';
import { IosInstallBanner } from '@/ui/IosInstallBanner';
import { MovedBanner } from '@/ui/MovedBanner';

/**
 * Everything else loads when first opened (the service worker has already
 * cached it, so this works offline too).
 */
const load = <K extends string>(factory: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => factory().then((m) => ({ default: m[name] })));
const ExportScreen = load(() => import('@/screens/roster/ExportScreen'), 'ExportScreen');
const PrintScreen = load(() => import('@/screens/roster/PrintScreen'), 'PrintScreen');
const ImportScreen = load(() => import('@/screens/importer/ImportScreen'), 'ImportScreen');
const ReferenceScreen = load(() => import('@/screens/reference/ReferenceScreen'), 'ReferenceScreen');
const CoreRulesScreen = load(() => import('@/screens/reference/CoreRulesScreen'), 'CoreRulesScreen');
const FactionScreen = load(() => import('@/screens/reference/FactionScreen'), 'FactionScreen');
const RefUnitScreen = load(() => import('@/screens/reference/RefUnitScreen'), 'RefUnitScreen');
const PinnedScreen = load(() => import('@/screens/reference/PinnedScreen'), 'PinnedScreen');
const PlayScreen = load(() => import('@/screens/play/PlayScreen'), 'PlayScreen');
const NewGameScreen = load(() => import('@/screens/play/NewGameScreen'), 'NewGameScreen');
const GameScreen = load(() => import('@/screens/play/GameScreen'), 'GameScreen');
const PracticeScreen = load(() => import('@/screens/play/GameScreen'), 'PracticeScreen');
const GameUnitScreen = load(() => import('@/screens/play/GameUnitScreen'), 'GameUnitScreen');
const OpponentUnitScreen = load(() => import('@/screens/play/OpponentUnits'), 'OpponentUnitScreen');
const JoinScreen = load(() => import('@/screens/play/JoinScreen'), 'JoinScreen');
const LayoutsScreen = load(() => import('@/screens/play/layouts'), 'LayoutsScreen');
const CollectionScreen = load(() => import('@/screens/collection/CollectionScreen'), 'CollectionScreen');
const SettingsScreen = load(() => import('@/screens/settings/SettingsScreen'), 'SettingsScreen');
const MoveInScreen = load(() => import('@/screens/move/MoveScreens'), 'MoveInScreen');
const MoveOutScreen = load(() => import('@/screens/move/MoveScreens'), 'MoveOutScreen');

/** Screens opened from a shared link or QR code. */
const LINK_SCREENS = ['/import', '/play/join', '/move'];

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => startupSync(), []);
  useEffect(() => watchIdleGames(), []);
  useEffect(() => {
    void keepStorage();
    return watchStorageErrors();
  }, []);
  return (
    <RulePopupProvider>
      <div className="shell">
        <TabBar />
        <div className="shell-main">
        <MovedBanner />
        <DataBanner />
        <UpdatePrompt />
        {LINK_SCREENS.includes(pathname) && <IosInstallBanner compact />}
        <ErrorBoundary resetKey={pathname} onHome={() => navigate('/lists')}>
        <Suspense fallback={<main className="screen"><Loading what="this screen" /></main>}>
        <Routes>
          <Route path="/" element={<Navigate to="/lists" replace />} />
          <Route path="/lists" element={<ListsScreen />} />
          <Route path="/new" element={<NewListScreen />} />
          <Route path="/import" element={<ImportScreen />} />
          <Route path="/roster/:id" element={<SplitRoute main={<RosterScreen />} />}>
            <Route path="add" element={<AddUnitScreen />} />
            <Route path="army" element={<ArmyScreen />} />
            <Route path="export" element={<ExportScreen />} />
            <Route path="unit/:unitId" element={<UnitScreen />} />
          </Route>
          <Route path="/roster/:id/print" element={<PrintScreen />} />
          <Route path="/roster/:id/play" element={<PracticeScreen />} />
          <Route path="/reference" element={<ReferenceScreen />} />
          <Route path="/reference/core" element={<CoreRulesScreen />} />
          <Route path="/reference/pinned" element={<PinnedScreen />} />
          <Route path="/reference/faction/:catalogueId" element={<FactionScreen />} />
          <Route path="/reference/unit/:catalogueId/:key" element={<RefUnitScreen />} />
          <Route path="/play" element={<PlayScreen />} />
          <Route path="/play/new" element={<NewGameScreen />} />
          <Route path="/play/join" element={<JoinScreen />} />
          <Route path="/play/layouts" element={<LayoutsScreen />} />
          <Route path="/play/:gameId" element={<SplitRoute main={<GameScreen />} />}>
            <Route path="unit/:unitId" element={<GameUnitScreen />} />
            <Route path="opp/:playerId/:idx" element={<OpponentUnitScreen />} />
          </Route>
          <Route path="/collection" element={<CollectionScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/move" element={<MoveInScreen />} />
          <Route path="/move-out" element={<MoveOutScreen />} />
          <Route path="*" element={<Navigate to="/lists" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
        </div>
        <ToastHost />
      </div>
    </RulePopupProvider>
  );
}
