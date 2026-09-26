// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getLandmark } from '../data/regions';

vi.mock('./landmarkOverrides', () => ({
  getLandmarkEdits: async () => ({ 'lake-como/the-10-10-bench': { name: 'Renamed Bench' } }),
}));

import { LandmarkEditsProvider, useLandmarkEdits } from './LandmarkEditsContext';

describe('applyEdit', () => {
  it('applies an admin edit to a raw catalog landmark (region, no regionId)', async () => {
    const raw = getLandmark('lake-como', 'the-10-10-bench');
    expect(raw.regionId).toBeUndefined();
    let shown;
    function Probe() {
      shown = useLandmarkEdits().applyEdit(raw).name;
      return null;
    }
    const el = document.createElement('div');
    await act(async () =>
      createRoot(el).render(
        <LandmarkEditsProvider>
          <Probe />
        </LandmarkEditsProvider>
      )
    );
    expect(shown).toBe('Renamed Bench');
  });
});
