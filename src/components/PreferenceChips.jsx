import { useState } from 'react';
import { useTrip } from '../lib/TripContext';
import { INTERESTS } from '../data/regions';
import { classifyInterest } from '../lib/interestClassifier';
import AddInterestChip from './AddInterestChip';
import { Hourglass as HourglassIcon, Sparkles as SparklesIcon, Trash2 as Trash2Icon } from 'lucide-react';
import { CategoryIcon } from './icons';

// The actual chip-grid for saved preferences -- shared by Settings' "My
// Preferences" card, Trip Setup, and the one-time onboarding step right
// after signup, so all three stay in sync with the same trip.saved* fields.
export default function PreferenceChips() {
  const {
    trip,
    toggleSavedInterest,
    addSavedCustomInterest,
    removeSavedCustomInterest,
    toggleSavedCustomInterestSelected,
    setCustomInterestMatches,
    setCustomInterestEmoji,
  } = useTrip();
  const [classifying, setClassifying] = useState(() => new Set());

  const addCustom = (text) => {
    addSavedCustomInterest(text);
    setClassifying((cur) => new Set(cur).add(text));
    classifyInterest(text).then(({ matches, emoji }) => {
      setCustomInterestMatches(text, matches);
      setCustomInterestEmoji(text, emoji);
      setClassifying((cur) => {
        const next = new Set(cur);
        next.delete(text);
        return next;
      });
    });
  };

  return (
    <div className="chip-grid">
      {INTERESTS.map((i) => (
        <button
          key={i.id}
          type="button"
          className={`chip ${trip.savedInterests.includes(i.id) ? 'selected' : ''}`}
          onClick={() => toggleSavedInterest(i.id)}
        >
          <span className="chip-icon">
            <CategoryIcon id={i.id} />
          </span>
          <span>{i.label}</span>
        </button>
      ))}
      {trip.savedCustomInterests.map((text) => {
        const isSelected = !trip.deselectedCustomInterests.includes(text);
        return (
          <div
            key={text}
            role="button"
            tabIndex={0}
            className={`chip ${isSelected ? 'selected' : ''}`}
            title={classifying.has(text) ? 'Finding matching landmarks…' : isSelected ? 'Tap to turn off' : 'Tap to turn on'}
            onClick={() => toggleSavedCustomInterestSelected(text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSavedCustomInterestSelected(text);
              }
            }}
          >
            <span className="chip-icon">
              {classifying.has(text) ? <HourglassIcon aria-hidden="true" /> : trip.customInterestEmoji[text] || <SparklesIcon aria-hidden="true" />}
            </span>
            <span>{text}</span>
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${text}`}
              onClick={(e) => {
                e.stopPropagation();
                removeSavedCustomInterest(text);
              }}
            >
              <Trash2Icon aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <AddInterestChip existing={trip.savedCustomInterests} onAdd={addCustom} />
    </div>
  );
}
