import { useState } from 'react';
import { downloadRegionTiles, isRegionDownloaded } from '../lib/offlineMap';

export default function OfflineDownloadButton({ region }) {
  const [downloaded, setDownloaded] = useState(() => isRegionDownloaded(region.id));
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setDownloading(true);
    setError('');
    setProgress(0);
    try {
      await downloadRegionTiles(region, { onProgress: setProgress });
      setDownloaded(true);
    } catch {
      setError('Could not finish downloading — try again with a stronger connection.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card section">
      <h3 style={{ marginTop: 0 }}>{'\u{1F4E5}'} Offline Map</h3>
      <p className="screen-subtitle" style={{ marginTop: 0 }}>
        Cache {region.name}'s map tiles now so the map still works with no signal.
      </p>
      {downloaded && !downloading && (
        <p className="tag tag-free" style={{ display: 'inline-block', marginBottom: 8 }}>
          Downloaded for offline {'✓'}
        </p>
      )}
      {downloading && (
        <p className="screen-subtitle" style={{ margin: '0 0 8px' }}>
          Downloading… {Math.round(progress * 100)}%
        </p>
      )}
      {error && (
        <p className="tag tag-error" style={{ display: 'block', marginBottom: 8 }}>
          {error}
        </p>
      )}
      {!downloading && (
        <button type="button" className="btn btn-ghost btn-block" onClick={start}>
          {downloaded ? 'Re-download' : 'Download for Offline'}
        </button>
      )}
    </div>
  );
}
