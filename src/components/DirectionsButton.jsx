import { useState } from 'react';
import { createPortal } from 'react-dom';
import { appleMapsLink, googleMapsLink } from '../lib/routing';

// "Directions" that asks where to get them: right here in the app (when the
// screen passes onInApp), Apple Maps, or Google Maps. Same button styling as
// before via className; the chooser is a small sheet.
export default function DirectionsButton({ name, lat, lng, className = 'btn btn-ghost btn-sm', style, children, onInApp }) {
  const [open, setOpen] = useState(false);
  const close = (e) => {
    e?.stopPropagation?.();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children ?? `${'\u{1F9ED}'} Directions`}
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={close}>
            <div className="modal-card directions-sheet" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>{'\u{1F9ED}'} Directions to {name}</h3>
              {onInApp && (
                <button
                  type="button"
                  className="btn btn-primary btn-block directions-choice"
                  onClick={(e) => {
                    close(e);
                    onInApp();
                  }}
                >
                  {'\u{1F9ED}'} Directions Here
                </button>
              )}
              <a className="btn btn-primary btn-block directions-choice" href={appleMapsLink(name, lat, lng)} target="_blank" rel="noreferrer" onClick={close}>
                {'\u{F8FF}'} Apple Maps
              </a>
              <a className="btn btn-primary btn-block directions-choice" href={googleMapsLink(name, lat, lng)} target="_blank" rel="noreferrer" onClick={close}>
                {'\u{1F5FA}\u{FE0F}'} Google Maps
              </a>
              <button type="button" className="btn btn-ghost btn-block" onClick={close}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
