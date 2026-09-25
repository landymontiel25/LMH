import {
  Armchair,
  BedDouble,
  Flag,
  GraduationCap,
  Heart,
  Landmark,
  Laptop,
  MapPin,
  Martini,
  Meh,
  Palette,
  Plane,
  ThumbsDown,
  Ticket,
  Trees,
  Trophy,
  UtensilsCrossed,
  Volleyball,
} from 'lucide-react';

// Vector stand-ins for the emoji the category and rating-tier data still
// carry (regions.js INTERESTS, ratingFlow.js TIERS, landmarkVisuals.js). The
// data is untouched; screens render these instead of the emoji.
const CATEGORY = {
  'history-culture': Landmark,
  'art-museums': Palette,
  food: UtensilsCrossed,
  'food-local-life': UtensilsCrossed,
  'local-life': Martini,
  'parks-nature': Trees,
  entertainment: Ticket,
  stadiums: Trophy,
  'formula-1': Flag,
  sports: Volleyball,
  airports: Plane,
  benches: Armchair,
  tech: Laptop,
  'campus-life': GraduationCap,
  dorms: BedDouble,
};

export function CategoryIcon({ id, ...props }) {
  const Icon = CATEGORY[id] || MapPin;
  return <Icon aria-hidden="true" {...props} />;
}

const TIER = {
  'highly-recommend': Heart,
  'worth-trying': Meh,
  'probably-skip': ThumbsDown,
};

export function TierIcon({ id, ...props }) {
  const Icon = TIER[id];
  return Icon ? <Icon aria-hidden="true" {...props} /> : null;
}
