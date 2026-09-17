// Генератор функциональных спрайт-листов персонажа для Survival City.
// Чистый Node (zlib встроен) — без зависимостей, детерминированный.
//
// Запуск:
//   node tools/sprites/render-sheet.js            # все листы
//   node tools/sprites/render-sheet.js --debug 7  # один кадр hero-листа крупно
//
// Формат: кадр 128x192, линия земли y=172, центр x=64.
// hero:  9 колонок (idle, walk1..4, run1..4) x 4 ряда (down, up, left, right)
// npc:   9 колонок x 16 рядов (4 палитры x 4 направления; ряд = palette*4 + dir)
// Прозрачный фон, тень внутри кадра, без текста.

"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ================= PNG-энкодер ================= */

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = rowStart + 1 + x * 4;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      raw[d + 3] = rgba[s + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

/* ================= слой с альфа-смешиванием ================= */

class Layer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float64Array(w * h * 4);
  }
  blend(x, y, r, g, b, a) {
    if (a <= 0) return;
    const i = (y * this.w + x) * 4;
    const sa = a / 255;
    const da = this.d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.d[i] = (r * sa + this.d[i] * da * (1 - sa)) / oa;
    this.d[i + 1] = (g * sa + this.d[i + 1] * da * (1 - sa)) / oa;
    this.d[i + 2] = (b * sa + this.d[i + 2] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  toRGBA() {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.d.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(this.d[i])));
    return out;
  }
}

/* ================= painter (логические координаты кадра 128x192) ================= */

const SS = 2;

function makePainter(w, h) {
  const layer = new Layer(w * SS, h * SS);
  const p = {
    layer,
    w,
    h,
    fillCircle(cx, cy, r, col) {
      if (r <= 0) return;
      const X = cx * SS;
      const Y = cy * SS;
      const R = r * SS;
      const y0 = Math.max(0, Math.floor(Y - R));
      const y1 = Math.min(layer.h - 1, Math.ceil(Y + R));
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - Y;
        if (dy * dy > R * R) continue;
        const hw = Math.sqrt(R * R - dy * dy);
        const x0 = Math.max(0, Math.ceil(X - hw - 0.5));
        const x1 = Math.min(layer.w - 1, Math.floor(X + hw - 0.5));
        for (let x = x0; x <= x1; x++) layer.blend(x, y, col[0], col[1], col[2], col[3]);
      }
    },
    capsule(x1, y1, x2, y2, r, col) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(len / (r * 0.6)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        p.fillCircle(x1 + dx * t, y1 + dy * t, r, col);
      }
    },
    rrect(x, y, w, h, r, col) {
      const X = x * SS;
      const Y = y * SS;
      const W = w * SS;
      const H = h * SS;
      const R = r * SS;
      const y0 = Math.max(0, Math.floor(Y));
      const y1 = Math.min(layer.h - 1, Math.ceil(Y + H - 0.001));
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        let x0 = X;
        let x1 = X + W;
        if (py < Y + R) {
          const t = (py - (Y + R)) / R;
          const dx = R * Math.sqrt(Math.max(0, 1 - t * t));
          x0 = X + R - dx;
          x1 = X + W - R + dx;
        } else if (py > Y + H - R) {
          const t = (py - (Y + H - R)) / R;
          const dx = R * Math.sqrt(Math.max(0, 1 - t * t));
          x0 = X + R - dx;
          x1 = X + W - R + dx;
        }
        const ix0 = Math.max(0, Math.ceil(x0 - 0.001));
        const ix1 = Math.min(layer.w - 1, Math.floor(x1 - 0.001));
        for (let x = ix0; x <= ix1; x++) layer.blend(x, y, col[0], col[1], col[2], col[3]);
      }
    },
    ellipse(cx, cy, rx, ry, col) {
      if (rx <= 0 || ry <= 0) return;
      const X = cx * SS;
      const Y = cy * SS;
      const RX = rx * SS;
      const RY = ry * SS;
      const y0 = Math.max(0, Math.floor(Y - RY));
      const y1 = Math.min(layer.h - 1, Math.ceil(Y + RY));
      for (let y = y0; y <= y1; y++) {
        const t = (y + 0.5 - Y) / RY;
        if (t * t > 1) continue;
        const hw = RX * Math.sqrt(1 - t * t);
        const x0 = Math.max(0, Math.ceil(X - hw - 0.001));
        const x1 = Math.min(layer.w - 1, Math.floor(X + hw - 0.001));
        for (let x = x0; x <= x1; x++) layer.blend(x, y, col[0], col[1], col[2], col[3]);
      }
    },
    line(x1, y1, x2, y2, r, col) {
      p.capsule(x1, y1, x2, y2, r, col);
    },
    toRGBA() {
      return layer.toRGBA();
    },
  };
  return p;
}

