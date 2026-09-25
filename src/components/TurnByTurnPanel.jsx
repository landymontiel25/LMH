import { useUnits, formatDistance } from '../lib/UnitsContext';
import DirectionsButton from './DirectionsButton';

const minutes = (sec) => Math.max(1, Math.round(sec / 60));

function formatDuration(sec) {
  const m = minutes(sec);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} hr${m % 60 ? ` ${m % 60} min` : ''}`;
}

// In-app turn-by-turn for one itinerary stop (data from api/directions.js):
// total distance and ETA, how much live traffic is adding when driving, and
// every step. Apple/Google Maps stay one tap away as a fallback.
export default function TurnByTurnPanel({ stop, loading, error, data, onRefresh, onClose }) {
  const { units } = useUnits();
  const trafficMin =
    data?.mode === 'DRIVE' && data.staticDurationSeconds
      ? minutes(data.durationSeconds) - minutes(data.staticDurationSeconds)
      : 0;

  return (
    <div className="card turn-panel">
      <div className="turn-panel-head">
        <h3 style={{ margin: 0 }}>
          {'\u{1F9ED}'} To {stop.name}
        </h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {'\u{2715}'} Close
        </button>
      </div>

      {loading && <p className="screen-subtitle">Finding the best route…</p>}

      {error && !loading && (
        <div>
          <p className="tag tag-error" style={{ display: 'block' }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>
              Try Again
            </button>
            <DirectionsButton name={stop.name} lat={stop.lat} lng={stop.lng} className="btn btn-ghost btn-sm">
              Open in Maps App
            </DirectionsButton>
          </div>
        </div>
      )}

      {data && !loading && !error && (
        <>
          <div className="turn-panel-summary">
            <span className="turn-panel-eta">{formatDuration(data.durationSeconds)}</span>
            <span>
              {formatDistance(data.distanceMeters, units)} · {data.mode === 'WALK' ? '\u{1F6B6} Walking' : '\u{1F697} Driving'}
            </span>
            {data.mode === 'DRIVE' && (
              <span className={`tag ${trafficMin >= 5 ? 'tag-error' : ''}`}>
                {trafficMin > 0 ? `+${trafficMin} min from traffic` : 'Traffic is light'}
              </span>
            )}
          </div>

          <ol className="turn-steps">
            {data.steps
              .filter((s) => s.instruction)
              .map((s, i) => (
                <li key={i}>
                  <span>{s.instruction}</span>
                  {s.distanceMeters > 0 && <span className="turn-step-dist">{formatDistance(s.distanceMeters, units)}</span>}
                </li>
              ))}
            <li className="turn-step-arrive">
              <span>
                {'\u{1F3C1}'} Arrive at {stop.name}
              </span>
            </li>
          </ol>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>
              {'\u{1F504}'} Refresh from Here
            </button>
            <DirectionsButton name={stop.name} lat={stop.lat} lng={stop.lng} className="btn btn-ghost btn-sm">
              Open in Maps App
            </DirectionsButton>
          </div>
        </>
      )}
    </div>
  );
}
