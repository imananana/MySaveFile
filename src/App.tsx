import { useState, useEffect, useRef, lazy, Suspense, Component, ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-c-base flex flex-col items-center justify-center gap-3 p-8">
          <p className="text-c-red text-sm font-mono">Error: {(this.state.error as Error).message}</p>
          <pre className="text-xs text-c-dim max-w-xl overflow-auto">{(this.state.error as Error).stack}</pre>
          <button onClick={() => window.location.href = '/saves'} className="text-c-accent text-sm hover:underline">Back to saves</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Layout/Sidebar';
import { MobileBanner } from './components/Layout/MobileBanner';
import { DesktopOnly } from './components/Layout/DesktopOnly';
import { TopBar } from './components/Layout/TopBar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { WorldView } from './components/WorldView/WorldView';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import SaveFilePicker from './pages/SaveFilePicker';
// About, Privacy and Terms are pre-rendered to real HTML at build time, so the
// text is on screen before React starts. Code-splitting them undid that: React
// mounted, hit the lazy boundary, and blanked the text the reader was already
// looking at until the chunk arrived — measured at ~200ms of empty page on a
// slow connection, a flash rather than a wait. They are ~2KB each, so they ride
// in the main bundle and render immediately. Do not make these lazy again.
import { About } from './pages/About';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';

const HouseholdWorkspace = lazy(() => import('./components/HouseholdManager/HouseholdWorkspace').then((m) => ({ default: m.HouseholdWorkspace })));
const Sims             = lazy(() => import('./pages/Sims').then((m) => ({ default: m.Sims })));
const Randomizer       = lazy(() => import('./pages/Randomizer'));
const Diversity        = lazy(() => import('./pages/Diversity'));
const Family           = lazy(() => import('./pages/Family'));
const PackSettings     = lazy(() => import('./pages/PackSettings'));
const ClubManager      = lazy(() => import('./components/ClubManager/ClubManager').then((m) => ({ default: m.ClubManager })));
const PinEditor        = lazy(() => import('./components/PinEditor/PinEditor').then((m) => ({ default: m.PinEditor })));
const Photos           = lazy(() => import('./pages/Photos').then((m) => ({ default: m.Photos })));
const WorldInspo       = lazy(() => import('./pages/WorldInspo').then((m) => ({ default: m.WorldInspo })));
const SmallBusinesses  = lazy(() => import('./pages/SmallBusinesses').then((m) => ({ default: m.SmallBusinesses })));
const CustomVenues     = lazy(() => import('./pages/CustomVenues').then((m) => ({ default: m.CustomVenues })));
const Help              = lazy(() => import('./pages/Help'));
const HelpSyncing       = lazy(() => import('./pages/HelpSyncing'));
const HelpSyncingAdvanced = lazy(() => import('./pages/HelpSyncingAdvanced'));
const HolidayManager   = lazy(() => import('./components/HolidayManager/HolidayManager').then((m) => ({ default: m.HolidayManager })));
const DynastyManager   = lazy(() => import('./components/DynastyManager/DynastyManager').then((m) => ({ default: m.DynastyManager })));
const ModManager       = lazy(() => import('./components/ModManager/ModManager').then((m) => ({ default: m.ModManager })));
const SaveSettings     = lazy(() => import('./pages/SaveSettings').then((m) => ({ default: m.SaveSettings })));
const StyleGuide        = lazy(() => import('./pages/dev/StyleGuide'));
const Landing          = lazy(() => import('./pages/Landing'));
const ShowcasePage     = lazy(() => import('./pages/showcase/ShowcasePage'));
const ShowcaseOgFrame  = lazy(() => import('./pages/showcase/ShowcaseOgFrame'));
const AdminDashboard   = lazy(() => import('./pages/admin/AdminDashboard'));
import { useAuth } from './store/useAuth';
import { setUnauthorizedHandler } from './lib/api';
import { usePackOwnership } from './store/usePackOwnership';
import { useSaveFile } from './store/useSaveFile';
import { PlumbobLoader } from './components/common/PlumbobLoader';
import { DelayedFallback } from './components/common/DelayedFallback';
import { ToastHost } from './components/common/ToastHost';
import { useFirstStopAfterImport } from './hooks/useFirstStopAfterImport';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-c-base flex items-center justify-center"><PlumbobLoader size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Public marketing landing at `/`. Logged-in visitors skip it and go straight
// to their saves; anonymous visitors see the pitch + featured showcases.
function Root() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-c-base flex items-center justify-center"><PlumbobLoader size="lg" /></div>;
  if (user) return <Navigate to="/saves" replace />;
  return <Suspense fallback={<div className="min-h-screen bg-c-base flex items-center justify-center"><PlumbobLoader size="lg" /></div>}><Landing /></Suspense>;
}

