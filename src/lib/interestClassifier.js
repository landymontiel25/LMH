// Asks the AI which landmarks (across every city) fit a free-text custom
// interest, e.g. "nightlife" or "racing" -- topics that don't map to any of
// the app's four built-in categories. Returns "region/id" strings, or [] on
// any failure so a flaky/missing AI backend just falls back to no matches
// instead of breaking the picker.
export async function classifyInterest(interest) {
  try {
    const res = await fetch('/api/classify-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.matches) ? data.matches : [];
  } catch {
    return [];
  }
}
