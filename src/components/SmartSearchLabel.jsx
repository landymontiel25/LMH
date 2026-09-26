// Heading over AI-understood results in any search box (see smartSearch.js).
export default function SmartSearchLabel({ loading, count, className = 'smart-search-label' }) {
  if (loading) return <div className={`${className} loading`}>{'\u{2728}'} Figuring out what you mean…</div>;
  if (!count) return null;
  return <div className={className}>{'\u{2728}'} Mapr thinks you mean</div>;
}