function blitFrame(target, tw, th, src, sw, sh, dx, dy, scale) {
  scale = scale || SS;
  const srcW = sw * scale;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const s = ((y * scale + sy) * srcW + (x * scale + sx)) * 4;
          const sa = src[s + 3] / 255;
          a += sa;
          r += src[s] * sa;
          g += src[s + 1] * sa;
          b += src[s + 2] * sa;
        }
      }
      const n = scale * scale;
      const i = ((dy + y) * tw + (dx + x)) * 4;
      if (a > 0) {
        const oa = a / n;
        const da = target[i + 3] / 255;
        const outA = oa + da * (1 - oa);
        if (outA > 0) {
          target[i] = (r / n + target[i] * da * (1 - oa)) / outA;
          target[i + 1] = (g / n + target[i + 1] * da * (1 - oa)) / outA;
          target[i + 2] = (b / n + target[i + 2] * da * (1 - oa)) / outA;
        }
        target[i + 3] = outA * 255;
      }
    }
  }
}

/* ================= палитры ================= */

function pal(over) {
  return Object.assign(
    {
      skin: [219, 183, 146, 255],
      skinShade: [190, 152, 116, 255],
      hair: [74, 58, 45, 255],
      hairDark: [56, 44, 34, 255],
      hood: [62, 66, 75, 255],
      hoodDark: [45, 48, 56, 255],
      hoodSleeve: [54, 57, 66, 255],
      hoodFaded: [92, 97, 108, 110],
      jeans: [92, 110, 135, 255],
      jeansFar: [72, 88, 109, 255],
      jeansLight: [120, 138, 162, 90],
      shoe: [181, 184, 190, 255],
      shoeLight: [206, 208, 213, 150],
      sole: [68, 71, 77, 255],
      lace: [118, 122, 128, 255],
      pack: [110, 91, 72, 255],
      packDark: [82, 67, 54, 255],
      packWorn: [56, 46, 38, 100],
      strap: [58, 53, 47, 255],
      string: [175, 171, 161, 255],
      eye: [40, 35, 29, 255],
      mouth: [138, 103, 88, 120],
      outline: [26, 28, 34, 170],
      shadow: [8, 10, 14, 55],
      hat: null,
    },
    over
  );
}

const HERO = pal({});

const NPC_PALETTES = [
  pal({
    hood: [88, 94, 72, 255],
    hoodDark: [66, 70, 54, 255],
    hoodSleeve: [78, 83, 64, 255],
    skin: [214, 178, 140, 255],
    hair: [60, 50, 40, 255],
    pack: [96, 82, 66, 255],
  }),
  pal({
    hood: [104, 84, 64, 255],
    hoodDark: [78, 62, 47, 255],
    hoodSleeve: [93, 75, 57, 255],
    skin: [226, 196, 166, 255],
    hair: [90, 70, 50, 255],
    hat: [70, 74, 84, 255],
  }),
  pal({
    hood: [108, 110, 116, 255],
    hoodDark: [82, 84, 90, 255],
    hoodSleeve: [96, 98, 104, 255],
    skin: [205, 168, 132, 255],
    hair: [50, 46, 42, 255],
    pack: [88, 84, 78, 255],
  }),
  pal({
    hood: [44, 52, 72, 255],
    hoodDark: [32, 38, 54, 255],
    hoodSleeve: [39, 46, 64, 255],
    skin: [219, 183, 146, 255],
    hair: [60, 50, 40, 255],
    hat: [36, 42, 58, 255],
  }),
];

/* ================= позы (координаты 128x192) ================= */

