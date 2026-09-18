import { useEffect, useState } from 'react';
import RatingStars from './RatingStars';

// A plain 1-5 star tap, offered as an alternative to RatingFlow's tier ->
// chips -> aspects flow on the landmark page -- some people just want to
// tap a star count. Reports upward via onChange as { stars, comment } (or
// null before a star is picked), the same "null until there's something
// saveable" contract RatingFlow uses, so LandmarkDetail can treat either as
// interchangeable "myRating".
export default function StarRatingFlow({ initial = null, onChange }) {
  const [stars, setStars] = useState(initial?.stars || 0);
  const [comment, setComment] = useState(initial?.comment || '');

  useEffect(() => {
    onChange?.(stars ? { stars, comment: comment.trim() } : null);
    // onChange identity changes every parent render; the payload is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stars, comment]);

  return (
    <div className="rating-flow">
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RatingStars value={stars} interactive onChange={setStars} size="1.8rem" />
      </div>

      {stars > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className="rating-flow-label">
            Anything else? <span>optional</span>
          </p>
          <textarea
            className="rating-comment"
            rows={2}
            maxLength={280}
            placeholder="What you liked or didn't — Mapr uses this to learn your taste"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
