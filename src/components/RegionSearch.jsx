import { useEffect, useRef, useState } from 'react';
import { PICKABLE_REGIONS } from '../data/regions';

export const ANY_REGION = { id: '', name: 'Any region', tagline: 'Search everywhere' };

// Type-to-search region picker (not a card list to tap through, not a plain
// <select> to scroll) -- matches the "type where you are" ask. `region` is
// the currently selected region object (or a placeholder with just a name).
export default function RegionSearch({ region, onSelect, includeAny = false, placeholder = 'Search for a region…' }) {
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
  const options = includeAny ? [ANY_REGION, ...PICKABLE_REGIONS] : PICKABLE_REGIONS;
  const matches = q
    ? options.filter((r) => r.name.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q) || r.country?.toLowerCase().includes(q))
    : options;

  return (
    <div className="autocomplete" ref={ref}>
      <input
        type="text"
        placeholder={placeholder}
        value={open ? query : region?.name || ''}
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
      />
      {open && matches.length > 0 && (
        <div className="autocomplete-list">
          {matches.map((r) => (
            <button
              type="button"
              key={r.id || 'any'}
              className="autocomplete-item"
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              <span className="autocomplete-primary">{r.name}</span>
              {r.tagline && <span className="autocomplete-secondary">{r.tagline}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
