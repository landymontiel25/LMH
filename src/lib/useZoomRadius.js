import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lh-zoom-radius-miles';
const DEFAULT_RADIUS = 5;
export const ZOOM_RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50, 100];

function getInitialRadius() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return ZOOM_RADIUS_OPTIONS.includes(stored) ? stored : DEFAULT_RADIUS;
}

export function useZoomRadius() {
  const [radiusMiles, setRadiusMiles] = useState(getInitialRadius);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(radiusMiles));
  }, [radiusMiles]);

  return [radiusMiles, setRadiusMiles];
}
