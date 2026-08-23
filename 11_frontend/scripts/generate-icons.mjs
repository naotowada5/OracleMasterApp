/**
 * PWA用アイコンを生成する。
 *
 * 対応設計書: 01_docs/01_ra/requirements3.md §8.4（PWAホーム画面追加）
 *             01_docs/02_sd/04_共通設計/非機能設計.md §3
 *
 * `public/manifest.webmanifest` が参照する icon-192 / icon-512 を作る。
 * 画像ライブラリを足さずに済むよう、Node標準の zlib だけでPNGを組み立てる。
 * 4倍のスーパーサンプリングで描いてから縮小し、輪郭を滑らかにしている。
 *
 *   node scripts/generate-icons.mjs           # 採用案を public/icons/ へ出力
 *   node scripts/generate-icons.mjs --all     # 比較用に全案を public/icons/candidates/ へ出力
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** global.css のテーマカラーと揃える */
const COLORS = {
  background: [0x1a, 0x4f, 0x8a], // --color-primary
  light: [0xff, 0xff, 0xff],
  correct: [0x6f, 0xce, 0x9f], // --color-correct（ダークテーマ側の明るい方）
};

/** 採用するデザイン。--all を付けない場合はこれだけ出力する */
const ADOPTED = 'card';

// --------------------------------------------------------------- ラスタライザ

const SUPERSAMPLE = 4;

/** 描画対象。論理座標は 0〜1 の比率で扱う */
class Canvas {
  constructor(size) {
    this.size = size * SUPERSAMPLE;
    this.pixels = new Uint8Array(this.size * this.size * 3);
  }

  /** 比率を実ピクセルに直す */
  px(ratio) {
    return ratio * this.size;
  }

  fill(color) {
    for (let i = 0; i < this.size * this.size; i += 1) {
      this.pixels[i * 3] = color[0];
      this.pixels[i * 3 + 1] = color[1];
      this.pixels[i * 3 + 2] = color[2];
    }
  }

  /** 各ピクセルについて判定関数が真なら色を置く */
  paint(color, isInside) {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!isInside(x + 0.5, y + 0.5)) continue;
        const i = (y * this.size + x) * 3;
        this.pixels[i] = color[0];
        this.pixels[i + 1] = color[1];
        this.pixels[i + 2] = color[2];
      }
    }
  }

  roundedRect(color, left, top, width, height, radius) {
    const [l, t, w, h, r] = [left, top, width, height, radius].map((v) => this.px(v));
    this.paint(color, (x, y) => {
      if (x < l || x > l + w || y < t || y > t + h) return false;
      // 角の外側だけ半径で丸める
      const cx = Math.min(Math.max(x, l + r), l + w - r);
      const cy = Math.min(Math.max(y, t + r), t + h - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
    });
  }

  ellipse(color, centerX, centerY, radiusX, radiusY) {
    const [cx, cy, rx, ry] = [centerX, centerY, radiusX, radiusY].map((v) => this.px(v));
    this.paint(color, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  }

  /** 太さのある線分（両端は丸め） */
  stroke(color, fromX, fromY, toX, toY, thickness) {
    const [ax, ay, bx, by, half] = [fromX, fromY, toX, toY, thickness / 2].map((v) => this.px(v));
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    this.paint(color, (x, y) => {
      // 線分上の最近傍点までの距離で判定する
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
      const nearestX = ax + t * dx;
      const nearestY = ay + t * dy;
      return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= half * half;
    });
  }

  /** スーパーサンプリング分を平均して縮小する */
  downsample(size) {
    const out = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
          for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
            const i = ((y * SUPERSAMPLE + sy) * this.size + x * SUPERSAMPLE + sx) * 3;
            r += this.pixels[i];
            g += this.pixels[i + 1];
            b += this.pixels[i + 2];
          }
        }
        const count = SUPERSAMPLE * SUPERSAMPLE;
        const o = (y * size + x) * 4;
        out[o] = Math.round(r / count);
        out[o + 1] = Math.round(g / count);
        out[o + 2] = Math.round(b / count);
        out[o + 3] = 0xff;
      }
    }
    return out;
  }
}

