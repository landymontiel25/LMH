// Placeholder shapes that mirror the content about to load, so a screen
// shows its structure right away instead of a bare "Loading…" line.
// Purely visual: aria-hidden on the shapes, one polite status label per
// group for screen readers.

export function Skeleton({ width = '100%', height = 14, radius = 8, style, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, lastWidth = '60%' }) {
  return (
    <span className="skeleton-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? lastWidth : '100%'} height={12} />
      ))}
    </span>
  );
}

// One list row: square thumb + two lines (landmark rows, check-ins,
// notifications, friends).
export function SkeletonRow({ thumb = 48, round = false }) {
  return (
    <div className="skeleton-row" aria-hidden="true">
      <Skeleton width={thumb} height={thumb} radius={round ? thumb : 12} />
      <div className="skeleton-row-lines">
        <Skeleton width="62%" height={14} />
        <Skeleton width="38%" height={11} />
      </div>
    </div>
  );
}

// Leaderboard/ranking row: rank number, avatar, name, points.
export function SkeletonRankRow() {
  return (
    <div className="skeleton-row" aria-hidden="true">
      <Skeleton width={22} height={16} />
      <Skeleton width={34} height={34} radius={34} />
      <div className="skeleton-row-lines">
        <Skeleton width="50%" height={14} />
      </div>
      <Skeleton width={48} height={14} />
    </div>
  );
}

export function SkeletonCard({ lines = 3, media = false }) {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      {media && <Skeleton height={150} radius={14} style={{ marginBottom: 14 }} />}
      <Skeleton width="45%" height={18} style={{ marginBottom: 12 }} />
      <SkeletonText lines={lines} />
    </div>
  );
}

// Grid of photo tiles (check-in galleries).
export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={0} radius={12} className="skeleton-tile" />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5, variant = 'row', label = 'Loading' }) {
  const Row = variant === 'rank' ? SkeletonRankRow : SkeletonRow;
  return (
    <div className="skeleton-list" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      {Array.from({ length: count }, (_, i) => (
        <Row key={i} />
      ))}
    </div>
  );
}

// Generic screen shape: title, subtitle, a few cards. Used while a route's
// code chunk is still downloading.
export function ScreenSkeleton({ label = 'Loading' }) {
  return (
    <div className="skeleton-screen" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      <Skeleton width="55%" height={30} radius={10} style={{ marginBottom: 12 }} />
      <Skeleton width="80%" height={14} style={{ marginBottom: 28 }} />
      <SkeletonCard lines={2} media />
      <SkeletonCard lines={3} />
    </div>
  );
}

// A landmark's detail page: photo, title, tags, summary, facts.
export function LandmarkDetailSkeleton() {
  return (
    <div className="skeleton-screen" role="status" aria-live="polite">
      <span className="visually-hidden">Loading landmark…</span>
      <Skeleton width={84} height={36} radius={999} style={{ marginBottom: 18 }} />
      <Skeleton height={220} radius={16} style={{ marginBottom: 18 }} />
      <Skeleton width="60%" height={30} radius={10} style={{ margin: '0 auto 12px' }} />
      <div className="skeleton-chips">
        <Skeleton width={90} height={26} radius={999} />
        <Skeleton width={70} height={26} radius={999} />
        <Skeleton width={60} height={26} radius={999} />
      </div>
      <SkeletonCard lines={4} />
      <Skeleton width="35%" height={20} style={{ margin: '20px 0 12px' }} />
      <SkeletonText lines={4} />
    </div>
  );
}
