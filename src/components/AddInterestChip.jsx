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

// Capitalizes the first letter of each word (leaves the rest of each word
// untouched, so e.g. "NBA" or "eSports" survives intact) -- a lowercase
// submission like "racing" is stored as "Racing".
function capitalizeWords(value) {
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

// Adds as many custom interests as you type -- each commit (Enter, Tab,
// picking a suggestion, or clicking away) saves it immediately as its own
// entry and reopens the input for the next one, instead of holding one
// pending value and disappearing once it's set. Stays put after an add so
// there's always a way to add another.
export default function AddInterestChip({ existing, onAdd }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const commit = () => {
    const value = capitalizeWords(text.trim());
    if (value && !existing.includes(value)) onAdd(value);
    setText('');
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        commit();
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const suggestions = OTHER_INTERESTS.filter(
    (s) => !existing.includes(s) && (!text.trim() || s.toLowerCase().includes(text.trim().toLowerCase()))
  );

  if (!editing) {
    return (
      <button
        type="button"
        className="chip chip-dashed"
        onClick={() => {
          setEditing(true);
          setOpen(true);
        }}
      >
        <span className="chip-icon">{'\u{2795}'}</span>
        <span>Add Your Own</span>
      </button>
    );
  }

  return (
    <div className="autocomplete" ref={ref}>
      <input
        type="text"
        autoFocus
        className="autocomplete-chip-input"
        placeholder="Type your own, Enter to add…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Tab defaults to jumping focus away and dropping whatever was
          // typed -- treat it the same as Enter so it saves first.
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            commit();
          }
        }}
        autoComplete="off"
        autoCapitalize="off"
      />
      {open && suggestions.length > 0 && (
        <div className="autocomplete-list">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              className="autocomplete-item"
              onClick={() => {
                onAdd(s);
                setText('');
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
