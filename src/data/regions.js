import { MIAMI_LANDMARKS } from './landmarks.miami.js';
import { MADRID_LANDMARKS } from './landmarks.madrid.js';
import { EL_ESCORIAL_LANDMARKS } from './landmarks.elescorial.js';
import { ARANJUEZ_LANDMARKS } from './landmarks.aranjuez.js';
import { MILAN_LANDMARKS } from './landmarks.milan.js';
import { LAKE_COMO_LANDMARKS } from './landmarks.lakecomo.js';
import { PHILLY_LANDMARKS } from './landmarks.philly.js';
import { VILLANOVA_LANDMARKS } from './landmarks.villanova.js';
import { FRANKFURT_LANDMARKS } from './landmarks.frankfurt.js';
import { NYC_LANDMARKS } from './landmarks.nyc.js';
import { CAPETOWN_LANDMARKS } from './landmarks.capetown.js';
import { KEYBISCAYNE_LANDMARKS } from './landmarks.keybiscayne.js';

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
    id: 'key-biscayne',
    name: 'Key Biscayne',
    tagline: 'Island beaches, a historic lighthouse & bay views',
    city: 'Key Biscayne',
    state: 'Florida',
    country: 'USA',
    center: { lat: 25.6908, lng: -80.1625 },
    viewbox: { minLat: 25.63, minLng: -80.21, maxLat: 25.8, maxLng: -80.12 },
    landmarks: KEYBISCAYNE_LANDMARKS,
  },
  {
    id: 'nyc',
    name: 'New York City',
    tagline: 'Icons, skyscrapers, museums & legendary eats',
    city: 'New York',
    state: 'New York',
    country: 'USA',
    center: { lat: 40.7549, lng: -73.984 },
    viewbox: { minLat: 40.49, minLng: -74.1, maxLat: 40.92, maxLng: -73.7 },
    landmarks: NYC_LANDMARKS,
  },
  {
    id: 'cape-town',
    name: 'Cape Town',
    tagline: 'Table Mountain, beaches, wine & Cape heritage',
    city: 'Cape Town',
    state: 'Western Cape',
    country: 'South Africa',
    center: { lat: -33.925, lng: 18.424 },
    viewbox: { minLat: -34.36, minLng: 18.3, maxLat: -33.8, maxLng: 18.58 },
    landmarks: CAPETOWN_LANDMARKS,
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
    id: 'lake-como',
    name: 'Lake Como',
    tagline: 'Historic villas, lakeside villages & mountain views',
    city: 'Lake Como',
    state: 'Lombardy',
    country: 'Italy',
    center: { lat: 45.93, lng: 9.15 },
    viewbox: { minLat: 45.78, minLng: 9.0, maxLat: 46.05, maxLng: 9.35 },
    landmarks: LAKE_COMO_LANDMARKS,
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
  {
    id: 'frankfurt',
    name: 'Frankfurt',
    tagline: 'Major European airport hub & gateway',
    city: 'Frankfurt',
    state: 'Hesse',
    country: 'Germany',
    center: { lat: 50.0379, lng: 8.5622 },
    viewbox: { minLat: 49.95, minLng: 8.45, maxLat: 50.12, maxLng: 8.72 },
    landmarks: FRANKFURT_LANDMARKS,
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
  { id: 'parks-nature', label: 'Parks & Nature', icon: '\u{1F333}' },
  { id: 'entertainment', label: 'Entertainment & Sports', icon: '\u{1F39F}\u{FE0F}' },
  { id: 'campus-life', label: 'Campus Life', icon: '\u{1F3EB}' },
  { id: 'dorms', label: 'Dorms', icon: '\u{1F6CF}\u{FE0F}' },
];
