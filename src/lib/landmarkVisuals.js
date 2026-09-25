const PALETTES = [
  ['#1c2433', '#2c3d5c'],
  ['#1a2329', '#2b4250'],
  ['#1f1f2e', '#37375e'],
  ['#1a2620', '#2c4538'],
  ['#262129', '#423a4d'],
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function paletteFor(id) {
  return PALETTES[hashStr(id) % PALETTES.length];
}
