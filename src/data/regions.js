import { MIAMI_LANDMARKS } from './landmarks.miami';
import { MADRID_LANDMARKS } from './landmarks.madrid';
import { EL_ESCORIAL_LANDMARKS } from './landmarks.elescorial';
import { ARANJUEZ_LANDMARKS } from './landmarks.aranjuez';
import { MILAN_LANDMARKS } from './landmarks.milan';
import { PHILLY_LANDMARKS } from './landmarks.philly';
import { VILLANOVA_LANDMARKS } from './landmarks.villanova';

export const REGIONS = [
  {
    id: 'miami',
    name: 'Miami',
    tagline: 'Beaches, Art Deco & Cuban culture',
    city: 'Miami',
    state: 'Florida',
    country: 'USA',
    center: { lat: 25.7743, lng: -80.1937 },
    viewbox: { minLat: 25.3, minLng: -80.6, maxLat: 25.95, maxLng: -80.05 },
    landmarks: MIAMI_LANDMARKS,
  },
  {
    id: 'madrid',
    name: 'Madrid',
    tagline: 'Royal palaces, world-class art & tapas',
    city: 'Madrid',
    state: 'Community of Madrid',
    country: 'Spain',
    center: { lat: 40.4168, lng: -3.7038 },
    viewbox: { minLat: 40.3, minLng: -3.85, maxLat: 40.55, maxLng: -3.55 },
    landmarks: MADRID_LANDMARKS,
  },
  {
    id: 'el-escorial',
    name: 'El Escorial',
    tagline: 'Royal monastery, mountains & Castilian feasts',
    city: 'San Lorenzo de El Escorial',
    state: 'Community of Madrid',
    country: 'Spain',
    center: { lat: 40.589, lng: -4.148 },
    viewbox: { minLat: 40.56, minLng: -4.2, maxLat: 40.66, maxLng: -4.1 },
    landmarks: EL_ESCORIAL_LANDMARKS,
  },
  {
    id: 'aranjuez',
    name: 'Aranjuez',
    tagline: 'Royal palace, riverside gardens & strawberries',
    city: 'Aranjuez',
    state: 'Community of Madrid',
    country: 'Spain',
    center: { lat: 40.0349, lng: -3.6087 },
    viewbox: { minLat: 39.99, minLng: -3.70, maxLat: 40.09, maxLng: -3.53 },
    landmarks: ARANJUEZ_LANDMARKS,
  },
  {
    id: 'milan',
    name: 'Milan / Monza',
    tagline: 'Fashion, cathedrals & canals',
    city: 'Milan / Monza',
    state: 'Lombardy',
    country: 'Italy',
    center: { lat: 45.4642, lng: 9.19 },
    viewbox: { minLat: 45.4, minLng: 9.0, maxLat: 45.65, maxLng: 9.35 },
    landmarks: MILAN_LANDMARKS,
  },
  {
    id: 'philly',
    name: 'Philadelphia',
    tagline: 'Colonial history, Main Line towns & cheesesteaks',
    city: 'Philadelphia',
    state: 'Pennsylvania',
    country: 'USA',
    center: { lat: 40.02, lng: -75.3 },
    viewbox: { minLat: 39.9, minLng: -75.55, maxLat: 40.15, maxLng: -75.05 },
    landmarks: PHILLY_LANDMARKS,
  },
  {
    id: 'villanova',
    name: 'Villanova University',
    tagline: 'Campus icons and Augustinian history',
    city: 'Villanova',
    state: 'Pennsylvania',
    country: 'USA',
    center: { lat: 40.037, lng: -75.342 },
    viewbox: { minLat: 40.025, minLng: -75.355, maxLat: 40.048, maxLng: -75.33 },
    landmarks: VILLANOVA_LANDMARKS,
  },
];

export function getRegion(id) {
  return REGIONS.find((r) => r.id === id) || null;
}

export const ALL_LANDMARKS = REGIONS.flatMap((r) => r.landmarks.map((l) => ({ ...l, regionId: r.id })));

export const ALL_LANDMARKS_BOUNDS = ALL_LANDMARKS.reduce(
  (b, l) => [
    [Math.min(b[0][0], l.lat), Math.min(b[0][1], l.lng)],
    [Math.max(b[1][0], l.lat), Math.max(b[1][1], l.lng)],
  ],
  [
    [ALL_LANDMARKS[0].lat, ALL_LANDMARKS[0].lng],
    [ALL_LANDMARKS[0].lat, ALL_LANDMARKS[0].lng],
  ]
);

export function getLandmark(regionId, landmarkId) {
  const region = getRegion(regionId);
  return region?.landmarks.find((l) => l.id === landmarkId) || null;
}

export const INTERESTS = [
  { id: 'history-culture', label: 'History & Culture', icon: '\u{1F3DB}\u{FE0F}' },
  { id: 'art-museums', label: 'Art & Museums', icon: '\u{1F5BC}\u{FE0F}' },
  { id: 'food-local-life', label: 'Food & Local Life', icon: '\u{1F962}' },
];