function poseParams(anim, frame) {
  if (anim === "idle")
    return { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: 0, armL: 0, armR: 0, run: false };
  const A = anim === "walk" ? 12 : 19;
  const LF = anim === "walk" ? 5 : 8;
  const LB = anim === "walk" ? 7 : 12;
  const armA = A * 0.42;
  const frames = [
    { legL: A, legR: -A, liftL: LF, liftR: LB, bob: 0, armL: -armA, armR: armA, run: anim === "run" },
    { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: anim === "walk" ? 2 : 4, armL: 0, armR: 0, run: anim === "run" },
    { legL: -A, legR: A, liftL: LB, liftR: LF, bob: 0, armL: armA, armR: -armA, run: anim === "run" },
    { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: anim === "walk" ? -2 : 2, armL: 0, armR: 0, run: anim === "run" },
  ];
  return frames[frame];
}

/* ================= персонаж ================= */
// Кадр 128x192: центр x=64, линия земли y=172, рост ~142px (человеческие
// пропорции: голова ~1/5 роста), корпус 80..126, ноги 124..162, кроссовки до 172.

function drawCharacter(p, dir, anim, frame, C) {
  const P = poseParams(anim, frame);
  const uy = P.bob + (anim === "run" ? (dir === "down" ? 3 : dir === "up" ? -3 : 0) : 0);
  const ux = anim === "run" ? (dir === "left" ? -4 : dir === "right" ? 4 : 0) : 0;
  const cx = 64 + ux;
  const d = dir === "left" ? -1 : dir === "right" ? 1 : 0;
  const OUT = C.outline;

  // тень (всегда внутри кадра)
  p.ellipse(64, 176, P.run ? 22 : 26, 6, C.shadow);

  const hipY = 124 + P.bob * 0.4;
  const footL = { x: 55 + P.legL, y: 168 - P.liftL };
  const footR = { x: 73 + P.legR, y: 168 - P.liftR };

  const sneaker = (f, facing) => {
    const x = f.x - 11.5;
    const y = f.y - 10;
    p.rrect(x - 1.4, y - 1.4, 25.8, 15.8, 7, OUT);
    p.rrect(x, y, 23, 13, 6, C.shoe);
    // мысок
    p.ellipse(f.x + (facing || 0) * 7, f.y - 3.5, 7, 4, C.shoeLight);
    // шнурки
    p.capsule(f.x - 3 + (facing || 0) * 2, f.y - 7.5, f.x + 4 + (facing || 0) * 2, f.y - 7.5, 0.9, C.lace);
    p.capsule(f.x - 3 + (facing || 0) * 2, f.y - 5, f.x + 4 + (facing || 0) * 2, f.y - 5, 0.9, C.lace);
    // подошва
    p.rrect(x - 0.8, f.y + 1.4, 24.6, 4.2, 2, C.sole);
  };

  const leg = (hx, f, col) => {
    const kx = (hx + f.x) / 2 + 2.4;
    const ky = (hipY + f.y) / 2 - P.liftL * 0.12;
    p.capsule(hx, hipY, kx, ky, 8.8, OUT);
    p.capsule(f.x, f.y, kx, ky, 8.8, OUT);
    p.capsule(hx, hipY, kx, ky, 7.4, col);
    p.capsule(f.x, f.y, kx, ky, 7.4, col);
    // боковой шов
    p.capsule(hx + 1.5, hipY + 4, f.x + 1, f.y - 8, 0.8, C.jeansFar);
    // колено: выцветшее пятно
    p.ellipse(kx, ky, 4.6, 6, C.jeansLight);
    // манжета
    p.rrect(f.x - 7.2, f.y - 9, 14.4, 5, 2.4, C.jeansFar);
  };

  const head = (withFace) => {
    const hy = 55 + uy;
    const hx = cx;
    // волосы
    p.fillCircle(hx, hy - 3, 15.6, OUT);
    p.fillCircle(hx, hy - 3, 14.2, C.hair);
    // головной убор (у NPC)
    if (C.hat) {
      p.fillCircle(hx, hy - 4.4, 14.6, C.hat);
      p.rrect(hx - 14.4, hy - 6.5, 28.8, 5.5, 2.6, C.hat);
      if (dir === "left" || dir === "right") {
        p.rrect(hx - 14.4 + (d === 1 ? 10 : 0), hy - 5.5, 18, 4.5, 2, C.hat); // козырёк вперёд
      }
    }
    if (withFace && (dir === "down" || dir === "left" || dir === "right")) {
      const fx = dir === "down" ? hx : hx + d * 3.4;
      p.fillCircle(fx, hy + 2.6, 12.2, C.skin);
      if (dir === "down") {
        // брови — тонкие, спокойные
        p.capsule(fx - 6.4, hy - 0.4, fx - 3.4, hy - 0.7, 0.7, C.hairDark);
        p.capsule(fx + 3.4, hy - 0.7, fx + 6.4, hy - 0.4, 0.7, C.hairDark);
        p.fillCircle(fx - 4.8, hy + 3.4, 2.1, C.eye);
        p.fillCircle(fx + 4.8, hy + 3.4, 2.1, C.eye);
        p.capsule(fx - 3.2, hy + 9.8, fx + 3.2, hy + 9.8, 1.1, C.mouth);
      } else {
        p.capsule(fx + d * 4.6, hy - 0.2, fx + d * 7.2, hy - 0.5, 0.7, C.hairDark); // бровь
        p.fillCircle(fx + d * 6.4, hy + 4.2, 2.1, C.eye);
        p.fillCircle(fx - d * 1.6, hy + 4.8, 3.2, C.skinShade); // ухо
      }
    }
    // растрёпанные пряди — лежат на макушке, направлены в стороны
    p.capsule(hx - 8.5, hy - 11.2, hx - 14.5, hy - 14.2, 2.4, C.hairDark);
    p.capsule(hx - 1, hy - 13.6, hx - 3.4, hy - 17.4, 2.4, C.hairDark);
    p.capsule(hx + 9.5, hy - 11.2, hx + 15.2, hy - 14, 2.4, C.hairDark);
    p.capsule(hx + 14, hy - 6, hx + 18.2, hy - 8.6, 2, C.hairDark);
    if (dir === "up") {
      p.fillCircle(hx, hy - 1.6, 13.6, C.hair); // затылок
    }
    if (dir === "left" || dir === "right") {
      p.fillCircle(hx - d * 7, hy - 4.6, 10, C.hair); // затылок сзади
    }
  };

  const hoodDown = () => {
    // капюшон, собранный на шее (спереди)
    p.rrect(cx - 14, 50 + uy, 28, 15, 7, OUT);
    p.rrect(cx - 12.8, 51.2 + uy, 25.6, 12.8, 6, C.hoodDark);
    // складки
    p.capsule(cx - 6, 56 + uy, cx + 6, 56.8 + uy, 1.2, C.hood);
  };

  const torso = () => {
    // корпус худи
    p.rrect(cx - 21.8, 79 + uy, 43.6, 46, 12, OUT);
    p.rrect(cx - 20.6, 80.2 + uy, 41.2, 44, 11, C.hood);
    // выцветшие плечи (мягкий свет)
    p.ellipse(cx - 13, 86 + uy, 7.6, 5.2, C.hoodFaded);
    p.ellipse(cx + 13, 86 + uy, 7.6, 5.2, C.hoodFaded);
    // потёртости
    p.ellipse(cx - 16, 96 + uy, 5.2, 4, C.packWorn);
    p.ellipse(cx + 16, 108 + uy, 4.4, 3.6, C.packWorn);
    // мягкая тень по правому краю
    p.ellipse(cx + 17, 102 + uy, 4, 14, [22, 24, 30, 38]);
    // мягкий свет по левому верху
    p.ellipse(cx - 14, 90 + uy, 6, 9, [235, 238, 244, 26]);
    // молния
    p.capsule(cx, 84 + uy, cx, 118 + uy, 1.2, [40, 42, 48, 190]);
    p.fillCircle(cx, 86 + uy, 1.6, C.string);
    // манжета низа (рибана)
    p.rrect(cx - 20.6, 118 + uy, 41.2, 8, 4.5, C.hoodDark);
    p.capsule(cx - 16, 122 + uy, cx + 16, 122 + uy, 0.8, C.hoodDark);
  };

  const torsoDetails = () => {
    // карман-кенгуру
    p.rrect(cx - 11, 106 + uy, 22, 14, 5, C.hoodDark);
    p.capsule(cx - 9, 106.6 + uy, cx + 9, 106.6 + uy, 1, C.hood); // край кармана
    // шнурки
    p.capsule(cx - 5, 83 + uy, cx - 5, 98 + uy, 1.5, C.string);
    p.capsule(cx + 5, 83 + uy, cx + 5, 98 + uy, 1.5, C.string);
    p.fillCircle(cx - 5, 99 + uy, 1.3, C.string);
    p.fillCircle(cx + 5, 99 + uy, 1.3, C.string);
    // ремешки рюкзака
    p.capsule(cx - 12.4, 83 + uy, cx - 12.4, 104 + uy, 3.2, OUT);
    p.capsule(cx + 12.4, 83 + uy, cx + 12.4, 104 + uy, 3.2, OUT);
    p.capsule(cx - 12.4, 83 + uy, cx - 12.4, 104 + uy, 2.4, C.strap);
    p.capsule(cx + 12.4, 83 + uy, cx + 12.4, 104 + uy, 2.4, C.strap);
  };

  const arm = (sx, hx, hy, col) => {
    p.capsule(sx, 82 + uy, hx, hy, 7.2, OUT);
    p.capsule(sx, 82 + uy, hx, hy, 5.8, col);
    // манжета рукава
    p.capsule(hx - (hx - sx) * 0.06, hy - (hy - (82 + uy)) * 0.1, hx, hy, 5, C.hoodDark);
    p.fillCircle(hx, hy, 4.6, OUT);
    p.fillCircle(hx, hy, 3.6, C.skin); // кисть
  };

  const backpackUp = () => {
    // рюкзак (вид сзади)
    const bx = cx - 19;
    const by = 66 + uy;
    p.rrect(bx - 1.4, by - 1.4, 40.8, 44.8, 9, OUT);
    p.rrect(bx, by, 38, 42, 8, C.pack);
    p.rrect(bx, by, 38, 19, 8, C.packDark); // клапан
    p.rrect(bx + 4, by + 29, 13, 12, 4, C.packDark); // карманы
    p.rrect(bx + 22, by + 27, 12, 14, 4, C.packDark);
    p.capsule(bx + 9, by + 19, bx + 29, by + 19, 2, C.strap); // пояс клапана
    p.fillCircle(bx + 12, by + 19, 1.6, C.string); // пряжка
    p.fillCircle(bx + 26, by + 19, 1.6, C.string);
    p.ellipse(bx + 8, by + 35, 4.8, 3.6, C.packWorn); // потёртость
    // ремешки поверх плеч
    p.capsule(cx - 12.4, 63 + uy, cx - 12.4, 79 + uy, 3.2, OUT);
    p.capsule(cx + 12.4, 63 + uy, cx + 12.4, 79 + uy, 3.2, OUT);
    p.capsule(cx - 12.4, 63 + uy, cx - 12.4, 79 + uy, 2.4, C.strap);
    p.capsule(cx + 12.4, 63 + uy, cx + 12.4, 79 + uy, 2.4, C.strap);
  };

  const hoodUp = () => {
    // капюшон на спине (вид сзади)
    p.rrect(cx - 15.2, 47 + uy, 30.4, 24, 11, OUT);
    p.rrect(cx - 14, 48.2 + uy, 28, 21.6, 10, C.hoodDark);
    p.capsule(cx - 7, 57 + uy, cx + 7, 58 + uy, 1.6, C.hood); // складка
  };

  const backpackSide = () => {
    // вид сбоку: рюкзак на «задней» стороне, прижат к спине
    const bx = cx - d * 19;
    const by = 68 + uy;
    p.rrect(bx - 1.4, by - 1.4, 20.8, 42.8, 8, OUT);
    p.rrect(bx, by, 18, 40, 7, C.pack);
    p.rrect(bx, by, 18, 15, 7, C.packDark);
    p.capsule(bx + 3, by + 15, bx + 15, by + 15, 1.6, C.strap);
    p.ellipse(bx + 7, by + 28, 3.6, 3, C.packWorn);
    // ремень через плечо
    p.capsule(cx - d * 6, 66 + uy, cx + d * 3, 84 + uy, 2.6, C.strap);
  };

  const hoodSide = () => {
    // капюшон сзади головы — только слегка выглядывает
    p.rrect(cx - d * 14 - 8, 50 + uy, 16, 14, 6.5, OUT);
    p.rrect(cx - d * 14 - 6.8, 51.2 + uy, 13.6, 11.8, 5.5, C.hoodDark);
  };

  const handY = 118 + uy * 0.9 - (P.run ? 8 : 0);

  if (dir === "down") {
    hoodDown();
    leg(57 + ux * 0.3, footL, C.jeans);
    leg(71 + ux * 0.3, footR, C.jeans);
    sneaker(footL, 0);
    sneaker(footR, 0);
    torso();
    torsoDetails();
    arm(cx - 17.6, cx - 21.6 + P.armL, handY, C.hoodSleeve);
    arm(cx + 17.6, cx + 21.6 + P.armR, handY, C.hoodSleeve);
    head(true);
  } else if (dir === "up") {
    leg(57 + ux * 0.3, footL, C.jeans);
    leg(71 + ux * 0.3, footR, C.jeans);
    sneaker(footL, 0);
    sneaker(footR, 0);
    torso();
    backpackUp();
    hoodUp();
    arm(cx - 17.6, cx - 21.6 + P.armL, handY, C.hoodSleeve);
    arm(cx + 17.6, cx + 21.6 + P.armR, handY, C.hoodSleeve);
    head(false);
  } else {
    // боковой вид
    const nearLeg = d === 1 ? footL : footR;
    const farLeg = d === 1 ? footR : footL;
    const nearHip = d === 1 ? 57 : 71;
    const farHip = d === 1 ? 71 : 57;
    // дальняя рука (за телом)
    arm(cx - d * 3, cx - d * 9 + P.armR * 0.8, handY, C.hoodDark);
    leg(farHip + ux * 0.3, farLeg, C.jeansFar);
    sneaker(farLeg, d);
    torso();
    backpackSide();
    hoodSide();
    leg(nearHip + ux * 0.3, nearLeg, C.jeans);
    sneaker(nearLeg, d);
    arm(cx - d * 3, cx - d * 9 + P.armL * 0.9, handY, C.hoodSleeve);
    head(true);
  }
}

