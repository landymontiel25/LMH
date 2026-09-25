// Shared multi-word "smart enough" search matcher, used everywhere the app
// searches its own data (landmarks, regions/cities, interests) -- NOT
// LocationAutocomplete, which searches the live world via Nominatim and
// already does its own fuzzy matching server-side.
//
// A plain single-substring check (`haystack.includes(term)`) fails on a
// query like "Miami F1": no single field contains that exact phrase, even
// though the landmark ("Miami International Autodrome") obviously *is* the
// Miami F1 track once you look at its name, city and facts together. This
// instead requires every WORD in the query to appear somewhere in the
// haystack, in any order, scattered across whichever fields the caller
// joined into it -- an AND match per word rather than one exact phrase
// match, so a query that names several things about the result (a city + a
// nickname, a category + a landmark name, etc.) finds it without needing
// an AI round trip on every keystroke.
export function matchesSearch(haystack, query) {
  const words = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = (haystack || '').toLowerCase();
  return words.every((w) => hay.includes(w));
}
