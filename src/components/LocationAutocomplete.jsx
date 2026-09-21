import { useEffect, useRef, useState } from 'react';
import { ALL_LANDMARKS, getRegion } from '../data/regions';
import { searchLocations } from '../lib/geocode';

export default function LocationAutocomplete({ id, value, regionId, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSearchError('');
    const q = value.trim().toLowerCase();
    const handle = setTimeout(async () => {
      const localMatches = ALL_LANDMARKS.filter((l) => l.name.toLowerCase().includes(q))
        .sort((a, b) => (a.regionId === regionId ? -1 : 0) - (b.regionId === regionId ? -1 : 0))
        .slice(0, 4)
        .map((l) => ({
          key: `l-${l.id}`,
          primary: l.name,
          secondary: `${getRegion(l.regionId)?.name} landmark`,
          lat: l.lat,
          lng: l.lng,
        }));

      const region = regionId ? getRegion(regionId) : null;
      // A failed remote search (network error, Nominatim rate-limiting, a
      // non-2xx response) shouldn't look identical to "no matches" -- that
      // makes a real outage undiagnosable from a box that's just quietly
      // empty. Local landmark matches still show even if this fails.
      let remoteMatches = [];
      try {
        const remote = await searchLocations(value, region, 5);
        remoteMatches = remote
          .filter((r) => !localMatches.some((lm) => lm.primary.toLowerCase() === r.primary.toLowerCase()))
          .slice(0, 5)
          .map((r, i) => ({ key: `r-${i}-${r.lat}`, ...r }));
      } catch (e) {
        setSearchError(e.message || 'Address search failed.');
      }

      setSuggestions([...localMatches, ...remoteMatches].slice(0, 7));
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [value, regionId]);

  return (
    <div className="autocomplete" ref={boxRef}>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Typing a full address and pressing Enter (or tabbing/clicking
          // away) is how most people expect this to work -- clicking a
          // dropdown item was previously the only way the pin ever moved.
          if (e.key === 'Enter' && suggestions.length > 0) {
            e.preventDefault();
            onSelect(suggestions[0]);
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (suggestions.length > 0) onSelect(suggestions[0]);
        }}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0 || searchError) && (
        <div className="autocomplete-list">
          {loading && <div className="autocomplete-loading">Searching…</div>}
          {!loading && searchError && suggestions.length === 0 && (
            <div className="autocomplete-loading">{searchError}</div>
          )}
          {!loading &&
            suggestions.map((s) => (
              <button
                type="button"
                key={s.key}
                className="autocomplete-item"
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
              >
                <span className="autocomplete-primary">{s.primary}</span>
                {s.secondary && <span className="autocomplete-secondary">{s.secondary}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
