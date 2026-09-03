import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { CheckInProvider } from './lib/CheckInContext';
import { TripProvider } from './lib/TripContext';
import { GeoProvider } from './lib/GeoContext';
import { RatingsProvider } from './lib/RatingsContext';
import { FriendsProvider } from './lib/FriendsContext';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import CheckInReview from './components/CheckInReview';
import AskLandmarkWidget from './components/AskLandmarkWidget';
import TripSetup from './screens/TripSetup';
import LandmarkSelection from './screens/LandmarkSelection';
import MapExplore from './screens/MapExplore';
import LandmarkDetail from './screens/LandmarkDetail';
import Itinerary from './screens/Itinerary';
import Profile from './screens/Profile';

export default function App() {
  return (
    <AuthProvider>
      <FriendsProvider>
      <CheckInProvider>
      <TripProvider>
        <GeoProvider>
          <RatingsProvider>
          <HashRouter>
          <Header />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<MapExplore />} />
              <Route path="/setup" element={<TripSetup />} />
              <Route path="/landmarks" element={<LandmarkSelection />} />
              <Route path="/landmarks/:region/:id" element={<LandmarkDetail />} />
              <Route path="/itinerary" element={<Itinerary />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/leaderboard" element={<Profile />} />
              <Route path="/account" element={<Profile />} />
            </Routes>
          </main>
          <BottomNav />
          <CheckInReview />
          <AskLandmarkWidget />
          </HashRouter>
          </RatingsProvider>
        </GeoProvider>
      </TripProvider>
      </CheckInProvider>
      </FriendsProvider>
    </AuthProvider>
  );
}
