/**
 * PWA用アイコンを生成する。
 *
 * 対応設計書: 01_docs/01_ra/requirements3.md §8.4（PWAホーム画面追加）
 *             01_docs/02_sd/04_共通設計/非機能設計.md §3
 *
 * `public/manifest.webmanifest` が参照する icon-192 / icon-512 を作る。
 * **これは正式なアプリアイコンではなく暫定版**。テーマカラーの背景に
 * 「OM」の文字を置いただけのもので、リリース前に本デザインへ差し替える想定。
 *
 * 画像ライブラリを足さずに済むよう、Node標準の zlib だけでPNGを組み立てる。
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** manifest の theme_color と揃える */
const BACKGROUND = [0x1a, 0x4f, 0x8a];
const FOREGROUND = [0xff, 0xff, 0xff];

/** 5×7 のドット文字。フォントを持ち込まずに描くため手書きで定義する */
const GLYPHS = {
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
};

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPH_GAP = 1;

// --------------------------------------------------------------- PNG 出力

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGBA のピクセル配列をPNGにする */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 6; // カラータイプ: RGBA
  // 圧縮方式・フィルタ方式・インタレースはいずれも既定値の0

  // 各行の先頭にフィルタタイプ（0=None）を置く
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    pixels.copy(raw, offset, y * size * 4, (y + 1) * size * 4);
    offset += size * 4;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- 描画

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  // 背景を塗る
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = BACKGROUND[0];
    pixels[i * 4 + 1] = BACKGROUND[1];
    pixels[i * 4 + 2] = BACKGROUND[2];
    pixels[i * 4 + 3] = 0xff;
  }

  const letters = Object.values(GLYPHS);
  const columns = letters.length * GLYPH_WIDTH + (letters.length - 1) * GLYPH_GAP;

  // maskable アイコンは外周が切り取られるため、中央60%に収める
  const cell = Math.floor((size * 0.6) / columns);
  const textWidth = cell * columns;
  const textHeight = cell * GLYPH_HEIGHT;
  const originX = Math.floor((size - textWidth) / 2);
  const originY = Math.floor((size - textHeight) / 2);

  letters.forEach((rows, index) => {
    const letterX = originX + index * (GLYPH_WIDTH + GLYPH_GAP) * cell;
    rows.forEach((row, rowIndex) => {
      [...row].forEach((dot, columnIndex) => {
        if (dot !== '1') return;
        const startX = letterX + columnIndex * cell;
        const startY = originY + rowIndex * cell;
        for (let y = startY; y < startY + cell; y += 1) {
          for (let x = startX; x < startX + cell; x += 1) {
            const i = (y * size + x) * 4;
            pixels[i] = FOREGROUND[0];
            pixels[i + 1] = FOREGROUND[1];
            pixels[i + 2] = FOREGROUND[2];
          }
        }
      });
    });
  });

  return encodePng(size, pixels);
}

const outDir = fileURLToPath(new URL('../public/icons', import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const file = `${outDir}/icon-${size}.png`;
  writeFileSync(file, drawIcon(size));
  console.log(`生成: icon-${size}.png`);
}
