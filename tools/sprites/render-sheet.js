// Генератор функционального спрайт-листа персонажа для Survival City.
// Чистый Node (zlib встроены) — без зависимостей.
// Запуск: node tools/sprites/render-sheet.js
//
// Лист: 64x96 на кадр, 9 колонок (idle, walk1..4, run1..4) x 4 ряда (down, up, left, right).
// Прозрачный фон, без текста/подписей/декора. Тень строго внутри кадра.

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
  ihdr[8] = 8; // глубина
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0; // filter none
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

/* ================= painter (логические координаты, SS-суперсэмплинг) ================= */

const SS = 3;

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
    toRGBA() {
      return layer.toRGBA();
    },
  };
  return p;
}

// downsample с суперсэмплинга в целевой буфер (вставка кадра)
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

/* ================= палитра (приглушённая городская) ================= */

const C = {
  skin: [216, 178, 141, 255],
  skinShade: [191, 152, 117, 255],
  hair: [72, 57, 44, 255],
  hairDark: [56, 44, 34, 255],
  hood: [64, 68, 76, 255],
  hoodDark: [48, 51, 58, 255],
  hoodArm: [55, 58, 66, 255],
  hoodLight: [82, 87, 97, 255],
  hoodFaded: [90, 95, 105, 110],
  jeans: [93, 111, 136, 255],
  jeansFar: [74, 89, 110, 255],
  jeansLight: [122, 140, 164, 90],
  shoe: [178, 181, 187, 255],
  shoeLight: [204, 206, 211, 140],
  sole: [70, 73, 79, 255],
  pack: [108, 89, 71, 255],
  packDark: [82, 67, 54, 255],
  packWorn: [58, 48, 40, 90],
  strap: [60, 55, 49, 255],
  string: [172, 168, 158, 255],
  eye: [42, 37, 31, 255],
  mouth: [140, 105, 90, 110],
  outline: [28, 30, 36, 160],
  shadow: [10, 12, 16, 58],
};

const OUT = C.outline;

/* ================= позы ================= */

function poseParams(anim, frame) {
  if (anim === "idle")
    return { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: 0, armL: 0, armR: 0, run: false };
  const A = anim === "walk" ? 6 : 9.5;
  const LF = anim === "walk" ? 2 : 4;
  const LB = anim === "walk" ? 3 : 6;
  const armA = A * 0.42;
  const frames = [
    { legL: A, legR: -A, liftL: LF, liftR: LB, bob: 0, armL: -armA, armR: armA, run: anim === "run" },
    { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: anim === "walk" ? 1 : 2, armL: 0, armR: 0, run: anim === "run" },
    { legL: -A, legR: A, liftL: LB, liftR: LF, bob: 0, armL: armA, armR: -armA, run: anim === "run" },
    { legL: 0, legR: 0, liftL: 0, liftR: 0, bob: anim === "walk" ? -1 : 1, armL: 0, armR: 0, run: anim === "run" },
  ];
  return frames[frame];
}

/* ================= персонаж ================= */

