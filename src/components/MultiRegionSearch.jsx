import { useEffect, useRef, useState } from 'react';
import { PICKABLE_REGIONS } from '../data/regions';

// Same type-to-search box as RegionSearch, but for picking SEVERAL cities at
// once ("Philly or NYC this weekend") instead of one -- built as its own
// component rather than a mode on RegionSearch so that component's other
// callers (TripSetup, Profile's regional leaderboard, CategorySelect) stay
// exactly as they were. Selecting a city here toggles it and keeps the list
// open, since picking more than one is the whole point; selected cities show
// as removable chips below the search box.
export default function MultiRegionSearch({ selectedIds, onToggle, onClearAll, placeholder = 'Add a city…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const sortedRegions = [...PICKABLE_REGIONS].sort((a, b) => a.name.localeCompare(b.name));
  const matches = q
    ? sortedRegions.filter(
        (r) => r.name.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || r.country?.toLowerCase().includes(q)
      )
    : sortedRegions;
  const selected = sortedRegions.filter((r) => selectedIds.includes(r.id));

  return (
    <div ref={ref}>
      <div className="autocomplete">
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          autoComplete="off"
          autoCapitalize="off"
        />
        {open && matches.length > 0 && (
          <div className="autocomplete-list">
            {matches.map((r) => {
              const isSelected = selectedIds.includes(r.id);
              return (
                <button
                  type="button"
                  key={r.id}
                  className="autocomplete-item"
                  onClick={() => onToggle(r)}
                >
                  <span className="autocomplete-primary">
                    {isSelected ? `${'\u{2713}'} ` : ''}
                    {r.name}
                  </span>
                  {r.tagline && <span className="autocomplete-secondary">{r.tagline}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {selected.map((r) => (
            <button
              type="button"
              key={r.id}
              className="tag tag-active"
              style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
              onClick={() => onToggle(r)}
              title="Remove"
            >
              {r.name} {'\u{2715}'}
            </button>
          ))}
          <button
            type="button"
            className="tag"
            style={{ cursor: 'pointer', fontFamily: 'inherit', appearance: 'none' }}
            onClick={onClearAll}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
