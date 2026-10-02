// Marketplace 아이콘(media/icon.png, 128×128)을 만든다. 외부 도구 없이 node:zlib로 PNG를 쓴다.
//   node scripts/make-icon.mjs
// 그림: 둥근 사각형 바탕 위에 접힌 모서리가 있는 문서, 본문 줄, 수식 기호 같은 강조 막대.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 128;
const SS = 4; // 슈퍼샘플링 배율 (안티에일리어싱)

const BG = [30, 58, 95]; // 짙은 남색
const PAGE = [248, 250, 252];
const FOLD = [203, 213, 225];
const LINE = [148, 163, 184];
const ACCENT = [245, 158, 11]; // 주황

const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) {
    return false;
  }
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// 문서 영역과 접힌 모서리
const P = { x0: 34, y0: 22, x1: 94, y1: 106, fold: 18 };
const inPage = (x, y) => inRoundRect(x, y, P.x0, P.y0, P.x1, P.y1, 4) && !(x > P.x1 - P.fold && y < P.y0 + P.fold && x - (P.x1 - P.fold) > y - P.y0);
const inFold = (x, y) => x >= P.x1 - P.fold && x <= P.x1 && y >= P.y0 && y <= P.y0 + P.fold && x - (P.x1 - P.fold) <= y - P.y0;

const bars = [
  { x0: 44, x1: 74, y: 40, c: LINE },
  { x0: 44, x1: 84, y: 52, c: LINE },
  { x0: 44, x1: 84, y: 64, c: LINE },
  { x0: 44, x1: 66, y: 76, c: LINE },
  { x0: 44, x1: 60, y: 92, c: ACCENT, h: 6 },
  { x0: 64, x1: 84, y: 92, c: ACCENT, h: 6 },
];

function colorAt(x, y) {
  for (const b of bars) {
    const h = b.h ?? 4;
    if (inRoundRect(x, y, b.x0, b.y - h / 2, b.x1, b.y + h / 2, h / 2)) {
      return b.c;
    }
  }
  if (inFold(x, y)) {
    return FOLD;
  }
  if (inPage(x, y)) {
    return PAGE;
  }
  if (inRoundRect(x, y, 4, 4, SIZE - 4, SIZE - 4, 24)) {
    return BG;
  }
  return null; // 투명
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = colorAt(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
    }
    const i = (py * SIZE + px) * 4;
    rgba[i] = a ? Math.round(r / a) : 0;
    rgba[i + 1] = a ? Math.round(g / a) : 0;
    rgba[i + 2] = a ? Math.round(b / a) : 0;
    rgba[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

// ---- PNG 인코딩 ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('media/icon.png', png);
console.log(`media/icon.png (${SIZE}×${SIZE}, ${png.length} bytes)`);
