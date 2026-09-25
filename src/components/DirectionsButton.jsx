import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { appleMapsLink, googleMapsLink } from '../lib/routing';

// Every "Get Directions" in the app opens this sheet: use the app's own map
// (turn-by-turn from api/directions.js), Google Maps, or Apple Maps. "Use the
// Map" jumps to the Map tab with the route drawn (MapExplore reads
// location.state.directionsTo), unless the screen has its own map and passes
// onInApp (Itinerary). `external` hides it, for the fallback buttons inside
// the directions panel itself.
export default function DirectionsButton({
  name,
  lat,
  lng,
  className = 'btn btn-ghost btn-sm',
  style,
  children,
  onInApp,
  external = false,
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const close = (e) => {
    e?.stopPropagation?.();
    setOpen(false);
  };
  const openOnMap = (e) => {
    close(e);
    if (onInApp) onInApp();
    else navigate('/', { state: { directionsTo: { name, lat, lng } } });
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
              {!external && lat != null && lng != null && (
                <button type="button" className="btn btn-primary btn-block directions-choice" onClick={openOnMap}>
                  {'\u{1F5FA}\u{FE0F}'} Use the Map
                </button>
              )}
              <a className="btn btn-primary btn-block directions-choice" href={googleMapsLink(name, lat, lng)} target="_blank" rel="noreferrer" onClick={close}>
                {'\u{1F310}'} Use Google Maps
              </a>
              <a className="btn btn-primary btn-block directions-choice" href={appleMapsLink(name, lat, lng)} target="_blank" rel="noreferrer" onClick={close}>
                {'\u{1F34E}'} Use Apple Maps
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
