// Star rating — read-only display (with average + count) or an interactive picker.
export default function RatingStars({ value = 0, count = null, interactive = false, onChange, size = '1rem' }) {
  const stars = [1, 2, 3, 4, 5];

  if (interactive) {
    return (
      <span className="rating-stars interactive" style={{ fontSize: size }}>
        {stars.map((s) => (
          <button
            key={s}
            type="button"
            className="star-btn"
            aria-label={`${s} star${s > 1 ? 's' : ''}`}
            onClick={() => onChange?.(s)}
          >
            {s <= value ? '★' : '☆'}
          </button>
        ))}
      </span>
    );
  }

  const rounded = Math.round(value);

  // count === null → just render one rating's stars (no average/count, no empty state).
  if (count === null) {
    return (
      <span className="rating-stars" style={{ fontSize: size }}>
        {stars.map((s) => (
          <span key={s} className="star">
            {s <= rounded ? '★' : '☆'}
          </span>
        ))}
      </span>
    );
  }

  if (!count) {
    return <span className="rating-stars empty" style={{ fontSize: size }}>☆ No ratings yet</span>;
  }
  return (
    <span className="rating-stars" style={{ fontSize: size }} title={`${value.toFixed(1)} from ${count} visitor${count === 1 ? '' : 's'}`}>
      {stars.map((s) => (
        <span key={s} className="star">
          {s <= rounded ? '★' : '☆'}
        </span>
      ))}
      <span className="rating-meta">
        {value.toFixed(1)} · {count}
      </span>
    </span>
  );
}