/* ================= сборка листов ================= */

const FW = 128;
const FH = 192;
const COLS = 9; // idle, walk1..4, run1..4
const HERO_ROWS = 4;
const NPC_PALETTES_COUNT = NPC_PALETTES.length;
const NPC_ROWS = NPC_PALETTES_COUNT * HERO_ROWS;
const DIRS = ["down", "up", "left", "right"];

function animOf(col) {
  return col === 0 ? "idle" : col <= 4 ? "walk" : "run";
}
function frameOf(col) {
  return col === 0 ? 0 : col <= 4 ? col - 1 : col - 5;
}

const outDir = path.join(__dirname, "..", "..", "public", "sprites");
fs.mkdirSync(outDir, { recursive: true });

// отладка: --debug <idx hero-листа>
const dbgIdx = process.argv.includes("--debug")
  ? Math.min(COLS * HERO_ROWS - 1, Math.max(0, Number(process.argv[process.argv.indexOf("--debug") + 1]) || 0))
  : -1;

if (dbgIdx >= 0) {
  const r = Math.floor(dbgIdx / COLS);
  const c = dbgIdx % COLS;
  const p = makePainter(FW, FH);
  drawCharacter(p, DIRS[r], animOf(c), frameOf(c), HERO);
  const S = 4;
  const big = new Layer(FW * S, FH * S);
  const rgba = p.toRGBA();
  const ssW = FW * SS;
  for (let y = 0; y < FH * S; y++) {
    for (let x = 0; x < FW * S; x++) {
      const t = (y * FW * S + x) * 4;
      const light = ((x >> 4) + (y >> 4)) % 2 === 0;
      const v = light ? 235 : 220;
      big.d[t] = v;
      big.d[t + 1] = v;
      big.d[t + 2] = v;
      big.d[t + 3] = 255;
    }
  }
  for (let y = 0; y < FH * S; y++) {
    for (let x = 0; x < FW * S; x++) {
      const s = (Math.floor((y * SS) / S) * ssW + Math.floor((x * SS) / S)) * 4;
      if (rgba[s + 3] === 0) continue;
      const t = (y * FW * S + x) * 4;
      const sa = rgba[s + 3] / 255;
      big.d[t] = rgba[s] * sa + big.d[t] * (1 - sa);
      big.d[t + 1] = rgba[s + 1] * sa + big.d[t + 1] * (1 - sa);
      big.d[t + 2] = rgba[s + 2] * sa + big.d[t + 2] * (1 - sa);
      big.d[t + 3] = 255;
    }
  }
  fs.writeFileSync(
    path.join(__dirname, `debug-frame-${dbgIdx}.png`),
    encodePNG(FW * S, FH * S, big.toRGBA())
  );
  console.log(`debug-frame-${dbgIdx}.png (tools/sprites, dir=${DIRS[r]}, col=${c}) ${FW * S}x${FH * S}`);
  process.exit(0);
}

