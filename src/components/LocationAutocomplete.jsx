import { useEffect, useRef, useState } from 'react';
import { ALL_LANDMARKS, getRegion } from '../data/regions';
import { searchPlaces, getPlaceDetails, makeSessionToken } from '../lib/places';
import { matchesSearch } from '../lib/search';

export default function LocationAutocomplete({ id, value, regionId, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const boxRef = useRef(null);
  // One id per Autocomplete+Details "session" (Google's billing unit) --
  // reused across keystrokes, then replaced once a suggestion is resolved.
  const sessionTokenRef = useRef(makeSessionToken());

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
    const q = value.trim();
    const handle = setTimeout(async () => {
      const localMatches = ALL_LANDMARKS.filter((l) => matchesSearch([l.name, getRegion(l.regionId)?.name].join(' '), q))
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
      // A failed remote search (network error, Places API quota, a non-2xx
      // response) shouldn't look identical to "no matches" -- that makes a
      // real outage undiagnosable from a box that's just quietly empty.
      // Local landmark matches still show even if this fails. These
      // suggestions don't carry lat/lng yet -- resolveSuggestion() looks
      // that up via Place Details only once one is actually picked.
      let remoteMatches = [];
      try {
        const remote = await searchPlaces(value, region, sessionTokenRef.current);
        remoteMatches = remote
          .filter((r) => !localMatches.some((lm) => lm.primary.toLowerCase() === r.primary.toLowerCase()))
          .slice(0, 5)
          .map((r) => ({ key: `r-${r.placeId}`, ...r }));
      } catch (e) {
        setSearchError(e.message || 'Address search failed.');
      }

      setSuggestions([...localMatches, ...remoteMatches].slice(0, 7));
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [value, regionId]);

  // Local landmark matches already carry lat/lng; a Places suggestion only
  // has a placeId until now -- this is the one Place Details round trip per
  // pick, right when the user actually commits to a suggestion.
  const resolveSuggestion = async (s) => {
    if (!s.placeId) {
      onSelect(s);
      setOpen(false);
      return;
    }
    try {
      const details = await getPlaceDetails(s.placeId, sessionTokenRef.current);
      sessionTokenRef.current = makeSessionToken();
      onSelect({ primary: details.primary || s.primary, secondary: details.secondary || s.secondary, lat: details.lat, lng: details.lng });
      setOpen(false);
    } catch (e) {
      setSearchError(e.message || 'Could not look up that address.');
    }
  };

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
            resolveSuggestion(suggestions[0]);
          }
        }}
        onBlur={() => {
          if (suggestions.length > 0) resolveSuggestion(suggestions[0]);
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
                onClick={() => resolveSuggestion(s)}
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
