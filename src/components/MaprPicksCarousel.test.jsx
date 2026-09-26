// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ALL_LANDMARKS } from '../data/regions';

// Standing at Villanova, having visited everything there. The server
// (Firestore reads, /api/mapr-picks) never answers -- the row still has to
// fill right away from the on-device scorer.
const never = () => new Promise(() => {});
vi.mock('../lib/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../lib/FriendsContext', () => ({ useFriends: () => ({ myProfile: {}, profileFresh: false }) }));
vi.mock('../lib/GeoContext', () => ({ useGeo: () => ({ coords: { lat: 40.0356, lng: -75.3437 } }) }));
vi.mock('../lib/BadgesContext', () => ({ useBadges: () => ({ reload: () => {}, actionsToday: 0 }) }));
vi.mock('../lib/TripContext', () => ({ useTrip: () => ({ trip: { savedCustomInterests: [], customInterestMatches: {} } }) }));
vi.mock('../lib/pickFeedback', () => ({
  getPickFeedback: () => never(),
  readLocalFeedback: () => ({}),
  votedIds: () => [],
  setPickFeedback: () => {},
}));
vi.mock('../lib/leaderboard', () => ({ getGlobalCheckinCounts: () => never(), getRegionCheckinCounts: () => never() }));
vi.mock('../lib/friends', () => ({ recordShownPicks: () => never(), saveRebuiltTagScores: () => never(), saveSettledPicks: () => never() }));
vi.mock('../lib/apiAuth', () => ({ authHeaders: async () => ({}) }));
vi.mock('./RateLandmarkSearch', () => ({ default: () => null }));

import MaprPicksCarousel from './MaprPicksCarousel';

let container;
afterEach(() => {
  document.body.removeChild(container);
});

describe('Mapr Picks first paint', () => {
  it('fills the row immediately, from the nearest city with something new', async () => {
    vi.stubGlobal('fetch', () => never());
    const villanova = ALL_LANDMARKS.filter((l) => l.regionId === 'villanova').map((l) => l.id);
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter>
          <MaprPicksCarousel reviews={[]} checkedInIds={villanova} />
        </MemoryRouter>
      )
    );
    const names = [...container.querySelectorAll('.mapr-pick-name')].map((n) => n.textContent);
    expect(names.length).toBeGreaterThan(0);
    const picked = ALL_LANDMARKS.filter((l) => names.includes(l.name));
    expect(picked.every((l) => l.regionId !== 'villanova')).toBe(true);
    expect(container.textContent).not.toContain('Finding places');
    vi.unstubAllGlobals();
  });
});
