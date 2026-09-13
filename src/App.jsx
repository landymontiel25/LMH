import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { CheckInProvider } from './lib/CheckInContext';
import { TripProvider } from './lib/TripContext';
import { GeoProvider } from './lib/GeoContext';
import { RatingsProvider } from './lib/RatingsContext';
import { MyPhotosProvider } from './lib/MyPhotosContext';
import { FriendsProvider } from './lib/FriendsContext';
import { UnitsProvider } from './lib/UnitsContext';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import CheckInReview from './components/CheckInReview';
import AskLandmarkWidget from './components/AskLandmarkWidget';

// Lazy so each screen (and, critically, Leaflet + its cluster plugin --
// only pulled in by MapExplore/AddLandmark) ships as its own chunk instead
// of all up front in one bundle, same as everything past the entry chunk
// that Vite would otherwise inline.
const TripSetup = lazy(() => import('./screens/TripSetup'));
const LandmarkSelection = lazy(() => import('./screens/LandmarkSelection'));
const MapExplore = lazy(() => import('./screens/MapExplore'));
const AddLandmark = lazy(() => import('./screens/AddLandmark'));
const LandmarkDetail = lazy(() => import('./screens/LandmarkDetail'));
const Itinerary = lazy(() => import('./screens/Itinerary'));
const Profile = lazy(() => import('./screens/Profile'));
const FullLeaderboard = lazy(() => import('./screens/FullLeaderboard'));
const Legal = lazy(() => import('./screens/Legal'));
const GroupTrip = lazy(() => import('./screens/GroupTrip'));
const Settings = lazy(() => import('./screens/Settings'));
const FullStats = lazy(() => import('./screens/FullStats'));
const Test = lazy(() => import('./screens/Test'));

// Keyed by path so a crash's fallback UI clears itself on the next
// navigation (React Router doesn't remount the boundary just because the
// matched route changed -- only re-keying it does).
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<div className="app-loading">{'\u{1F9ED}'}</div>}>
        <Routes>
          <Route path="/" element={<MapExplore />} />
          <Route path="/add-landmark" element={<AddLandmark />} />
          <Route path="/setup" element={<TripSetup />} />
          <Route path="/landmarks" element={<LandmarkSelection />} />
          <Route path="/landmarks/:region/:id" element={<LandmarkDetail />} />
          <Route path="/itinerary" element={<Itinerary />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/leaderboard" element={<Profile />} />
          <Route path="/leaderboard/full" element={<FullLeaderboard />} />
          <Route path="/account" element={<Profile />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/group/:tripId" element={<GroupTrip />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/stats" element={<FullStats />} />
          <Route path="/test" element={<Test />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FriendsProvider>
      <CheckInProvider>
      <TripProvider>
        <GeoProvider>
          <RatingsProvider>
          <MyPhotosProvider>
          <UnitsProvider>
          <HashRouter>
          <OfflineBanner />
          <Header />
          <main className="app-main">
            <AppRoutes />
          </main>
          <BottomNav />
          <CheckInReview />
          <AskLandmarkWidget />
          </HashRouter>
          </UnitsProvider>
          </MyPhotosProvider>
          </RatingsProvider>
        </GeoProvider>
      </TripProvider>
      </CheckInProvider>
      </FriendsProvider>
    </AuthProvider>
  );
}