// Кадр: 64x96, центр x=32, линия земли y=86, верх головы ~y=12.
function drawCharacter(p, dir, anim, frame) {
  const P = poseParams(anim, frame);
  const uy = P.bob + (anim === "run" ? (dir === "down" ? 1.5 : dir === "up" ? -1.5 : 0) : 0);
  const ux = anim === "run" ? (dir === "left" ? -2 : dir === "right" ? 2 : 0) : 0;
  const cx = 32 + ux;
  const d = dir === "left" ? -1 : dir === "right" ? 1 : 0;

  // тень (всегда внутри кадра)
  const shr = P.run ? 11 : 13;
  p.ellipse(32, 87.5, shr, 3, C.shadow);

  const hipY = 58 + P.bob * 0.35;
  const footL = { x: 27.5 + P.legL, y: 84 - P.liftL };
  const footR = { x: 36.5 + P.legR, y: 84 - P.liftR };

  const sneaker = (f, facing) => {
    const x = f.x - 5.75;
    const y = f.y - 5;
    p.rrect(x - 0.7, y - 0.7, 13, 7, 3.2, OUT);
    p.rrect(x, y, 11.5, 6, 2.8, C.shoe);
    p.ellipse(f.x + (facing || 0) * 3.5, f.y - 1.2, 3.4, 2, C.shoeLight);
    p.rrect(x - 0.2, f.y + 0.4, 11.9, 2.1, 1, C.sole);
  };

  const leg = (hx, f, col) => {
    const kx = (hx + f.x) / 2 + 1.2;
    const ky = (hipY + f.y) / 2 - P.liftL * 0.1;
    p.capsule(hx, hipY, kx, ky, 4.4, OUT);
    p.capsule(f.x, f.y, kx, ky, 4.4, OUT);
    p.capsule(hx, hipY, kx, ky, 3.8, col);
    p.capsule(f.x, f.y, kx, ky, 3.8, col);
    // колено: выцветшее пятно
    p.ellipse(kx, ky, 2.3, 3, C.jeansLight);
    // манжета джинсов
    p.rrect(f.x - 3.6, f.y - 4.5, 7.2, 2.6, 1.2, C.jeansFar);
  };

  const head = (withFace) => {
    const hy = 19.5 + uy;
    const hx = cx;
    // волосы + лицо
    p.fillCircle(hx, hy - 1.4, 7.5, OUT);
    p.fillCircle(hx, hy - 1.4, 6.9, C.hair);
    if (withFace && (dir === "down" || dir === "left" || dir === "right")) {
      const fx = dir === "down" ? hx : hx + d * 1.8;
      p.fillCircle(fx, hy + 1.3, 5.7, C.skin);
      if (dir === "down") {
        p.fillCircle(fx - 2.4, hy + 1.7, 1.05, C.eye);
        p.fillCircle(fx + 2.4, hy + 1.7, 1.05, C.eye);
        p.capsule(fx - 1.8, hy + 4.9, fx + 1.8, hy + 4.9, 0.55, C.mouth);
      } else {
        p.fillCircle(fx + d * 3.2, hy + 2, 1.05, C.eye);
        p.fillCircle(fx - d * 0.8, hy + 2.4, 1.5, C.skinShade); // ухо
      }
    }
    // растрёпанные пряди (лежат на макушке, не «рога»)
    p.capsule(hx - 4.5, hy - 5.6, hx - 6.8, hy - 7.8, 1.6, C.hairDark);
    p.capsule(hx - 0.5, hy - 6.8, hx + 0.8, hy - 9.8, 1.6, C.hairDark);
    p.capsule(hx + 4.5, hy - 5.6, hx + 7, hy - 7.4, 1.6, C.hairDark);
    if (dir === "up") {
      p.fillCircle(hx, hy - 0.4, 6.6, C.hair); // затылок
    }
    if (dir === "left" || dir === "right") {
      p.fillCircle(hx - d * 3.4, hy - 2.4, 4.8, C.hair); // затылок сзади
    }
  };

  const hoodDown = () => {
    // капюшон, собранный на шее (вид спереди)
    p.rrect(cx - 7, 25 + uy, 14, 7.5, 3.5, OUT);
    p.rrect(cx - 6.4, 25.6 + uy, 12.8, 6.4, 3, C.hoodDark);
  };

  const torso = () => {
    // туловище (худи)
    p.rrect(cx - 10.9, 29.5 + uy, 21.8, 31, 6, OUT);
    p.rrect(cx - 10.3, 30.1 + uy, 20.6, 29.8, 5.5, C.hood);
    // выцветшие плечи
    p.ellipse(cx - 6.5, 33.5 + uy, 3.8, 2.8, C.hoodFaded);
    p.ellipse(cx + 6.5, 33.5 + uy, 3.8, 2.8, C.hoodFaded);
    // потёртости
    p.ellipse(cx - 8, 44 + uy, 2.6, 2, C.packWorn);
    p.ellipse(cx + 8, 50 + uy, 2.2, 1.8, C.packWorn);
    // манжета низа
    p.rrect(cx - 10.3, 57 + uy, 20.6, 4, 2.2, C.hoodDark);
  };

  const torsoDetails = () => {
    // карман-кенгуру (приглушённый, широкий, низкий)
    p.rrect(cx - 5.5, 50 + uy, 11, 6.8, 2.4, C.hoodDark);
    p.capsule(cx - 4.5, 50.4 + uy, cx + 4.5, 50.4 + uy, 0.5, C.hood); // край кармана
    // шнурки
    p.capsule(cx - 2.4, 31 + uy, cx - 2.4, 37 + uy, 0.75, C.string);
    p.capsule(cx + 2.4, 31 + uy, cx + 2.4, 37 + uy, 0.75, C.string);
    // ремешки рюкзака на плечах
    p.capsule(cx - 6.2, 32 + uy, cx - 6.2, 46 + uy, 1.6, OUT);
    p.capsule(cx + 6.2, 32 + uy, cx + 6.2, 46 + uy, 1.6, OUT);
    p.capsule(cx - 6.2, 32 + uy, cx - 6.2, 46 + uy, 1.2, C.strap);
    p.capsule(cx + 6.2, 32 + uy, cx + 6.2, 46 + uy, 1.2, C.strap);
  };

  const arm = (sx, hx, hy, col) => {
    p.capsule(sx, 33.5 + uy, hx, hy, 3.8, OUT);
    p.capsule(sx, 33.5 + uy, hx, hy, 3.2, col);
    p.fillCircle(hx, hy, 2.4, OUT);
    p.fillCircle(hx, hy, 1.9, C.skin); // кисть
  };

  const backpackUp = () => {
    // старый небольшой рюкзак (вид сзади)
    const bx = cx - 9.5;
    const by = 33 + uy;
    p.rrect(bx - 0.7, by - 0.7, 20.4, 22.4, 5, OUT);
    p.rrect(bx, by, 19, 21, 4.5, C.pack);
    p.rrect(bx, by, 19, 9.5, 4.5, C.packDark); // клапан
    p.rrect(bx + 2, by + 14.5, 6.5, 6, 2, C.packDark); // карман
    p.rrect(bx + 11.5, by + 13.5, 6, 7, 2, C.packDark);
    p.capsule(bx + 4.5, by + 9.5, bx + 14.5, by + 9.5, 1, C.strap); // пояс клапана
    p.ellipse(bx + 4, by + 18, 2.4, 1.8, C.packWorn); // потёртость
    // ремешки поверх плеч
    p.capsule(cx - 6.2, 31.5 + uy, cx - 6.2, 38 + uy, 1.6, OUT);
    p.capsule(cx + 6.2, 31.5 + uy, cx + 6.2, 38 + uy, 1.6, OUT);
    p.capsule(cx - 6.2, 31.5 + uy, cx - 6.2, 38 + uy, 1.2, C.strap);
    p.capsule(cx + 6.2, 31.5 + uy, cx + 6.2, 38 + uy, 1.2, C.strap);
  };

  const hoodUp = () => {
    // капюшон на спине (вид сзади)
    p.rrect(cx - 7.6, 23.5 + uy, 15.2, 12, 5.5, OUT);
    p.rrect(cx - 7, 24.1 + uy, 14, 10.8, 5, C.hoodDark);
    p.capsule(cx - 3.5, 28.5 + uy, cx + 3.5, 29 + uy, 0.85, C.hood); // складка
  };

  const backpackSide = () => {
    // вид сбоку: рюкзак на «задней» стороне, прижат к спине
    const bx = cx - d * 10.5;
    const by = 32.5 + uy;
    p.rrect(bx - 0.7, by - 0.7, 10.4, 21.4, 4.5, OUT);
    p.rrect(bx, by, 9, 20, 4, C.pack);
    p.rrect(bx, by, 9, 8, 4, C.packDark);
    p.capsule(bx + 1.5, by + 8, bx + 7.5, by + 8, 0.8, C.strap); // пояс клапана
    p.ellipse(bx + 3.5, by + 14.5, 1.8, 1.5, C.packWorn);
    // ремень через плечо
    p.capsule(cx - d * 3, 31.5 + uy, cx + d * 1.5, 40 + uy, 1.3, C.strap);
  };

  const hoodSide = () => {
    p.rrect(cx - d * 8 - 4.5, 25 + uy, 9, 7.5, 3.5, OUT);
    p.rrect(cx - d * 8 - 3.9, 25.6 + uy, 7.8, 6.3, 3, C.hoodDark);
  };

  if (dir === "down") {
    hoodDown();
    leg(28.5 + ux * 0.3, footL, C.jeans);
    leg(35.5 + ux * 0.3, footR, C.jeans);
    sneaker(footL, 0);
    sneaker(footR, 0);
    torso();
    torsoDetails();
    arm(cx - 8.8, cx - 10.8 + P.armL, 55 + uy * 0.9 - (P.run ? 4 : 0), C.hoodArm);
    arm(cx + 8.8, cx + 10.8 + P.armR, 55 + uy * 0.9 - (P.run ? 4 : 0), C.hoodArm);
    head(true);
  } else if (dir === "up") {
    leg(28.5 + ux * 0.3, footL, C.jeans);
    leg(35.5 + ux * 0.3, footR, C.jeans);
    sneaker(footL, 0);
    sneaker(footR, 0);
    torso();
    backpackUp();
    hoodUp();
    arm(cx - 8.8, cx - 10.8 + P.armL, 55 + uy * 0.9 - (P.run ? 4 : 0), C.hoodArm);
    arm(cx + 8.8, cx + 10.8 + P.armR, 55 + uy * 0.9 - (P.run ? 4 : 0), C.hoodArm);
    head(false);
  } else {
    // боковой вид (left / right)
    const nearLeg = d === 1 ? footL : footR;
    const farLeg = d === 1 ? footR : footL;
    const nearHip = d === 1 ? 28.5 : 35.5;
    const farHip = d === 1 ? 35.5 : 28.5;
    // дальняя рука (за телом)
    arm(cx - d * 1.5, cx - d * 4.5 + P.armR * 0.8, 54 + uy * 0.9, C.hoodDark);
    leg(farHip + ux * 0.3, farLeg, C.jeansFar);
    sneaker(farLeg, d);
    torso();
    backpackSide();
    hoodSide();
    leg(nearHip + ux * 0.3, nearLeg, C.jeans);
    sneaker(nearLeg, d);
    arm(cx - d * 1.5, cx - d * 4.5 + P.armL * 0.9, 54 + uy * 0.9 - (P.run ? 4 : 0), C.hoodArm);
    head(true);
  }
}

