import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useRatings } from '../lib/RatingsContext';
import { getUserCheckins } from '../lib/leaderboard';
import { deleteMyReview } from '../lib/reviews';
import { getRegion } from '../data/regions';
import { TIERS, tierById, chipLabel } from '../lib/ratingFlow';
import { Star as StarIcon, Trash2 as Trash2Icon } from 'lucide-react';
import { TierIcon } from '../components/icons';

// Everything rated through "Rate a Landmark" on Mapr Picks -- separate from
// the check-ins list, since these are ratings-only claims (0 points, never
// a "you checked in here"), not visits. Opened from the "X/N today" counter
// on Mapr Picks. Split into the same three tiers RatingFlow itself uses,
// so a rating always lands in the bucket it was actually given.
const TABS = TIERS.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji }));

export default function MyMaprRatings() {
  const navigate = useNavigate();
  const { user, firebaseEnabled } = useAuth();
  const { myReviews, reload: reloadRatings } = useRatings();
  const [ratingOnlyIds, setRatingOnlyIds] = useState(null); // null = still loading
  const [tab, setTab] = useState(TABS[0].id);
  const [removingId, setRemovingId] = useState(null);

  const removeRating = async (r) => {
    setRemovingId(r.landmarkId);
    try {
      await deleteMyReview(user.uid, r.landmarkId);
      await reloadRatings();
    } finally {
      setRemovingId(null);
    }
  };

  useEffect(() => {
    if (!firebaseEnabled || !user) {
      setRatingOnlyIds(new Set());
      return;
    }
    let cancelled = false;
    getUserCheckins(user.uid)
      .then((rows) => {
        if (cancelled) return;
        // A ratingOnly claim is an explicit "Rate a Landmark" click, never a
        // real visit -- legacy rows without the field fall back to the old
        // points === 0 heuristic (payout-0 real visits didn't exist yet then).
        setRatingOnlyIds(
          new Set(
            rows
              .filter((c) => (typeof c.ratingOnly === 'boolean' ? c.ratingOnly : c.points === 0))
              .map((c) => c.landmarkId)
          )
        );
      })
      .catch(() => {
        if (!cancelled) setRatingOnlyIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [user, firebaseEnabled]);

  if (!firebaseEnabled || !user) {
    return (
      <div>
        <p className="screen-subtitle">Sign in on Profile to see your Mapr Picks ratings.</p>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/profile')}>
          {'←'} Back to Profile
        </button>
      </div>
    );
  }

  const loading = ratingOnlyIds === null;
  const rated = loading ? [] : Object.values(myReviews).filter((r) => ratingOnlyIds.has(r.landmarkId) && r.ratingTier);
  const byTier = { 'highly-recommend': [], 'worth-trying': [], 'probably-skip': [] };
  for (const r of rated) {
    if (byTier[r.ratingTier]) byTier[r.ratingTier].push(r);
  }
  const shown = byTier[tab] || [];

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 16 }} onClick={() => navigate(-1)}>
        {'← Back'}
      </button>

      <h1 className="screen-title">
        <span><StarIcon aria-hidden="true" /></span> My Mapr Ratings
      </h1>
      <p className="screen-subtitle">
        Everything you've rated through Mapr Picks — not places you've checked into, just rated directly.
      </p>

      <div className="tabs" style={{ justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <TierIcon id={t.id} /> {t.label} ({byTier[t.id]?.length ?? 0})
          </button>
        ))}
      </div>

      {loading && <p className="screen-subtitle">Loading…</p>}

      {!loading && shown.length === 0 && (
        <div className="empty-state">
          <p>Nothing rated {tierById(tab)?.label} yet.</p>
        </div>
      )}

      {shown.map((r) => (
        <div
          key={r.landmarkId}
          className="checkin-row"
          onClick={() => navigate(`/landmarks/${r.region}/${r.landmarkId}`)}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="checkin-name">{r.landmarkName}</div>
            <div className="checkin-sub">{getRegion(r.region)?.name || r.region}</div>
            {r.highlights?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {r.highlights.map((h) => (
                  <span key={h} className="tag" style={{ fontSize: '0.68rem' }}>
                    {chipLabel(h)}
                  </span>
                ))}
              </div>
            )}
            {r.comment && (
              <p className="checkin-sub" style={{ marginTop: 6, whiteSpace: 'normal' }}>
                “{r.comment}”
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0 }}
            disabled={removingId === r.landmarkId}
            onClick={(e) => {
              e.stopPropagation();
              removeRating(r);
            }}
          >
            {removingId === r.landmarkId ? '…' : <><Trash2Icon aria-hidden="true" /> Remove</>}
          </button>
        </div>
      ))}
    </div>
  );
}
