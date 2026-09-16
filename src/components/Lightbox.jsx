// Full-screen photo viewer: tap anywhere to close. Used by the landmark
// page (postcard photos) and the Landmarks tab (row thumbnails).
export default function Lightbox({ src, alt = 'Photo', onClose }) {
  if (!src) return null;
  return (
    <div className="lightbox" onClick={onClose} role="presentation">
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
        {'\u{2715}'}
      </button>
    </div>
  );
}
