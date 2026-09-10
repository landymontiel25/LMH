import { useEffect, useRef, useState } from 'react';

export const OTHER_INTERESTS = [
  'Nightlife',
  'Shopping',
  'Architecture',
  'Nature & Parks',
  'Live Music',
  'Photography Spots',
  'Local Markets',
  'Sports & Recreation',
  'Wellness & Spas',
  'Family-Friendly',
];

export default function OtherInterestChip({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = value.trim()
    ? OTHER_INTERESTS.filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()))
    : OTHER_INTERESTS;

  if (!editing) {
    return (
      <button
        type="button"
        className={`chip ${value ? 'selected' : 'chip-dashed'}`}
        onClick={() => {
          setEditing(true);
          setOpen(true);
        }}
      >
        <span className="chip-icon">{value ? '\u{2728}' : '\u{2795}'}</span>
        <span>{value || 'Add Your Own'}</span>
      </button>
    );
  }

  return (
    <div className="autocomplete" ref={ref}>
      <input
        type="text"
        autoFocus
        className="autocomplete-chip-input"
        placeholder="Type your own…"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setEditing(false);
            setOpen(false);
          }
        }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="autocomplete-list">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              className="autocomplete-item"
              onClick={() => {
                onChange(s);
                setEditing(false);
                setOpen(false);
              }}
            >
              <span className="autocomplete-primary">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
