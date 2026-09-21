import { ALL_LANDMARKS } from '../data/regions';
import { getCustomLandmarks, getPendingLandmarks } from './customLandmarks';

// Loose enough to catch "Hillstone" vs "Hillstone Restaurant", strict enough
// not to flag two unrelated places that just share a common word.
function namesMatch(a, b) {
  const norm = (s) => s.trim().toLowerCase();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// Is there already a landmark by this name in this region -- the built-in
// catalog, or someone else's submission (approved or still pending, so two
// people can't separately queue up the same duplicate). Same-region rather
// than exact-distance: good enough to catch "I'm re-adding the Hillstone
// that's already here" without also flagging an unrelated same-named chain
// location in a different city.
export async function findPossibleDuplicate({ name, regionId }) {
  const trimmed = (name || '').trim();
  if (trimmed.length < 2 || !regionId) return null;

  const builtIn = ALL_LANDMARKS.find((l) => l.regionId === regionId && namesMatch(l.name, trimmed));
  if (builtIn) return { name: builtIn.name, region: builtIn.regionId, id: builtIn.id };

  const [approved, pending] = await Promise.all([
    getCustomLandmarks().catch(() => []),
    getPendingLandmarks().catch(() => []),
  ]);
  const existing = [...approved, ...pending].find((l) => l.region === regionId && namesMatch(l.name, trimmed));
  return existing ? { name: existing.name, region: existing.region, id: existing.id } : null;
}
