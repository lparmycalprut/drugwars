// All game art is drawn in code (SVG) so every asset shares one style.
const P = {
  ink: '#0d1014', steel: '#2a323d', steel2: '#39424f', light: '#8fa3b8',
  neon: '#38e1b0', neon2: '#ffcf4d', red: '#e0533d', purple: '#8a6cf0', glass: '#5ad1ff',
};

const svg = (vb, inner, cls = '') =>
  `<svg class="${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;

// isometric helpers
const iso = (x, y, w = 1, h = 1) => {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    .map(([a, b]) => [(a - b) * 32, (a + b) * 16]);
  return pts.map((p) => p.join(',')).join(' ');
};
const box = (x, y, h, top, left, right) => `
  <polygon points="${(x) * 32},${(y) * 16 - h} ${(x + 1) * 32},${(y + 1) * 16 - h} ${x * 32},${(y + 2) * 16 - h} ${(x - 1) * 32},${(y + 1) * 16 - h}" fill="${top}"/>
  <polygon points="${(x - 1) * 32},${(y + 1) * 16 - h} ${x * 32},${(y + 2) * 16 - h} ${x * 32},${(y + 2) * 16} ${(x - 1) * 32},${(y + 1) * 16}" fill="${left}"/>
  <polygon points="${(x + 1) * 32},${(y + 1) * 16 - h} ${x * 32},${(y + 2) * 16 - h} ${x * 32},${(y + 2) * 16} ${(x + 1) * 32},${(y + 1) * 16}" fill="${right}"/>`;

const ground = `<polygon points="0,40 64,72 0,104 -64,72" fill="#1a2028" stroke="#2f3947"/>`;

export const BuildingArt = {
  safehouse: (l) => svg('-70 -30 140 140', `${ground}
    ${box(0, 0, 34 + l * 1.6, '#4a5769', '#333d4b', '#232a34')}
    <rect x="-16" y="34" width="10" height="12" fill="${P.neon2}" opacity=".8" transform="skewY(26)"/>
    <rect x="6" y="20" width="10" height="12" fill="${P.glass}" opacity=".7" transform="skewY(-26)"/>
    <polygon points="0,${6 - 34 - l * 1.6} 34,${23 - 34 - l * 1.6} 0,${40 - 34 - l * 1.6} -34,${23 - 34 - l * 1.6}" fill="#5b6a80"/>
    <rect x="-4" y="${-52 - l * 1.6}" width="3" height="18" fill="${P.light}"/>
    <circle cx="-2.5" cy="${-54 - l * 1.6}" r="3.5" fill="${P.red}"/>`, 'art'),
  lab: () => svg('-70 -30 140 140', `${ground}
    ${box(0, 0, 26, '#3b6b5c', '#2a4b41', '#1f3a32')}
    <circle cx="-18" cy="22" r="9" fill="${P.neon}" opacity=".85"/>
    <circle cx="16" cy="16" r="6" fill="${P.neon}" opacity=".5"/>
    <path d="M-6,-14 l0,12 -10,18 h32 l-10,-18 0,-12 z" fill="#9fe8d2" opacity=".9" stroke="#2a4b41"/>
    <path d="M-12,4 h28 l4,8 h-36 z" fill="${P.neon}" opacity=".8"/>`, 'art'),
  front: () => svg('-70 -30 140 140', `${ground}
    ${box(0, 0, 24, '#6b5a3b', '#4b402a', '#3a311f')}
    <rect x="-26" y="26" width="22" height="14" fill="${P.neon2}" opacity=".85" transform="skewY(26)"/>
    <rect x="6" y="14" width="20" height="14" fill="#ffe9a8" opacity=".6" transform="skewY(-26)"/>
    <text x="-30" y="-2" fill="${P.neon2}" font-size="13" font-family="monospace">OPEN</text>
    <circle cx="0" cy="-30" r="4" fill="${P.red}"/>`, 'art'),
  armory: () => svg('-70 -30 140 140', `${ground}
    ${box(0, 0, 22, '#4a4f58', '#343941', '#282c33')}
    <rect x="-24" y="24" width="48" height="6" fill="${P.red}" opacity=".8" transform="skewY(26)"/>
    <path d="M-16,-10 h32 v8 h-32 z" fill="#6c737e"/>
    <path d="M-10,-24 l10,-10 10,10 z" fill="${P.red}"/>
    <circle cx="18" cy="30" r="5" fill="${P.neon2}" opacity=".7"/>`, 'art'),
  stash: () => svg('-70 -30 140 140', `${ground}
    ${box(0, 0, 20, '#4b4256', '#372f3f', '#2a2431')}
    <circle cx="0" cy="8" r="13" fill="none" stroke="${P.purple}" stroke-width="4"/>
    <circle cx="0" cy="8" r="4" fill="${P.purple}"/>
    <path d="M0,-6 v-8 M13,8 h8 M0,22 v8 M-13,8 h-8" stroke="${P.purple}" stroke-width="3"/>`, 'art'),
  yard: () => svg('-70 -30 140 140', `${ground}
    <polygon points="0,40 52,66 0,92 -52,66" fill="#242b34" stroke="#3a4453"/>
    ${box(-0.7, -0.3, 16, '#54504a', '#3c3833', '#2e2b27')}
    <circle cx="20" cy="60" r="6" fill="${P.neon2}" opacity=".8"/>
    <circle cx="4" cy="70" r="6" fill="${P.red}" opacity=".8"/>
    <circle cx="-16" cy="62" r="6" fill="${P.glass}" opacity=".8"/>
    <path d="M-40,52 h80" stroke="#3a4453" stroke-width="2" stroke-dasharray="6 6"/>`, 'art'),
};

const person = (body, accent, extra = '') => `
  <circle cx="0" cy="-26" r="10" fill="#d9b48f"/>
  <path d="M-11,-30 a11,11 0 0 1 22,0 z" fill="${P.ink}"/>
  <path d="M-14,-14 h28 l4,30 h-36 z" fill="${body}"/>
  <path d="M-14,-14 l-8,24 6,3 8,-18 z M14,-14 l8,24 -6,3 -8,-18 z" fill="${body}"/>
  <path d="M-8,16 h16 l2,22 h-8 l-2,-14 -2,14 h-8 z" fill="${P.ink}"/>
  <path d="M-14,-10 h28 v6 h-28 z" fill="${accent}"/>${extra}`;

export const TroopArt = {
  lookout: () => svg('-40 -45 80 95', person('#4a6070', P.glass,
    `<circle cx="16" cy="-24" r="7" fill="none" stroke="${P.glass}" stroke-width="3"/><path d="M9,-24 h-6" stroke="${P.glass}" stroke-width="3"/>`), 'art'),
  thug: () => svg('-40 -45 80 95', person('#6b4030', P.neon2,
    `<path d="M18,-6 l14,12 -4,5 -14,-12 z" fill="#8c98a8"/>`), 'art'),
  enforcer: () => svg('-40 -45 80 95', person('#37414f', P.light,
    `<rect x="-20" y="-12" width="40" height="22" rx="4" fill="#4d5866"/><path d="M-26,0 h10 v22 h-10 z" fill="#5f6b7a"/>`), 'art'),
  hitman: () => svg('-40 -45 80 95', person('#22262d', P.red,
    `<path d="M14,-4 h18 v5 h-18 z" fill="#b9c2cc"/><circle cx="0" cy="-27" r="10" fill="none" stroke="${P.red}" stroke-width="2"/>`), 'art'),
  van: () => svg('-50 -45 100 95', `
    <path d="M-40,10 h58 l14,12 v14 h-72 z" fill="#3c4855"/>
    <path d="M18,12 h12 l10,10 h-22 z" fill="#5a6472"/>
    <rect x="-34" y="14" width="20" height="12" fill="${P.glass}" opacity=".6"/>
    <rect x="-40" y="4" width="58" height="8" fill="#4e5b6b"/>
    <circle cx="-26" cy="38" r="8" fill="${P.ink}"/><circle cx="22" cy="38" r="8" fill="${P.ink}"/>
    <circle cx="-26" cy="38" r="3" fill="${P.light}"/><circle cx="22" cy="38" r="3" fill="${P.light}"/>`, 'art'),
};

export const ItemArt = {
  weapon: () => svg('0 0 64 64', `<rect x="6" y="26" width="40" height="8" rx="2" fill="#8c98a8"/>
    <path d="M14,34 l6,14 h8 l-4,-14 z" fill="#3a434f"/><rect x="40" y="22" width="16" height="6" rx="2" fill="#5f6b7a"/>
    <circle cx="50" cy="36" r="4" fill="${P.neon2}"/>`, 'art'),
  armor: () => svg('0 0 64 64', `<path d="M32,6 l22,8 v20 c0,14 -12,20 -22,24 -10,-4 -22,-10 -22,-24 V14 z" fill="#39434f"/>
    <path d="M32,12 l16,6 v16 c0,10 -8,15 -16,18 -8,-3 -16,-8 -16,-18 V18 z" fill="#55627a"/>`, 'art'),
  vehicle: () => svg('0 0 64 64', `<path d="M6,34 h34 l10,8 v8 H6 z" fill="#3f4b59"/>
    <rect x="10" y="26" width="18" height="8" fill="${P.glass}" opacity=".6"/>
    <circle cx="18" cy="52" r="6" fill="${P.ink}"/><circle cx="44" cy="52" r="6" fill="${P.ink}"/>`, 'art'),
  speedup: () => svg('0 0 64 64', `<path d="M36,4 L14,36 h14 l-6,24 22,-34 h-14 z" fill="${P.neon2}"/>`, 'art'),
  shield: () => svg('0 0 64 64', `<path d="M32,6 l22,8 v18 c0,16 -12,22 -22,26 -10,-4 -22,-10 -22,-26 V14 z" fill="${P.purple}"/>
    <path d="M22,32 l7,8 14,-16" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`, 'art'),
};

export const Icon = {
  cash: () => svg('0 0 24 24', `<rect x="2" y="6" width="20" height="12" rx="2" fill="#2e6b4f"/><circle cx="12" cy="12" r="4" fill="${P.neon}"/>`, 'ic'),
  product: () => svg('0 0 24 24', `<path d="M6,4 h12 l2,16 H4 z" fill="#5b4a7a"/><circle cx="12" cy="13" r="4" fill="#cdb6ff"/>`, 'ic'),
  ammo: () => svg('0 0 24 24', `<path d="M9,3 l3,-2 3,2 v13 H9 z" fill="#8c7b3a"/><rect x="9" y="16" width="6" height="6" fill="${P.neon2}"/>`, 'ic'),
  coin: () => svg('0 0 24 24', `<circle cx="12" cy="12" r="9" fill="${P.neon2}"/><circle cx="12" cy="12" r="5" fill="#b78a1d"/>`, 'ic'),
  sol: () => svg('0 0 24 24', `<path d="M5,7 h12 l-3,3 H2 z M5,11 h12 l-3,3 H2 z M5,15 h12 l-3,3 H2 z" fill="#8a6cf0"/>`, 'ic'),
};

// ---------------------------------------------------------- isometric city
export function cityMap(districts, selectedId) {
  const TW = 96, TH = 48;
  const tiles = districts.map((d) => {
    const cx = (d.x - d.y) * (TW / 2);
    const cy = (d.x + d.y) * (TH / 2);
    const color = d.gang_color || '#2b3441';
    const sel = d.id === selectedId;
    const top = `${cx},${cy - TH / 2} ${cx + TW / 2},${cy} ${cx},${cy + TH / 2} ${cx - TW / 2},${cy}`;
    return `<g class="tile ${sel ? 'sel' : ''}" data-id="${d.id}">
      <polygon points="${cx},${cy - TH / 2 + 10} ${cx + TW / 2},${cy + 10} ${cx},${cy + TH / 2 + 10} ${cx - TW / 2},${cy + 10}" fill="#0b0e12" opacity=".55"/>
      <polygon class="face" points="${top}" fill="${color}" fill-opacity="${d.gang_color ? 0.85 : 0.55}" stroke="${sel ? '#ffcf4d' : '#4b5c72'}" stroke-width="${sel ? 3 : 1.4}"/>
      <g opacity=".9">${miniBuildings(d, cx, cy)}</g>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" fill="#dfe8f3" font-family="system-ui">${esc(d.name)}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="8" fill="#9fb0c4">${d.gang_tag ? '[' + esc(d.gang_tag) + ']' : 'unclaimed'} · ${d.players.length}</text>
    </g>`;
  }).join('');
  const xs = districts.map((d) => (d.x - d.y) * (TW / 2));
  const ys = districts.map((d) => (d.x + d.y) * (TH / 2));
  const minX = Math.min(...xs) - TW, maxX = Math.max(...xs) + TW;
  const minY = Math.min(...ys) - TH, maxY = Math.max(...ys) + TH * 1.2;
  return svg(`${minX} ${minY} ${maxX - minX} ${maxY - minY}`, tiles, 'citymap');
}

function miniBuildings(d, cx, cy) {
  let out = '';
  const n = Math.min(4, d.players.length);
  const spots = [[-22, -6], [18, -8], [-6, 6], [24, 6]];
  for (let i = 0; i < n; i++) {
    const [ox, oy] = spots[i];
    const h = 10 + ((d.players[i].power % 7) * 2);
    const x = cx + ox, y = cy + oy;
    out += `<polygon points="${x},${y - h - 6} ${x + 9},${y - h - 1} ${x},${y - h + 4} ${x - 9},${y - h - 1}" fill="#6a7b92"/>
      <polygon points="${x - 9},${y - h - 1} ${x},${y - h + 4} ${x},${y + 4} ${x - 9},${y - 1}" fill="#39434f"/>
      <polygon points="${x + 9},${y - h - 1} ${x},${y - h + 4} ${x},${y + 4} ${x + 9},${y - 1}" fill="#2a323d"/>`;
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export { esc };
