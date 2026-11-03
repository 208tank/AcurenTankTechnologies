/**
 * Small QR code encoder (byte mode, error correction level L or M,
 * versions 1-13: up to about 330 bytes at level M). Enough for a contact card
 * or a link, with no extra dependency, and it runs offline.
 */

type Level = 'L' | 'M';

// version -> level -> [EC codewords per block, [[block count, data codewords per block], ...]]
const EC: Record<number, Record<Level, [number, [number, number][]]>> = {
  1: { L: [7, [[1, 19]]], M: [10, [[1, 16]]] },
  2: { L: [10, [[1, 34]]], M: [16, [[1, 28]]] },
  3: { L: [15, [[1, 55]]], M: [26, [[1, 44]]] },
  4: { L: [20, [[1, 80]]], M: [18, [[2, 32]]] },
  5: { L: [26, [[1, 108]]], M: [24, [[2, 43]]] },
  6: { L: [18, [[2, 68]]], M: [16, [[4, 27]]] },
  7: { L: [20, [[2, 78]]], M: [18, [[4, 31]]] },
  8: {
    L: [24, [[2, 97]]],
    M: [
      22,
      [
        [2, 38],
        [2, 39],
      ],
    ],
  },
  9: {
    L: [30, [[2, 116]]],
    M: [
      22,
      [
        [3, 36],
        [2, 37],
      ],
    ],
  },
  10: {
    L: [
      18,
      [
        [2, 68],
        [2, 69],
      ],
    ],
    M: [
      26,
      [
        [4, 43],
        [1, 44],
      ],
    ],
  },
  11: {
    L: [20, [[4, 81]]],
    M: [
      30,
      [
        [1, 50],
        [4, 51],
      ],
    ],
  },
  12: {
    L: [
      24,
      [
        [2, 92],
        [2, 93],
      ],
    ],
    M: [
      22,
      [
        [6, 36],
        [2, 37],
      ],
    ],
  },
  13: {
    L: [26, [[4, 107]]],
    M: [
      22,
      [
        [8, 37],
        [1, 38],
      ],
    ],
  },
};
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
};
const LEVEL_BITS: Record<Level, number> = { L: 0b01, M: 0b00 };
const MAX_VERSION = 13;

const EXP = new Array<number>(512).fill(0);
const LOG = new Array<number>(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsRemainder(data: number[], n: number) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    gen.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= gmul(c, EXP[i]);
    });
    gen = next;
  }
  const msg = [...data, ...new Array<number>(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef) for (let j = 1; j < gen.length; j++) msg[i + j] ^= gmul(gen[j], coef);
  }
  return msg.slice(data.length);
}

const capacity = (version: number, level: Level) =>
  EC[version][level][1].reduce((sum, [n, d]) => sum + n * d, 0);

/** Largest number of bytes that fits at this level. */
export const maxBytes = (level: Level = 'M') => capacity(MAX_VERSION, level) - 3;

function codewords(raw: Uint8Array, level: Level): [number, number[]] {
  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + 8 * raw.length <= capacity(v, level) * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('Too long for a QR code. Shorten some of the details.');
  const countBits = version < 10 ? 8 : 16;
  const cap = capacity(version, level);
  let bits = '0100' + raw.length.toString(2).padStart(countBits, '0');
  raw.forEach((b) => (bits += b.toString(2).padStart(8, '0')));
  bits += '0'.repeat(Math.min(4, cap * 8 - bits.length));
  bits += '0'.repeat((8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8), 2));
  for (let k = 0; data.length < cap; k++) data.push(k % 2 ? 0x11 : 0xec);

  const [ecn, groups] = EC[version][level];
  const blocks: number[][] = [];
  let pos = 0;
  for (const [n, d] of groups)
    for (let i = 0; i < n; i++) {
      blocks.push(data.slice(pos, pos + d));
      pos += d;
    }
  const ecs = blocks.map((b) => rsRemainder(b, ecn));
  const out: number[] = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecn; i++) for (const e of ecs) out.push(e[i]);
  return [version, out];
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function build(version: number, level: Level, cw: number[], mask: number): number[][] {
  const size = 17 + 4 * version;
  const m: (number | null)[][] = Array.from({ length: size }, () =>
    new Array<number | null>(size).fill(null),
  );
  const finder = (r: number, c: number) => {
    for (let dr = -1; dr < 8; dr++)
      for (let dc = -1; dc < 8; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const ring = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        m[rr][cc] = ring || core ? 1 : 0;
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0;
  const pos = ALIGN[version];
  const last = pos[pos.length - 1];
  for (const r of pos)
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
    }
  m[size - 8][8] = 1;
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    m[8][size - 1 - i] = 0;
    m[size - 1 - i][8] = i === 7 ? 1 : 0;
  }
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (vbits >> i) & 1;
      const a = size - 11 + (i % 3),
        b = Math.floor(i / 3);
      m[a][b] = bit;
      m[b][a] = bit;
    }
  }
  const fixed = m.map((row) => row.map((v) => v !== null));

  let idx = 0;
  const totalBits = cw.length * 8;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const r = upward ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (fixed[r][c]) continue;
        const bit = idx < totalBits ? (cw[idx >> 3] >> (7 - (idx & 7))) & 1 : 0;
        idx++;
        m[r][c] = bit ^ (MASKS[mask](r, c) ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const fmt = (LEVEL_BITS[level] << 3) | mask;
  let rem = fmt;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const fbits = ((fmt << 10) | rem) ^ 0x5412;
  const fb = (i: number) => (fbits >> i) & 1;
  for (let i = 0; i < 6; i++) m[i][8] = fb(i);
  m[7][8] = fb(6);
  m[8][8] = fb(7);
  m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = fb(i);
  m[size - 8][8] = 1;
  return m as number[][];
}

function penalty(m: number[][]) {
  const n = m.length;
  let score = 0;
  const cols = m[0].map((_, c) => m.map((row) => row[c]));
  for (const grid of [m, cols])
    for (const row of grid) {
      let run = 0,
        prev = -1;
      for (const v of row) {
        if (v === prev) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
          prev = v;
        }
      }
      if (run >= 5) score += run - 2;
      const s = row.join('');
      for (const pat of ['10111010000', '00001011101']) {
        let i = s.indexOf(pat);
        while (i !== -1) {
          score += 40;
          i = s.indexOf(pat, i + 1);
        }
      }
    }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r + 1][c] && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c + 1])
        score += 3;
  const dark = m.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
  score += 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
  return score;
}

/** Encode text as a QR matrix (1 = dark), choosing the best mask. */
export function qrMatrix(text: string, level: Level = 'M'): number[][] {
  const raw = new TextEncoder().encode(text);
  const [version, cw] = codewords(raw, level);
  let best: number[][] = [];
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(version, level, cw, mask);
    const s = penalty(m);
    if (s < bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

/** Encode text as a standalone SVG string with a 4-module quiet zone. */
export function qrSvg(text: string, level: Level = 'M', color = '#002B5C'): string {
  const m = qrMatrix(text, level);
  const quiet = 4;
  const n = m.length + quiet * 2;
  let d = '';
  m.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path fill="${color}" d="${d}"/></svg>`;
}
