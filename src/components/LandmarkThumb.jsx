import { paletteFor, iconFor } from '../lib/landmarkVisuals';

// Compact, non-swipeable thumbnail for dense contexts (list rows, itinerary
// stops, map popups) where the decorative postcard frame doesn't fit.
//
// myPhoto: the signed-in viewer's own check-in photo for this landmark, if
// any -- shown instead of the landmark's default photo, just for them.
export default function LandmarkThumb({ landmark, size = 52, width, height, myPhoto }) {
  const image = myPhoto || landmark.images?.[0];
  const w = width ?? size;
  const h = height ?? size;
  const style = { width: w, height: h };

  if (image) {
    return <img src={image} alt={landmark.name} className="landmark-thumb" style={style} loading="lazy" />;
  }

  const palette = paletteFor(landmark.id);
  return (
    <div
      className="landmark-thumb landmark-thumb-fallback"
      style={{ ...style, background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
    >
      <span style={{ fontSize: Math.min(w, h) * 0.4 }}>{iconFor(landmark.categories)}</span>
    </div>
  );
}