/* ================= сборка листа ================= */

const FW = 64;
const FH = 96;
const COLS = 9; // idle, walk1..4, run1..4
const ROWS = 4;
const DIRS = ["down", "up", "left", "right"];

// Отладка: `node render-sheet.js --debug <idx>` — один кадр, увеличенный в 8 раз
const dbgIdx = process.argv.includes("--debug")
  ? Math.min(35, Math.max(0, Number(process.argv[process.argv.indexOf("--debug") + 1]) || 0))
  : -1;

const sheet = new Layer(COLS * FW, ROWS * FH);

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const idx = r * COLS + c;
    const anim = c === 0 ? "idle" : c <= 4 ? "walk" : "run";
    const frame = c === 0 ? 0 : c <= 4 ? c - 1 : c - 5;
    const p = makePainter(FW, FH);
    drawCharacter(p, DIRS[r], anim, frame);
    if (dbgIdx === idx) {
      // один кадр на светлом фоне, увеличенный в 4 раза (256x384) — для осмотра
      const S = 4;
      const big = new Layer(FW * S, FH * S);
      const rgba = p.toRGBA(); // буфер SS-масштаба: (FW*SS) x (FH*SS)
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
      const out = path.join(__dirname, "..", "..", "public", "sprites", `debug-frame-${idx}.png`);
      fs.writeFileSync(out, encodePNG(FW * S, FH * S, big.toRGBA()));
      console.log(`debug-frame-${idx}.png (dir=${DIRS[r]}, col=${c}) ${FW * S}x${FH * S}`);
      process.exit(0);
    }
    blitFrame(sheet.d, sheet.w, sheet.h, p.toRGBA(), FW, FH, c * FW, r * FH);
  }
}

