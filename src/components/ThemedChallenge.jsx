import { useMemo } from 'react';
import { getFeaturedChallenge } from '../lib/challenges';
import { CircleCheck as CircleCheckIcon, Target as TargetIcon } from 'lucide-react';
import { CategoryIcon } from './icons';

// One themed collection (e.g. "Every Food & Local Life Spot"), rotating
// weekly per region -- see getFeaturedChallenge for how "featured" is picked.
export default function ThemedChallenge({ regionId, claimedMap, onAddAll }) {
  const featured = useMemo(() => getFeaturedChallenge(regionId), [regionId]);
  if (!featured) return null;

  const done = featured.landmarks.filter((l) => claimedMap[l.id]).length;
  const total = featured.landmarks.length;
  const complete = done === total;

  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}><TargetIcon aria-hidden="true" /> Themed Challenge</h3>
      <p className="screen-subtitle" style={{ marginTop: 0, marginBottom: 8 }}>
        <CategoryIcon id={featured.categoryId} /> {featured.label} — featured this week
      </p>
      <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
        {done} / {total} visited {complete ? <CircleCheckIcon aria-hidden="true" /> : ''}
      </p>
      {!complete && (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => onAddAll(featured.landmarks)}>
          Add all {total} to this trip
        </button>
      )}
    </div>
  );
}
