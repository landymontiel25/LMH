// Current vs Past itineraries. An itinerary is done -- and moves to Past on
// its own -- once you've checked into every catalog landmark on it. Places
// Mapr found on the web can't be checked into, so they don't count (an
// itinerary with only those never auto-moves). "Move to Past" / "Move back
// to Current" set an override that wins either way. Keys: a solo itinerary's
// region id, or `group:<tripId>` for a group trip.

export const groupKey = (tripId) => `group:${tripId}`;

export function isAllVisited(landmarkIds, claimedMap) {
  const ids = landmarkIds || [];
  return ids.length > 0 && ids.every((id) => !!claimedMap?.[id]);
}

export function itineraryPhase(key, landmarkIds, claimedMap, overrides) {
  const o = overrides?.[key];
  if (o === 'past' || o === 'current') return o;
  return isAllVisited(landmarkIds, claimedMap) ? 'past' : 'current';
}
