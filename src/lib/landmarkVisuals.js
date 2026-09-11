const PALETTES = [
  ['#8a6a3f', '#d9b876'],
  ['#5f6b4a', '#a9b183'],
  ['#6b4a42', '#c98f6e'],
  ['#3f5a63', '#8fb0b8'],
  ['#7a5240', '#cf9f6a'],
];

const CATEGORY_ICON = {
  'history-culture': '\u{1F3DB}\u{FE0F}',
  'art-museums': '\u{1F5BC}\u{FE0F}',
  'food-local-life': '\u{1F962}',
  'campus-life': '\u{1F3EB}',
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function paletteFor(id) {
  return PALETTES[hashStr(id) % PALETTES.length];
}

export function iconFor(categories) {
  return CATEGORY_ICON[categories?.[0]] || '\u{1F4CD}';
}
