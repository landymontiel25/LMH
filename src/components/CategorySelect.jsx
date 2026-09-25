import { useEffect, useRef, useState } from 'react';
import { INTERESTS } from '../data/regions';
import { matchesSearch } from '../lib/search';
import { CategoryIcon } from './icons';

// Type-to-search category picker for Add Landmark, the same control as the
// city picker (RegionSearch). One category per landmark. `value` is the
// selected category id (or '').
export default function CategorySelect({ value, onSelect, placeholder = 'Search for a category…' }) {
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

  const selected = INTERESTS.find((i) => i.id === value) || null;
  const q = query.trim().toLowerCase();
  const matches = q ? INTERESTS.filter((i) => matchesSearch(i.label, q)) : INTERESTS;

  return (
    <div className="autocomplete" ref={ref}>
      <input
        type="text"
        placeholder={placeholder}
        value={open ? query : selected ? selected.label : ''}
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
          {matches.map((i) => (
            <button
              type="button"
              key={i.id}
              className="autocomplete-item"
              onClick={() => {
                onSelect(i.id);
                setOpen(false);
              }}
            >
              <span className="autocomplete-primary">
                <CategoryIcon id={i.id} /> {i.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