// --------------------------------------------------------------- デザイン

/**
 * maskable アイコンは外周が切り取られるため、意味のある要素は
 * 中央80%（セーフゾーン）に収める。
 */
const DESIGNS = {
  /** 案1: 問題カードとチェック。1問1答の演習アプリであることを示す */
  card(canvas) {
    canvas.fill(COLORS.background);

    // カード本体
    canvas.roundedRect(COLORS.light, 0.22, 0.2, 0.56, 0.52, 0.06);

    // 問題文を表す3本の線
    canvas.roundedRect(COLORS.background, 0.3, 0.31, 0.4, 0.05, 0.025);
    canvas.roundedRect(COLORS.background, 0.3, 0.42, 0.4, 0.05, 0.025);
    canvas.roundedRect(COLORS.background, 0.3, 0.53, 0.24, 0.05, 0.025);

    // 正解チェック（右下に重ねる）
    canvas.ellipse(COLORS.background, 0.68, 0.7, 0.19, 0.19);
    canvas.ellipse(COLORS.correct, 0.68, 0.7, 0.155, 0.155);
    canvas.stroke(COLORS.background, 0.6, 0.71, 0.66, 0.77, 0.045);
    canvas.stroke(COLORS.background, 0.66, 0.77, 0.77, 0.63, 0.045);
  },

  /** 案2: データベースとチェック。Oracle（DB）資格であることを示す */
  database(canvas) {
    canvas.fill(COLORS.background);

    // シリンダー: 胴体＋上下の楕円
    canvas.roundedRect(COLORS.light, 0.24, 0.26, 0.42, 0.4, 0.0);
    canvas.ellipse(COLORS.light, 0.45, 0.66, 0.21, 0.09);
    canvas.ellipse(COLORS.light, 0.45, 0.26, 0.21, 0.09);
    canvas.ellipse(COLORS.background, 0.45, 0.26, 0.155, 0.06);

    // 段を表す区切り線
    canvas.ellipse(COLORS.background, 0.45, 0.4, 0.21, 0.085);
    canvas.ellipse(COLORS.light, 0.45, 0.385, 0.21, 0.085);
    canvas.ellipse(COLORS.background, 0.45, 0.53, 0.21, 0.085);
    canvas.ellipse(COLORS.light, 0.45, 0.515, 0.21, 0.085);

    // 正解チェック
    canvas.ellipse(COLORS.background, 0.71, 0.71, 0.19, 0.19);
    canvas.ellipse(COLORS.correct, 0.71, 0.71, 0.155, 0.155);
    canvas.stroke(COLORS.background, 0.63, 0.72, 0.69, 0.78, 0.045);
    canvas.stroke(COLORS.background, 0.69, 0.78, 0.8, 0.64, 0.045);
  },

  /** 案3: チェックマークのみ。小サイズでも潰れないミニマル案 */
  check(canvas) {
    canvas.fill(COLORS.background);
    canvas.stroke(COLORS.light, 0.27, 0.5, 0.43, 0.66, 0.12);
    canvas.stroke(COLORS.light, 0.43, 0.66, 0.74, 0.33, 0.12);
  },
};

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

function render(designName, size) {
  const canvas = new Canvas(size);
  DESIGNS[designName](canvas);
  return encodePng(size, canvas.downsample(size));
}

// --------------------------------------------------------------- 実行

const iconsDir = fileURLToPath(new URL('../public/icons', import.meta.url));

if (process.argv.includes('--all')) {
  const candidatesDir = `${iconsDir}/candidates`;
  mkdirSync(candidatesDir, { recursive: true });
  for (const name of Object.keys(DESIGNS)) {
    writeFileSync(`${candidatesDir}/${name}-512.png`, render(name, 512));
    console.log(`候補を生成: ${name}-512.png`);
  }
} else {
  mkdirSync(iconsDir, { recursive: true });
  for (const size of [192, 512]) {
    writeFileSync(`${iconsDir}/icon-${size}.png`, render(ADOPTED, size));
    console.log(`生成: icon-${size}.png（デザイン: ${ADOPTED}）`);
  }
}