function PlannerApp() {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loadSaveFile, saveFileId: loadedId } = useSaveFile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mainRef = useRef<HTMLElement>(null);

  // Reset scroll position when navigating between pages — phones especially get
  // stuck mid-page after switching worlds via the menu.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!saveFileId) return;
    if (loadedId === saveFileId) { setLoading(false); return; }
    setLoading(true);
    loadSaveFile(saveFileId)
      .then(() => setLoading(false))
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [saveFileId, loadedId, loadSaveFile]);

  if (loading) return <div className="min-h-screen bg-c-base flex items-center justify-center"><PlumbobLoader size="lg" label="Loading your save…" /></div>;
  if (error) return (
    <div className="min-h-screen bg-c-base flex flex-col items-center justify-center gap-3">
      <p className="text-c-red text-sm">{error}</p>
      <button onClick={() => navigate('/saves')} className="text-c-accent text-sm hover:underline">Back to saves</button>
    </div>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-c-base text-c-text font-sans">
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col ml-60 main-content overflow-hidden min-w-0">
        <TopBar onOpenMenu={() => setMobileMenuOpen(true)} />
        <MobileBanner />
        <main ref={mainRef} className="flex-1 overflow-auto">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><PlumbobLoader size="md" /></div>}>
          <Routes>
            <Route path="" element={<Dashboard />} />
            <Route path="world/:worldName" element={<WorldView />} />
            <Route path="world/:worldName/inspo" element={<WorldInspo />} />
            <Route path="households" element={<DesktopOnly title="households"><HouseholdWorkspace /></DesktopOnly>} />
            {/* Retired preview URL — redirect any lingering links to the real one. */}
            <Route path="households-next" element={<Navigate to="../households" replace />} />
            <Route path="sims" element={<DesktopOnly title="sim roster"><Sims /></DesktopOnly>} />
            <Route path="randomizer" element={<Randomizer />} />
            <Route path="diversity" element={<Diversity />} />
            <Route path="family" element={<DesktopOnly title="family tree"><Family /></DesktopOnly>} />
            <Route path="clubs" element={<DesktopOnly title="clubs"><ClubManager /></DesktopOnly>} />
            <Route path="small-businesses" element={<DesktopOnly title="small business"><SmallBusinesses /></DesktopOnly>} />
            <Route path="custom-venues" element={<DesktopOnly title="custom venue"><CustomVenues /></DesktopOnly>} />
            <Route path="pin-editor" element={<PinEditor />} />
            <Route path="photos" element={<Photos />} />
            <Route path="holidays" element={<DesktopOnly title="holiday"><HolidayManager /></DesktopOnly>} />
            <Route path="dynasties" element={<DesktopOnly title="dynasties"><DynastyManager /></DesktopOnly>} />
            <Route path="mods" element={<DesktopOnly title="mods & CC"><ModManager /></DesktopOnly>} />
            <Route path="settings" element={<SaveSettings />} />
            <Route path="settings/packs" element={<PackSettings />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const init = useAuth((s) => s.init);
  const userId = useAuth((s) => s.user?.id);

  useEffect(() => { init(); }, [init]);

  // Bridge api.ts 401s → auth store. On an expired session, clearing `user`
  // makes the guard below redirect to /login (registered once at startup).
  useEffect(() => {
    setUnauthorizedHandler(() => useAuth.getState().handleSessionExpired());
  }, []);

  // Pack ownership lives server-side per user. When the auth user changes
  // (login, logout, account swap), fetch their state from the server. The
  // hydrate action short-circuits if called twice for the same user.
  useEffect(() => {
    usePackOwnership.getState().hydrate(userId ?? null);
  }, [userId]);

  // Logs the first page opened after a .save import — App-level so it sees
  // routes that mount outside PlannerApp (the showcase editor) and survives
  // a detour through the picker.
  useFirstStopAfterImport();

  return (
    <ErrorBoundary>
      {/* One host for the whole app, inside the boundary so a toast can still
          report a failure that happens on any route. */}
      <ToastHost />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/help" element={<Suspense fallback={<DelayedFallback />}><Help /></Suspense>} />
        <Route path="/help/syncing" element={<Suspense fallback={<DelayedFallback />}><HelpSyncing /></Suspense>} />
        <Route path="/help/syncing/advanced" element={<Suspense fallback={<DelayedFallback />}><HelpSyncingAdvanced /></Suspense>} />
        <Route path="/dev/style" element={<Suspense fallback={<DelayedFallback />}><StyleGuide /></Suspense>} />
        {/* Owner-only, top-level (outside PlannerApp, so no /saves/:id prefix),
            and linked from nowhere — you type the URL. Non-admins see the same
            nothing an unknown path shows; the gate is server-side. */}
        <Route path="/admin" element={<Suspense fallback={<DelayedFallback />}><AdminDashboard /></Suspense>} />
        {/* The showcase — one public page per save. The owner's in-app entry
            (/saves/:id/showcase) is the SAME page addressed by save id, full
            bleed with no planner chrome; it needs no slug, so it works before
            the save first goes Live. */}
        <Route path="/s/:slug" element={<Suspense fallback={<DelayedFallback />}><ShowcasePage /></Suspense>} />
        {/* The cover alone at 1200×630 — the frame the server screenshots for
            the og:image. Nobody browses here; it is the social card's source. */}
        <Route path="/s/:slug/og" element={<Suspense fallback={<div />}><ShowcaseOgFrame /></Suspense>} />
        <Route path="/saves/:saveFileId/showcase" element={<RequireAuth><Suspense fallback={<DelayedFallback />}><ShowcasePage /></Suspense></RequireAuth>} />
        <Route path="/saves" element={<RequireAuth><SaveFilePicker /></RequireAuth>} />
        <Route path="/saves/:saveFileId/*" element={<RequireAuth><PlannerApp /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