const outDir = path.join(__dirname, "..", "..", "public", "sprites");
fs.mkdirSync(outDir, { recursive: true });

// 1) сам лист — чистый, прозрачный, без подписей
const sheetPNG = encodePNG(sheet.w, sheet.h, sheet.toRGBA());
fs.writeFileSync(path.join(outDir, "character-sheet.png"), sheetPNG);
console.log("character-sheet.png", sheetPNG.length, "bytes", `(${sheet.w}x${sheet.h})`);

// 2) превью на «шахматке» с сеткой — только для контроля (не ассет)
const prev = new Layer(sheet.w, sheet.h);
for (let y = 0; y < sheet.h; y++) {
  for (let x = 0; x < sheet.w; x++) {
    const light = ((x >> 3) + (y >> 3)) % 2 === 0;
    const i = (y * sheet.w + x) * 4;
    const v = light ? 226 : 210;
    prev.d[i] = v; prev.d[i + 1] = v; prev.d[i + 2] = v; prev.d[i + 3] = 255;
  }
}
blitFrame(prev.d, prev.w, prev.h, sheet.toRGBA(), sheet.w, sheet.h, 0, 0, 1);
// сетка
const gCol = [90, 90, 100, 255];
for (let c = 0; c <= COLS; c++)
  for (let y = 0; y < sheet.h; y++) prev.blend(c * FW, y, gCol[0], gCol[1], gCol[2], 120);
for (let r = 0; r <= ROWS; r++)
  for (let x = 0; x < sheet.w; x++) prev.blend(x, r * FH, gCol[0], gCol[1], gCol[2], 120);
const prevPNG = encodePNG(prev.w, prev.h, prev.toRGBA());
fs.writeFileSync(path.join(outDir, "character-sheet-preview.png"), prevPNG);
console.log("character-sheet-preview.png", prevPNG.length, "bytes");

// 3) метаданные для интеграции в игру
const meta = {
  file: "character-sheet.png",
  frameWidth: FW,
  frameHeight: FH,
  columns: COLS,
  rows: ROWS,
  directions: DIRS,
  columnsOrder: ["idle", "walk1", "walk2", "walk3", "walk4", "run1", "run2", "run3", "run4"],
  sheetWidth: sheet.w,
  sheetHeight: sheet.h,
  transparent: true,
  groundLineY: 86,
  notes: "Каждый ряд — направление; колонка 0 — idle, 1-4 — walk, 5-8 — run.",
};
fs.writeFileSync(path.join(outDir, "character-meta.json"), JSON.stringify(meta, null, 2));
console.log("character-meta.json ok");
