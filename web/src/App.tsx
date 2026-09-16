import {Navigate, Route, Routes} from 'react-router-dom';
import {AppShell} from './layout/AppShell';
import {PATH} from './paths';
import {AssetsRoute} from './pages/AssetsRoute';
import {HistoryRoute} from './pages/HistoryRoute';
import {InputPage} from './pages/InputPage';
import {LibraryRoute} from './pages/LibraryRoute';
import {ProducePage} from './pages/ProducePage';
import {DeckPage} from './pages/DeckPage';
import {PublishPage} from './pages/PublishPage';
import {ScriptPage} from './pages/ScriptPage';
import {SettingsRoute} from './pages/SettingsRoute';
import {TranscriptPage} from './pages/TranscriptPage';
import {VoicesRoute} from './pages/VoicesRoute';
import {StudioProvider} from './studio/StudioContext';

export default function App() {
  return (
    <StudioProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to={PATH.input} replace />} />
          <Route path={PATH.input} element={<InputPage />} />
          <Route path={PATH.transcript} element={<TranscriptPage />} />
          <Route path={PATH.script} element={<ScriptPage />} />
          <Route path={PATH.deck} element={<DeckPage />} />
          <Route path={PATH.produce} element={<ProducePage />} />
          <Route path={PATH.publish} element={<PublishPage />} />
          <Route path={PATH.voices} element={<VoicesRoute />} />
          <Route path={PATH.library} element={<LibraryRoute />} />
          <Route path={PATH.history} element={<HistoryRoute />} />
          <Route path={PATH.assets} element={<AssetsRoute />} />
          <Route path={PATH.settings} element={<SettingsRoute />} />
          <Route path="*" element={<Navigate to={PATH.input} replace />} />
        </Routes>
      </AppShell>
    </StudioProvider>
  );
}
