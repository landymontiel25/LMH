import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { CheckInProvider } from './lib/CheckInContext';
import { TripProvider } from './lib/TripContext';
import { GeoProvider } from './lib/GeoContext';
import { RatingsProvider } from './lib/RatingsContext';
import { MyPhotosProvider } from './lib/MyPhotosContext';
import { FriendsProvider } from './lib/FriendsContext';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import ErrorBoundary from './components/ErrorBoundary';
import CheckInReview from './components/CheckInReview';
import AskLandmarkWidget from './components/AskLandmarkWidget';
import TripSetup from './screens/TripSetup';
import LandmarkSelection from './screens/LandmarkSelection';
import MapExplore from './screens/MapExplore';
import AddLandmark from './screens/AddLandmark';
import LandmarkDetail from './screens/LandmarkDetail';
import Itinerary from './screens/Itinerary';
import Profile from './screens/Profile';
import FullLeaderboard from './screens/FullLeaderboard';
import Legal from './screens/Legal';
import Test from './screens/Test';

// Keyed by path so a crash's fallback UI clears itself on the next
// navigation (React Router doesn't remount the boundary just because the
// matched route changed -- only re-keying it does).
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
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
        <Route path="/test" element={<Test />} />
      </Routes>
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
          <HashRouter>
          <Header />
          <main className="app-main">
            <AppRoutes />
          </main>
          <BottomNav />
          <CheckInReview />
          <AskLandmarkWidget />
          </HashRouter>
          </MyPhotosProvider>
          </RatingsProvider>
        </GeoProvider>
      </TripProvider>
      </CheckInProvider>
      </FriendsProvider>
    </AuthProvider>
  );
}