function buildSheet(rows, paletteForRow) {
  const sheet = new Layer(COLS * FW, rows * FH);
  for (let r = 0; r < rows; r++) {
    const dir = DIRS[r % HERO_ROWS];
    for (let c = 0; c < COLS; c++) {
      const p = makePainter(FW, FH);
      drawCharacter(p, dir, animOf(c), frameOf(c), paletteForRow(r));
      blitFrame(sheet.d, sheet.w, sheet.h, p.toRGBA(), FW, FH, c * FW, r * FH);
    }
  }
  return sheet;
}

// 1) hero-лист
const hero = buildSheet(HERO_ROWS, () => HERO);
const heroPNG = encodePNG(hero.w, hero.h, hero.toRGBA());
fs.writeFileSync(path.join(outDir, "character-sheet.png"), heroPNG);
console.log(`character-sheet.png ${heroPNG.length} bytes (${hero.w}x${hero.h})`);

// 2) NPC-лист: 4 палитры x 4 направления
const npc = buildSheet(NPC_ROWS, (r) => NPC_PALETTES[Math.floor(r / HERO_ROWS)]);
const npcPNG = encodePNG(npc.w, npc.h, npc.toRGBA());
fs.writeFileSync(path.join(outDir, "npcs.png"), npcPNG);
console.log(`npcs.png ${npcPNG.length} bytes (${npc.w}x${npc.h})`);

