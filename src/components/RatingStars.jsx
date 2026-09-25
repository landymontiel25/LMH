// Read-only star display for the crowd's average rating (avg + count) --
// individual ratings are the tier system (I loved it / It was okay / Not
// for me) now, not stars; this is only the aggregate community number.
export default function RatingStars({ value = 0, count = null, size = '1rem' }) {
  const stars = [1, 2, 3, 4, 5];
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
