import { useEffect, useState } from 'react';
import { TIERS, ASPECTS, MAX_CHIPS, MAX_ASPECTS, chipsFor, aspectLabel } from '../lib/ratingFlow';

// The three-step rating: tier -> chips -> ranked aspects. Shared by the
// check-in popup and the landmark page's "Rate your visit" card so both
// entry points produce the identical review shape.
//
// Reports upward via onChange as { tier, highlights, lovedOrder,
// dislikedOrder } (or null before a tier is picked). Everything past the
// tier is optional -- a tier alone is a complete, saveable rating, so the
// fastest path stays one tap.
//
// Ranking is tap-to-rank, not drag: the first aspect you tap is #1, the next
// #2, and so on, with the number shown on the button; tapping a ranked one
// removes it and the rest close up. Same ordered list as a drag handle would
// give, without a drag gesture that's fiddly on a phone inside a modal.
export default function RatingFlow({ landmark, onChange, initial = null }) {
  const [tier, setTier] = useState(initial?.tier || null);
  const [highlights, setHighlights] = useState(initial?.highlights || []);
  const [lovedOrder, setLovedOrder] = useState(initial?.lovedOrder || []);
  const [dislikedOrder, setDislikedOrder] = useState(initial?.dislikedOrder || []);

  useEffect(() => {
    onChange?.(tier ? { tier, highlights, lovedOrder, dislikedOrder } : null);
    // onChange identity changes every parent render; the payload is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, highlights, lovedOrder, dislikedOrder]);

  const pickTier = (id) => {
    if (id === tier) return;
    setTier(id);
    // Chips are tier-specific, and a "probably skip" has no loved aspects
    // (and vice versa) -- start those over rather than carry stale picks.
    setHighlights([]);
    setLovedOrder([]);
    setDislikedOrder([]);
  };

  const toggleChip = (id) =>
    setHighlights((cur) =>
      cur.includes(id) ? cur.filter((c) => c !== id) : cur.length < MAX_CHIPS ? [...cur, id] : cur
    );

  const toggleRank = (setList, list, id) => {
    if (list.includes(id)) setList(list.filter((a) => a !== id));
    else if (list.length < MAX_ASPECTS) setList([...list, id]);
  };

  const chips = tier ? chipsFor(landmark, tier) : [];
  const showLoved = tier === 'highly-recommend' || tier === 'worth-trying';
  const showDisliked = tier === 'probably-skip' || tier === 'worth-trying';

  const rankList = ({ title, list, setList, excluded }) => (
    <div style={{ marginTop: 14 }}>
      <p className="rating-flow-label">
        {title} <span>tap in order, up to {MAX_ASPECTS}</span>
      </p>
      <div className="chip-grid">
        {ASPECTS.map((a) => {
          const rank = list.indexOf(a.id);
          const taken = excluded.includes(a.id);
          const full = rank < 0 && list.length >= MAX_ASPECTS;
          return (
            <button
              key={a.id}
              type="button"
              className={`chip rating-aspect ${rank >= 0 ? 'selected' : ''} ${taken || full ? 'disabled' : ''}`}
              disabled={taken || full}
              onClick={() => toggleRank(setList, list, a.id)}
            >
              <span className="rating-aspect-rank">{rank >= 0 ? rank + 1 : ''}</span>
              <span>{aspectLabel(a.id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rating-flow">
      <div className="rating-tier-grid">
        {TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip rating-tier ${tier === t.id ? 'selected' : ''}`}
            onClick={() => pickTier(t.id)}
          >
            <span className="chip-icon">{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tier && chips.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="rating-flow-label">
            What stood out? <span>pick up to {MAX_CHIPS}</span>
          </p>
          <div className="rating-chip-row">
            {chips.map((c) => {
              const on = highlights.includes(c.id);
              const full = !on && highlights.length >= MAX_CHIPS;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`tag rating-chip ${on ? 'selected' : ''} ${full ? 'disabled' : ''}`}
                  disabled={full}
                  onClick={() => toggleChip(c.id)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showLoved &&
        rankList({
          title: 'What made it great?',
          list: lovedOrder,
          setList: setLovedOrder,
          excluded: dislikedOrder,
        })}
      {showDisliked &&
        rankList({
          title: 'What let it down?',
          list: dislikedOrder,
          setList: setDislikedOrder,
          excluded: lovedOrder,
        })}
    </div>
  );
}