// 3) метаданные
const meta = {
  file: "character-sheet.png",
  frameWidth: FW,
  frameHeight: FH,
  columns: COLS,
  rows: HERO_ROWS,
  directions: DIRS,
  columnsOrder: ["idle", "walk1", "walk2", "walk3", "walk4", "run1", "run2", "run3", "run4"],
  sheetWidth: hero.w,
  sheetHeight: hero.h,
  transparent: true,
  anchorX: 64,
  groundLineY: 172,
  npcFile: "npcs.png",
  npcPalettes: NPC_PALETTES_COUNT,
  npcRows: NPC_ROWS,
  npcRowFor: "palette*4 + directionIndex (down=0, up=1, left=2, right=3)",
  notes: "Каждый ряд — направление; колонка 0 — idle, 1-4 — walk, 5-8 — run.",
};
fs.writeFileSync(path.join(outDir, "character-meta.json"), JSON.stringify(meta, null, 2));
console.log("character-meta.json ok");

// 4) превью hero-листа на шахматке (только для контроля)
const prev = new Layer(hero.w, hero.h);
for (let y = 0; y < hero.h; y++) {
  for (let x = 0; x < hero.w; x++) {
    const light = ((x >> 3) + (y >> 3)) % 2 === 0;
    const i = (y * hero.w + x) * 4;
    const v = light ? 226 : 210;
    prev.d[i] = v;
    prev.d[i + 1] = v;
    prev.d[i + 2] = v;
    prev.d[i + 3] = 255;
  }
}
blitFrame(prev.d, prev.w, prev.h, hero.toRGBA(), hero.w, hero.h, 0, 0, 1);
const gCol = [90, 90, 100, 255];
for (let c = 0; c <= COLS; c++)
  for (let y = 0; y < hero.h; y++) prev.blend(c * FW, y, gCol[0], gCol[1], gCol[2], 120);
for (let r = 0; r <= HERO_ROWS; r++)
  for (let x = 0; x < hero.w; x++) prev.blend(x, r * FH, gCol[0], gCol[1], gCol[2], 120);
fs.writeFileSync(
  path.join(__dirname, "character-sheet-preview.png"),
  encodePNG(prev.w, prev.h, prev.toRGBA())
);
console.log("character-sheet-preview.png ok (tools/sprites)");
