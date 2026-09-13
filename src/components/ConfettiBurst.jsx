// A small burst of CSS-only confetti pieces flying outward and fading --
// used anywhere a badge/level celebration needs a "popping" moment around
// its icon. Purely decorative (aria-hidden) and absolutely positioned, so
// it must be dropped inside a `position: relative` wrapper the size of the
// icon it's bursting around.
export default function ConfettiBurst() {
  return (
    <span className="confetti-burst" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`confetti-piece confetti-piece-${i + 1}`} />
      ))}
    </span>
  );
}
