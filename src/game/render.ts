// Отрисовка мира v2:
// — предвычисленные текстуры (грунт 2x, здания 2x, миникарта) — один раз;
// — динамический кадр: камера + culling видимой области, depth-sort по линии опоры
//   (здания, декор, машины, NPC, игрок), ночь с живым светом, дождь.

import {
  BUILDINGS,
  CROSSWALKS,
  DECOR,
  GRID_H,
  GRID_W,
  MANHOLES,
  PUDDLES,
  TILE,
  buildGrid,
} from "./world";
import type { Building, Decor, Tile } from "./world";
import type { Facing, GameState, Weather } from "./types";
import {
  ANCHOR_X,
  ANCHOR_Y,
  CHAR_H,
  CHAR_W,
  DIR_ROW,
  FOOT_X,
  FOOT_Y,
  FRAME_H,
  FRAME_W,
  NPC_H,
  NPC_W,
  frameColumn,
  getHeroSheet,
  getNpcSheet,
  npcRow,
  sheetsReady,
} from "./sprites";
import type { CharMode } from "./sprites";
import type { Npc, Vehicle } from "./entities";
import type { Camera } from "./camera";

export interface PlayerColors {
  jacket: string;
  pants: string;
  shoes: string;
  hat: { color: string; kind: string } | null;
}

export interface PlayerInfo {
  x: number; // плавная позиция в тайлах
  y: number;
  dir: Facing;
  mode: CharMode;
  riding: boolean;
  colors: PlayerColors;
}

export interface ViewportInfo {
  vw: number; // css px
  vh: number;
  dpr: number;
}

export interface FrameInfo {
  state: GameState;
  path: [number, number][];
  hover: [number, number] | null;
  target: { x: number; y: number } | null;
  player: PlayerInfo;
  weather: Weather;
  npcs: Npc[];
  vehicles: Vehicle[];
  cam: Camera;
  vp: ViewportInfo;
}

export interface BuildingArt {
  b: Building;
  canvas: HTMLCanvasElement;
  ox: number; // world px, левый верх канваса
  oy: number;
  dw: number; // world px
  dh: number;
  baseY: number; // линия опоры для depth-sort (нижняя грань)
  rect: [number, number, number, number];
  lit: { x: number; y: number; w: number; h: number }[]; // окна для ночного света
  sign: { x: number; y: number; w: number; h: number };
  roofLight: { x: number; y: number } | null; // мигалка (полиция)
  doorC: { x: number; y: number } | null; // центр двери (свет в дверях)
}

export interface CityTextures {
  ground: HTMLCanvasElement;
  buildings: BuildingArt[];
  minimapBase: HTMLCanvasElement;
}

const WORLD_W = GRID_W * TILE;
const WORLD_H = GRID_H * TILE;
const TX = 2; // текстурный масштаб (чёткость при dpr 2)

const GRID = buildGrid();

/* ---------- утилиты ---------- */

function rnd(x: number, y: number, salt: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function intersects(
  ax0: number, ay0: number, ax1: number, ay1: number,
  bx0: number, by0: number, bx1: number, by1: number
): boolean {
  return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
}

/* ================================================================
 *  ГРУНТ: дорога, тротуар, трава, зебры, люки, лужи, парковка
 * ================================================================ */

function paintGroundTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: Tile
): void {
  const px = x * TILE;
  const py = y * TILE;
  switch (t.base) {
    case "grass": {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#49683e" : "#44633a";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i) * 28), py + Math.floor(rnd(x, y, i + 31) * 28), 2, 2);
      }
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i + 61) * 28), py + Math.floor(rnd(x, y, i + 91) * 28), 2, 1);
      }
      break;
    }
    case "dirt": {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#4a443c" : "#463f38";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i) * 29), py + Math.floor(rnd(x, y, i + 17) * 29), 2, 2);
      }
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 2; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i + 47) * 29), py + Math.floor(rnd(x, y, i + 77) * 29), 2, 1);
      }
      break;
    }
    case "road": {
      ctx.fillStyle = "#34373d";
      ctx.fillRect(px, py, TILE, TILE);
      // битумная фактура
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      for (let i = 0; i < 6; i++) {
        const s = 1 + Math.floor(rnd(x, y, i) * 2);
        ctx.fillRect(px + Math.floor(rnd(x, y, i + 21) * 29), py + Math.floor(rnd(x, y, i + 51) * 29), s, s);
      }
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i + 81) * 29), py + Math.floor(rnd(x, y, i + 111) * 29), 1, 1);
      }
      // большие тёмные пятна (ремонт/выгорание)
      if (rnd(x, y, 7) > 0.82) {
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        ctx.beginPath();
        ctx.ellipse(px + 10 + rnd(x, y, 8) * 14, py + 10 + rnd(x, y, 9) * 14, 8 + rnd(x, y, 10) * 6, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "sidewalk": {
      ctx.fillStyle = "#6f747c";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i) * 28), py + Math.floor(rnd(x, y, i + 41) * 28), 2, 2);
      }
      // плита: рамка + диагональный стык
      ctx.strokeStyle = "rgba(0,0,0,0.20)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(px + 0.5, py + TILE - 0.5);
      ctx.lineTo(px + TILE - 0.5, py + 0.5);
      ctx.stroke();
      if (rnd(x, y, 5) > 0.9) {
        // трещина
        ctx.strokeStyle = "rgba(0,0,0,0.30)";
        ctx.beginPath();
        ctx.moveTo(px + 4 + rnd(x, y, 6) * 6, py + 3);
        ctx.lineTo(px + 12 + rnd(x, y, 7) * 6, py + 14);
        ctx.lineTo(px + 10, py + 26);
        ctx.stroke();
      }
      break;
    }
    default: {
      // building-база: бетонный «фартук»
      ctx.fillStyle = "#3b3e44";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(px + Math.floor(rnd(x, y, i) * 28), py + Math.floor(rnd(x, y, i + 27) * 28), 2, 2);
      }
    }
  }
}

function paintRoadDetails(ctx: CanvasRenderingContext2D): void {
  const isRoad = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && GRID[y][x].base === "road";

  // бордюр: тёмная грань + светлая кромка на границе дорога/не-дорога
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!isRoad(x, y)) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (!isRoad(x, y - 1)) {
        ctx.fillStyle = "#202329";
        ctx.fillRect(px, py, TILE, 3);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(px, py + 3, TILE, 1);
      }
      if (!isRoad(x, y + 1)) {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(px, py + TILE - 4, TILE, 1);
        ctx.fillStyle = "#202329";
        ctx.fillRect(px, py + TILE - 3, TILE, 3);
      }
      if (!isRoad(x - 1, y)) {
        ctx.fillStyle = "#202329";
        ctx.fillRect(px, py, 3, TILE);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(px + 3, py, 1, TILE);
      }
      if (!isRoad(x + 1, y)) {
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fillRect(px + TILE - 4, py, 1, TILE);
        ctx.fillStyle = "#202329";
        ctx.fillRect(px + TILE - 3, py, 3, TILE);
      }
    }
  }

  // краевые белые линии
  ctx.strokeStyle = "rgba(226,228,235,0.40)";
  ctx.lineWidth = 2;
  for (const [y0, y1] of [
    [8, 10],
    [30, 32],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(0, y0 * TILE + 3.5);
    ctx.lineTo(WORLD_W, y0 * TILE + 3.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y1 * TILE - 3.5);
    ctx.lineTo(WORLD_W, y1 * TILE - 3.5);
    ctx.stroke();
  }
  for (const [x0, x1] of [
    [22, 24],
    [54, 56],
    [78, 80],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.moveTo(x0 * TILE + 3.5, 0);
    ctx.lineTo(x0 * TILE + 3.5, WORLD_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 * TILE - 3.5, 0);
    ctx.lineTo(x1 * TILE - 3.5, WORLD_H);
    ctx.stroke();
  }

  // осевые жёлтые пунктиры
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(206,173,66,0.66)";
  for (const y of [9, 31]) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE - 1);
    ctx.lineTo(WORLD_W, y * TILE - 1);
    ctx.stroke();
  }
  for (const x of [23, 55, 79]) {
    ctx.beginPath();
    ctx.moveTo(x * TILE - 1, 0);
    ctx.lineTo(x * TILE - 1, WORLD_H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // трещины на асфальте (детально, детерминированно)
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const cx = 30 + rnd(i, 3, 1) * (WORLD_W - 60);
    const cy = 30 + rnd(i, 9, 2) * (WORLD_H - 60);
    if (Math.floor(cy / TILE) === 7 || Math.floor(cy / TILE) === 10) continue;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let px2 = cx;
    let py2 = cy;
    for (let s = 0; s < 3; s++) {
      px2 += (rnd(i, s, 5) - 0.5) * 22;
      py2 += (rnd(i, s, 6) - 0.5) * 22;
      ctx.lineTo(px2, py2);
    }
    ctx.stroke();
  }
}

function paintCrosswalks(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(232,234,240,0.62)";
  for (const c of CROSSWALKS) {
    const px = c.x * TILE;
    const py = c.y * TILE;
    if (c.dir === "v") {
      // переход через горизонтальную дорогу: горизонтальные полосы
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 4, py + 2 + i * 7.5, 24, 4.5);
    } else {
      for (let i = 0; i < 4; i++) ctx.fillRect(px + 2 + i * 7.5, py + 4, 4.5, 24);
    }
  }
}

function paintManholes(ctx: CanvasRenderingContext2D): void {
  for (const [x, y] of MANHOLES) {
    const cx = x * TILE + 16;
    const cy = y * TILE + 16;
    ctx.fillStyle = "#23262c";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy + i * 3.4);
      ctx.lineTo(cx + 7, cy + i * 3.4);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (const [bx, by] of [
      [-7, -6], [7, -6], [-7, 6], [7, 6],
    ]) ctx.fillRect(cx + bx - 0.5, cy + by - 0.5, 1.6, 1.6);
  }
}

function paintPuddles(ctx: CanvasRenderingContext2D): void {
  for (const [x, y] of PUDDLES) {
    const cx = x * TILE + 16;
    const cy = y * TILE + 16;
    const rx = 11 + rnd(x, y, 1) * 6;
    const ry = 4.5 + rnd(x, y, 2) * 2.5;
    const rot = (rnd(x, y, 3) - 0.5) * 0.7;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(38,48,68,0.55)";
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,180,220,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(170,200,235,0.10)";
    ctx.fillRect(-rx * 0.5, -ry * 0.4, rx * 0.9, 1.6);
    ctx.restore();
  }
}

function paintParking(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(226,228,235,0.42)";
  ctx.lineWidth = 1.5;
  for (const d of DECOR) {
    if (d.kind !== "parking") continue;
    const px = d.x * TILE;
    const py = d.y * TILE;
    ctx.strokeRect(px - 13.5, py + 1.5, 27, 27);
    ctx.beginPath();
    ctx.moveTo(px + 1, py + 4);
    ctx.lineTo(px + 1, py + 10);
    ctx.stroke();
  }
}

export function makeGroundTexture(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = WORLD_W * TX;
  c.height = WORLD_H * TX;
  const ctx = c.getContext("2d")!;
  ctx.scale(TX, TX);

  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) paintGroundTile(ctx, x, y, GRID[y][x]);

  paintRoadDetails(ctx);
  paintCrosswalks(ctx);
  paintManholes(ctx);
  paintPuddles(ctx);
  paintParking(ctx);
  return c;
}

/* ================================================================
 *  ЗДАНИЯ: крыша, фасад, окна, витрины, вывески — канвас на здание
 * ================================================================ */

const roofH = (bh: number) => (bh >= 3 ? 26 : 18);

const WIN_COLOR = "#222a36";
const GLASS_SHOP = "#1f2833";

function buildingArt(b: Building): BuildingArt {
  const wPx = b.w * TILE;
  const hPx = b.h * TILE;
  const rh = roofH(b.h);
  const padX = 12;
  const padTop = 4;
  const padBot = 4;
  const cw = wPx + padX * 2;
  const ch = hPx + padTop + padBot + 0;
  const ox = b.x * TILE - padX;
  const oy = b.y * TILE - padTop;

  const c = document.createElement("canvas");
  c.width = cw * TX;
  c.height = ch * TX;
  const ctx = c.getContext("2d")!;
  ctx.scale(TX, TX);
  const L = (x: number) => x - ox; // world -> local
  const T = (y: number) => y - oy;

  const lit: BuildingArt["lit"] = [];
  const seed = b.x * 7 + b.y * 13;

  /* --- крыша --- */
  ctx.fillStyle = b.roof;
  ctx.fillRect(L(b.x * TILE), T(b.y * TILE), wPx, rh);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(L(b.x * TILE), T(b.y * TILE), wPx, 2);
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(L(b.x * TILE), T(b.y * TILE + rh - 4), wPx, 4);
  // швы крыши
  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  for (let xx = 1; xx < b.w; xx++) {
    ctx.beginPath();
    ctx.moveTo(L(b.x * TILE + xx * TILE), T(b.y * TILE + 1));
    ctx.lineTo(L(b.x * TILE + xx * TILE), T(b.y * TILE + rh - 4));
    ctx.stroke();
  }
  // кондиционер
  if (b.w >= 3) {
    const ax = L(b.x * TILE + 14 + rnd(b.x, b.y, 1) * (wPx - 44));
    const ay = T(b.y * TILE + 5);
    ctx.fillStyle = "#8f959d";
    rrect(ctx, ax, ay, 18, 12, 2);
    ctx.fill();
    ctx.fillStyle = "#6a7078";
    ctx.beginPath();
    ctx.arc(ax + 6, ay + 6, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.strokeRect(ax + 0.5, ay + 0.5, 17, 11);
  }
  // антенна
  if (b.id === "office" || b.id === "office2" || b.kind === "house") {
    const ax = L((b.x + b.w - 0.7) * TILE);
    ctx.strokeStyle = "#2c3138";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, T(b.y * TILE + 2));
    ctx.lineTo(ax, T(b.y * TILE - 12));
    ctx.stroke();
    ctx.fillStyle = "#c9503a";
    ctx.beginPath();
    ctx.arc(ax, T(b.y * TILE - 13), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- фасад --- */
  const facadeTop = b.y * TILE + rh;
  ctx.fillStyle = b.wall;
  ctx.fillRect(L(b.x * TILE), T(facadeTop), wPx, hPx - rh);
  // лёгкий градиент: темнее книзу
  const wg = ctx.createLinearGradient(0, T(facadeTop), 0, T(b.y * TILE + hPx));
  wg.addColorStop(0, "rgba(255,255,255,0.05)");
  wg.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = wg;
  ctx.fillRect(L(b.x * TILE), T(facadeTop), wPx, hPx - rh);
  // вертикальные тени у краёв
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(L(b.x * TILE), T(facadeTop), 3, hPx - rh);
  ctx.fillRect(L((b.x + b.w) * TILE - 3), T(facadeTop), 3, hPx - rh);
  // штукатурка: тонкие потёки
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  for (let i = 0; i < b.w * 3; i++) {
    const sx = L(b.x * TILE + 4 + rnd(b.x, i, 31) * (wPx - 8));
    const sy = T(facadeTop + 4 + rnd(b.x, i, 32) * (hPx - rh - 10));
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (rnd(b.x, i, 33) - 0.5) * 3, sy + 6 + rnd(b.x, i, 34) * 8);
    ctx.stroke();
  }
  // труба на углу
  const pipeX = L(b.x * TILE + (b.x % 2 === 0 ? 5 : wPx - 6));
  ctx.fillStyle = "#565c66";
  ctx.fillRect(pipeX, T(b.y * TILE + 4), 3, hPx - rh - 6);
  ctx.fillStyle = "#454a52";
  ctx.fillRect(pipeX - 1, T(b.y * TILE + 4), 5, 3);

  /* --- окна и витрины --- */
  const doorRow = b.doorY;
  const abandoned = b.kind === "house" && b.id !== "house10";

  const drawWindow = (wx: number, wy: number, opts?: { curtain?: boolean }) => {
    // wx, wy — world px угла окна 12x14
    const wxl = L(wx);
    const wyl = T(wy);
    ctx.fillStyle = "#171d26";
    ctx.fillRect(wxl - 1.5, wyl - 1.5, 15, 17);
    ctx.fillStyle = WIN_COLOR;
    ctx.fillRect(wxl, wyl, 12, 14);
    if (opts?.curtain) {
      ctx.fillStyle = "rgba(122,96,72,0.85)";
      ctx.fillRect(wxl + 1, wyl + 1, 5, 12);
    } else {
      ctx.strokeStyle = "rgba(190,215,235,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wxl + 2.5, wyl + 11);
      ctx.lineTo(wxl + 9.5, wyl + 3);
      ctx.stroke();
    }
    ctx.fillStyle = "#8b929c";
    ctx.fillRect(wxl - 1.5, wyl + 14, 15, 2);
    // переплёт
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(wxl + 0.5, wyl + 0.5, 11, 13);
    lit.push({ x: wx, y: wy, w: 12, h: 14 });
  };

  for (let yy = b.y; yy < b.y + b.h; yy++) {
    for (let xx = b.x; xx < b.x + b.w; xx++) {
      if (xx === b.doorX && yy === b.doorY) continue;
      const wy0 = yy * TILE;
      const wx0 = xx * TILE;
      if (wy0 + 9 <= b.y * TILE + rh) continue; // под крышей

      if (yy === doorRow && b.kind !== "house") {
        // витринный ряд
        const gx = L(wx0 + 4);
        const gy = T(wy0 + 5);
        ctx.fillStyle = "#141a22";
        ctx.fillRect(gx - 1.5, gy - 1.5, 27, 26);
        ctx.fillStyle = GLASS_SHOP;
        ctx.fillRect(gx, gy, 24, 23);
        if (b.kind === "work" && (b.jobs.includes("mechanic1") || b.jobs.includes("loading"))) {
          // роллет
          ctx.fillStyle = "#697077";
          ctx.fillRect(gx + 1, gy + 1, 22, 21);
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(gx + 1, gy + 1 + i * 3.5);
            ctx.lineTo(gx + 23, gy + 1 + i * 3.5);
            ctx.stroke();
          }
        } else if (b.kind === "work") {
          // стекло (офисы, клиника, интернет)
          ctx.strokeStyle = "rgba(150,190,220,0.20)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(gx + 4, gy + 18);
          ctx.lineTo(gx + 14, gy + 5);
          ctx.stroke();
        } else {
          // магазин: полки в стекле
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(gx + 2, gy + 7, 20, 2);
          ctx.fillRect(gx + 2, gy + 14, 20, 2);
          ctx.fillStyle = "rgba(160,120,80,0.25)";
          ctx.fillRect(gx + 3, gy + 10, 4, 4);
          ctx.fillRect(gx + 10, gy + 3, 5, 4);
          ctx.fillRect(gx + 17, gy + 11, 4, 4);
        }
        lit.push({ x: wx0 + 4, y: wy0 + 5, w: 24, h: 23 });
        // маркиза над витриной
        if (b.kind === "shop" || b.id === "cafe" || b.id === "cafe2" || b.id === "cafe3") {
          const aw = b.kind === "shop" ? "#3f7d4f" : "#a04038";
          ctx.fillStyle = aw;
          ctx.fillRect(gx - 1, T(wy0) - 1, 26, 6);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          for (let i = 0; i < 4; i += 2) ctx.fillRect(gx - 1 + i * 6.5, T(wy0) - 1, 6.5, 6);
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(gx - 1, T(wy0) + 5, 26, 1.5);
        }
        continue;
      }

      // обычные окна
      if (abandoned) {
        // заколоченные
        ctx.fillStyle = "#201d1a";
        ctx.fillRect(L(wx0 + 10) - 1.5, T(wy0 + 9) - 1.5, 15, 17);
        ctx.fillStyle = "#2a2622";
        ctx.fillRect(L(wx0 + 10), T(wy0 + 9), 12, 14);
        ctx.strokeStyle = "#4a423a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(L(wx0 + 9), T(wy0 + 10));
        ctx.lineTo(L(wx0 + 23), T(wy0 + 15));
        ctx.moveTo(L(wx0 + 9), T(wy0 + 21));
        ctx.lineTo(L(wx0 + 23), T(wy0 + 11));
        ctx.stroke();
        continue;
      }
      drawWindow(wx0 + 10, wy0 + 9, { curtain: (b.kind === "shelter" || b.kind === "house") && rnd(xx, yy, 3) > 0.5 });
    }
  }

  /* --- дверь --- */
  let doorC: { x: number; y: number } | null = null;
  if (b.hasDoor) {
    const dx = b.doorX * TILE;
    const dy = b.doorY * TILE;
    // ступенька
    ctx.fillStyle = "#7d838c";
    ctx.fillRect(L(dx + 3), T(dy + TILE - 5), 26, 5);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(L(dx + 3), T(dy + TILE - 1), 26, 1.5);
    // козырёк
    ctx.fillStyle = "rgba(20,22,26,0.85)";
    ctx.fillRect(L(dx + 5), T(dy + 3), 22, 4);
    // полотно
    const doorColor =
      b.kind === "shop"
        ? "#6b4a2f"
        : b.id === "cafe" || b.id === "cafe2" || b.id === "cafe3"
          ? "#7a4a3a"
          : b.kind === "shelter"
            ? "#5a5f4a"
            : b.kind === "police"
              ? "#2c3648"
              : b.kind === "house"
                ? "#5a4634"
                : "#3a4a5a";
    ctx.fillStyle = "#11141a";
    ctx.fillRect(L(dx + 7), T(dy + 5), 18, 23);
    ctx.fillStyle = doorColor;
    ctx.fillRect(L(dx + 8.5), T(dy + 6.5), 15, 21);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(L(dx + 10), T(dy + 9), 5, 15);
    ctx.strokeRect(L(dx + 16.5), T(dy + 9), 5, 15);
    ctx.fillStyle = "#d8b56a";
    ctx.beginPath();
    ctx.arc(L(dx + 21.5), T(dy + 17.5), 1.4, 0, Math.PI * 2);
    ctx.fill();
    doorC = { x: dx + 16, y: dy + TILE - 2 };
    lit.push({ x: dx + 8.5, y: dy + 6.5, w: 15, h: 21 });
  }

  /* --- вывеска на карнизе --- */
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameW = ctx.measureText(b.name).width;
  const signW = Math.min(nameW + 18, wPx - 6);
  const signX = b.x * TILE + wPx / 2;
  const signY = b.y * TILE + rh / 2 - 1;
  const bandColor =
    b.kind === "police" ? "rgba(28,36,54,0.92)" : b.kind === "shop"
      ? "rgba(30,48,34,0.88)"
      : b.id === "cafe" || b.id === "cafe2" || b.id === "cafe3"
        ? "rgba(56,28,26,0.88)"
        : "rgba(18,20,25,0.82)";
  ctx.fillStyle = bandColor;
  rrect(ctx, L(signX - signW / 2), T(signY - 8), signW, 15, 4);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(b.name, L(signX), T(signY));
  ctx.shadowBlur = 0;
  // крест для клиник/больницы
  if (b.id === "clinic" || b.id === "clinic2" || b.id === "hospital") {
    const cxr = L(signX - signW / 2 - 8);
    ctx.fillStyle = "#d8453b";
    ctx.fillRect(cxr - 1.5, T(signY - 4), 3, 8);
    ctx.fillRect(cxr - 4, T(signY - 1.5), 8, 3);
  }

  const roofLight =
    b.kind === "police"
      ? { x: (b.x + b.w / 2) * TILE, y: b.y * TILE + rh / 2 - 4 }
      : null;

  return {
    b,
    canvas: c,
    ox,
    oy,
    dw: cw,
    dh: ch,
    baseY: (b.y + b.h) * TILE,
    rect: [ox, oy, ox + cw, oy + ch],
    lit: lit.slice(0, 14),
    sign: { x: signX - signW / 2, y: signY - 8, w: signW, h: 15 },
    roofLight,
    doorC,
  };
}

/* ================================================================
 *  ДЕКОР: фонари, знаки, деревья, лавки, машины на парковке…
 *  Каждый элемент рисуется в world-координатах, база — линия опоры.
 * ================================================================ */

function groundShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, cy + 1, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, px: number, py: number, v: number): void {
  groundShadow(ctx, px + 16, py + 26, 15);
  ctx.fillStyle = "#5b432c";
  ctx.fillRect(px + 13.5, py + 14, 5, 13);
  const g1 = ["#2c4529", "#2f4a2b", "#33512e"][v % 3];
  const g2 = ["#3a5c36", "#3c5c37", "#416239"][v % 3];
  const g3 = ["#46703d", "#47703f", "#4c7a42"][v % 3];
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(px + 16, py + 10, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(px + 11, py + 12, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g3;
  ctx.beginPath();
  ctx.arc(px + 21, py + 7, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < 4; i++)
    ctx.fillRect(px + 9 + rnd(px, py, i) * 14, py + 5 + rnd(px, py, i + 9) * 9, 2, 2);
}

function drawBush(ctx: CanvasRenderingContext2D, px: number, py: number, v: number): void {
  groundShadow(ctx, px + 16, py + 24, 10);
  ctx.fillStyle = ["#2f4a2b", "#33512e", "#2c4529"][v % 3];
  ctx.beginPath();
  ctx.arc(px + 11, py + 19, 6, 0, Math.PI * 2);
  ctx.arc(px + 20, py + 18, 6.5, 0, Math.PI * 2);
  ctx.arc(px + 16, py + 14, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(120,180,110,0.25)";
  ctx.beginPath();
  ctx.arc(px + 14, py + 13, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawLamp(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 27, 5);
  ctx.fillStyle = "#3a3f47";
  ctx.fillRect(px + 15, py - 14, 2.5, 40);
  ctx.fillStyle = "#2c3138";
  ctx.fillRect(px + 13.5, py + 23, 5.5, 4);
  ctx.fillStyle = "#454b54";
  rrect(ctx, px + 10, py - 18, 12, 5.5, 2);
  ctx.fill();
  ctx.fillStyle = "#c9b98a";
  ctx.fillRect(px + 11.5, py - 13.5, 9, 2);
}

function drawRoadSign(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#4a5058";
  ctx.fillRect(px + 15.5, py + 2, 2, 25);
  ctx.fillStyle = "#2456a8";
  ctx.beginPath();
  ctx.arc(px + 16.5, py - 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8eaf0";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(px + 16.5, py - 2, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e8eaf0";
  ctx.fillRect(px + 15.6, py - 4, 1.8, 4);
  ctx.beginPath();
  ctx.arc(px + 16.5, py - 5.2, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawHydrant(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 26, 6);
  ctx.fillStyle = "#a83c32";
  rrect(ctx, px + 12, py + 14, 9, 12, 2.5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 16.5, py + 13, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7e2c24";
  ctx.fillRect(px + 11, py + 18, 3, 3.5);
  ctx.fillRect(px + 20.5, py + 18, 3, 3.5);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(px + 13.5, py + 15.5, 2, 8);
}

function drawPole(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 27, 4);
  ctx.fillStyle = "#3d434c";
  ctx.fillRect(px + 15.2, py - 8, 2, 34);
  ctx.fillStyle = "#2f343b";
  ctx.fillRect(px + 11, py - 6, 10, 2.5);
}

function drawBillboard(ctx: CanvasRenderingContext2D, px: number, py: number, v: number): void {
  groundShadow(ctx, px + 16, py + 27, 14);
  ctx.fillStyle = "#4a5058";
  ctx.fillRect(px + 7, py + 8, 2.5, 19);
  ctx.fillRect(px + 24, py + 8, 2.5, 19);
  const cols = ["#a04038", "#3a5a8a", "#3f7d4f"];
  ctx.fillStyle = "#22262c";
  rrect(ctx, px + 2, py - 4, 28, 15, 2);
  ctx.fill();
  ctx.fillStyle = cols[v % 3];
  ctx.fillRect(px + 4, py - 2, 24, 11);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(px + 6, py, 14, 2);
  ctx.fillRect(px + 6, py + 4, 18, 1.6);
}

function drawBag(ctx: CanvasRenderingContext2D, px: number, py: number, v: number): void {
  ctx.fillStyle = "rgba(120,116,108,0.9)";
  rrect(ctx, px + 8, py + 18, 10, 8, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(96,92,86,0.9)";
  rrect(ctx, px + 16, py + 21, 9, 6, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(70,68,64,0.8)";
  rrect(ctx, px + 12, py + 14, 7, 6, 2.5);
  ctx.fill();
  void v;
}

function drawParkedCar(ctx: CanvasRenderingContext2D, px: number, py: number, v: number): void {
  const cols = ["#7a4a3a", "#3a5a7a", "#6a6f76"];
  groundShadow(ctx, px + 16, py + 24, 20);
  const cx = px + 16;
  const cy = py + 14;
  ctx.fillStyle = "#191c21";
  ctx.fillRect(cx - 20, cy - 7, 5, 6);
  ctx.fillRect(cx + 15, cy - 7, 5, 6);
  ctx.fillRect(cx - 20, cy + 5, 5, 6);
  ctx.fillRect(cx + 15, cy + 5, 5, 6);
  ctx.fillStyle = cols[v % 3];
  rrect(ctx, cx - 21, cy - 9, 42, 18, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  rrect(ctx, cx - 21, cy - 9, 42, 7, 5);
  ctx.fill();
  ctx.fillStyle = "#1c232e";
  rrect(ctx, cx - 13, cy - 7, 8, 14, 2);
  ctx.fill();
  rrect(ctx, cx + 6, cy - 7, 7, 14, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(cx - 19, cy - 1.5, 38, 1.5);
}

function drawCrate(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 27, 12);
  ctx.fillStyle = "#8a6a44";
  ctx.fillRect(px + 4, py + 8, 24, 20);
  ctx.fillStyle = "#6d5233";
  ctx.fillRect(px + 4, py + 8, 24, 3);
  ctx.fillRect(px + 4, py + 24, 24, 4);
  ctx.strokeStyle = "#5a4329";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 4.5, py + 8.5, 23, 19);
  ctx.beginPath();
  ctx.moveTo(px + 6, py + 10);
  ctx.lineTo(px + 26, py + 26);
  ctx.moveTo(px + 26, py + 10);
  ctx.lineTo(px + 6, py + 26);
  ctx.stroke();
}

function drawFence(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  ctx.fillStyle = "#5d4c39";
  ctx.fillRect(px, py + 8, TILE, 4);
  ctx.fillRect(px, py + 18, TILE, 4);
  ctx.fillStyle = "#4d3f30";
  ctx.fillRect(px + 5, py + 4, 4, 22);
  ctx.fillRect(px + 23, py + 4, 4, 22);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px, py + 8, TILE, 1.5);
}

function drawBench(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 24, 14);
  ctx.fillStyle = "#5f4023";
  ctx.fillRect(px + 6, py + 14, 4, 9);
  ctx.fillRect(px + 22, py + 14, 4, 9);
  ctx.fillStyle = "#8a5a33";
  ctx.fillRect(px + 4, py + 9, 24, 5);
  ctx.fillRect(px + 4, py + 4, 24, 3.5);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(px + 4, py + 9, 24, 1.5);
}

function drawTrash(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 26, 10);
  ctx.fillStyle = "#4f5d4a";
  rrect(ctx, px + 8, py + 9, 16, 18, 2);
  ctx.fill();
  ctx.fillStyle = "#3f4a3b";
  rrect(ctx, px + 6, py + 5, 20, 5, 2);
  ctx.fill();
  ctx.fillRect(px + 8, py + 14, 16, 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(px + 8, py + 21, 16, 5);
}

function drawAtm(ctx: CanvasRenderingContext2D, px: number, py: number): void {
  groundShadow(ctx, px + 16, py + 26, 11);
  ctx.fillStyle = "#3d434c";
  rrect(ctx, px + 7, py + 4, 18, 23, 3);
  ctx.fill();
  ctx.fillStyle = "#9fd8a8";
  ctx.fillRect(px + 10, py + 7, 12, 8);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(px + 11, py + 8, 5, 2);
  ctx.fillStyle = "#2a2f36";
  ctx.fillRect(px + 10, py + 18, 12, 4);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(px + 8, py + 25, 16, 1.5);
}

function decorBaseY(kind: Decor["kind"]): number {
  switch (kind) {
    case "lamp":
    case "pole":
    case "sign":
      return 28;
    case "hydrant":
      return 26;
    case "bush":
      return 24;
    case "billboard":
      return 27;
    case "bag":
      return 24;
    case "parking":
      return 0; // рисуется в текстуре грунта
    case "parked-car":
      return 24;
  }
}

function drawDecorItem(ctx: CanvasRenderingContext2D, d: Decor): void {
  const px = d.x * TILE;
  const py = d.y * TILE;
  switch (d.kind) {
    case "bush":
      drawBush(ctx, px, py, d.v ?? 0);
      break;
    case "lamp":
      drawLamp(ctx, px, py);
      break;
    case "sign":
      drawRoadSign(ctx, px, py);
      break;
    case "hydrant":
      drawHydrant(ctx, px, py);
      break;
    case "pole":
      drawPole(ctx, px, py);
      break;
    case "billboard":
      drawBillboard(ctx, px, py, d.v ?? 0);
      break;
    case "bag":
      drawBag(ctx, px, py, d.v ?? 0);
      break;
    case "parked-car":
      drawParkedCar(ctx, px, py, d.v ?? 0);
      break;
    case "parking":
      break;
  }
}

/** Объекты, живущие на тайлах сетки (не в DECOR). */
interface GridObj {
  kind: "tree" | "bench" | "trash" | "atm" | "crate" | "fence";
  x: number;
  y: number;
}

const GRID_OBJS: GridObj[] = (() => {
  const out: GridObj[] = [];
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const k = GRID[y][x].kind;
      if (k === "tree" || k === "bench" || k === "trash" || k === "atm" || k === "crate" || k === "fence")
        out.push({ kind: k, x, y });
    }
  return out;
})();

const GRID_OBJ_BASE: Record<GridObj["kind"], number> = {
  tree: 28,
  bench: 25,
  trash: 27,
  atm: 27,
  crate: 27,
  fence: 27,
};

function drawGridObj(ctx: CanvasRenderingContext2D, o: GridObj): void {
  const px = o.x * TILE;
  const py = o.y * TILE;
  switch (o.kind) {
    case "tree":
      drawTree(ctx, px, py, (o.x * 7 + o.y) % 3);
      break;
    case "bench":
      drawBench(ctx, px, py);
      break;
    case "trash":
      drawTrash(ctx, px, py);
      break;
    case "atm":
      drawAtm(ctx, px, py);
      break;
    case "crate":
      drawCrate(ctx, px, py);
      break;
    case "fence":
      drawFence(ctx, px, py);
      break;
  }
}

/* ================================================================
 *  ТРАНСПОРТ
 * ================================================================ */

const CAR_COLORS = ["#6b7076", "#8a3d35", "#3d5a8a", "#c9cdd2", "#4a6a4f", "#54585e"];

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, t: number, dark: number): void {
  const horizontal = v.axis === "h";
  const len = v.kind === "van" ? 58 : 50;
  const wid = v.kind === "van" ? 26 : 24;
  const L = horizontal ? len : wid;
  const W2 = horizontal ? wid : len;
  const cx = v.x;
  const cy = v.y;

  ctx.save();
  ctx.translate(cx, cy);
  if (v.dir === "up") ctx.rotate(Math.PI);
  else if (v.dir === "left") ctx.rotate(-Math.PI / 2);
  else if (v.dir === "right") ctx.rotate(Math.PI / 2);
  // теперь «вперёд» = +x

  // тень
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  rrect(ctx, -L / 2 + 2, -W2 / 2 + 3, L, W2, 7);
  ctx.fill();

  const bodyColor =
    v.kind === "taxi"
      ? "#d9a13b"
      : v.kind === "police"
        ? "#dfe3e8"
        : v.kind === "van"
          ? "#aeb4bb"
          : CAR_COLORS[v.id % CAR_COLORS.length];
  ctx.fillStyle = bodyColor;
  rrect(ctx, -L / 2, -W2 / 2, L, W2, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  rrect(ctx, -L / 2 + 1.5, -W2 / 2 + 1.5, L - 3, W2 / 2 - 2, 5);
  ctx.fill();

  // стёкла
  ctx.fillStyle = "#1c232e";
  rrect(ctx, L * 0.14, -W2 / 2 + 3, L * 0.2, W2 - 6, 2.5); // лобовое
  ctx.fill();
  rrect(ctx, -L * 0.36, -W2 / 2 + 3, L * 0.14, W2 - 6, 2.5); // заднее
  ctx.fill();
  // крыша
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  rrect(ctx, -L * 0.2, -W2 / 2 + 4, L * 0.3, W2 - 8, 3);
  ctx.fill();

  if (v.kind === "police") {
    ctx.fillStyle = "#2c3e6b";
    ctx.fillRect(-L / 2 + 4, -W2 / 2, L - 8, 3.5);
    ctx.fillRect(-L / 2 + 4, W2 / 2 - 3.5, L - 8, 3.5);
    // мигалка
    const blink = Math.floor(t / 220) % 2 === 0;
    ctx.fillStyle = blink ? "#e0453a" : "#5a6470";
    ctx.fillRect(-4, -5, 5, 10);
    ctx.fillStyle = blink ? "#3b6fd4" : "#39445a";
    ctx.fillRect(1, -5, 5, 10);
    if (dark > 0.05 && blink) {
      ctx.fillStyle = "rgba(224,69,58,0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (v.kind === "taxi") {
    ctx.fillStyle = "#2c3138";
    ctx.fillRect(-3.5, -3, 7, 6);
    ctx.fillStyle = "#ffd76a";
    ctx.fillRect(-2.5, -1.8, 5, 3.6);
  }

  // фары
  ctx.fillStyle = "rgba(255,240,200,0.85)";
  ctx.fillRect(L / 2 - 2.5, -W2 / 2 + 3, 2, 4);
  ctx.fillRect(L / 2 - 2.5, W2 / 2 - 7, 2, 4);
  ctx.fillStyle = "rgba(200,60,50,0.8)";
  ctx.fillRect(-L / 2 + 0.5, -W2 / 2 + 3, 2, 4);
  ctx.fillRect(-L / 2 + 0.5, W2 / 2 - 7, 2, 4);

  // свет фар ночью
  if (dark > 0.05) {
    const bg = ctx.createLinearGradient(L / 2, 0, L / 2 + 62, 0);
    bg.addColorStop(0, `rgba(255,225,160,${0.16 * dark / 0.5})`);
    bg.addColorStop(1, "rgba(255,225,160,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(L / 2 - 2, -W2 / 2 + 2);
    ctx.lineTo(L / 2 + 62, -W2 / 2 - 12);
    ctx.lineTo(L / 2 + 62, W2 / 2 + 12);
    ctx.lineTo(L / 2 - 2, W2 / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ================================================================
 *  СБОРКА ТЕКСТУР
 * ================================================================ */

const MM_SCALE = 0.0625; // 1 world px -> 0.0625 mm px (96 tiles -> 192 px)

export function makeMinimapBase(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = WORLD_W * MM_SCALE; // 192
  c.height = WORLD_H * MM_SCALE; // 96
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#15171b";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const t = GRID[y][x];
      let col: string | null = null;
      if (t.base === "road") col = "#3c414a";
      else if (t.base === "sidewalk") col = "#2b2f36";
      else if (t.base === "grass") col = "#233020";
      else if (t.base === "building") col = "#4a453d";
      else if (t.base === "dirt") col = null;
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * TILE * MM_SCALE, y * TILE * MM_SCALE, TILE * MM_SCALE + 0.5, TILE * MM_SCALE + 0.5);
    }
  // ключевые здания ярче
  for (const b of BUILDINGS) {
    ctx.fillStyle =
      b.kind === "police" ? "#39445a" : b.kind === "shop" ? "#5a5344" : b.kind === "shelter" ? "#54493a" : "#454f46";
    ctx.fillRect(b.x * TILE * MM_SCALE, b.y * TILE * MM_SCALE, b.w * TILE * MM_SCALE, b.h * TILE * MM_SCALE);
  }
  return c;
}

export function makeCityTextures(): CityTextures {
  return {
    ground: makeGroundTexture(),
    buildings: BUILDINGS.map(buildingArt),
    minimapBase: makeMinimapBase(),
  };
}

/* ================================================================
 *  КАДР
 * ================================================================ */

function darkness(minutes: number): number {
  const h = minutes / 60;
  if (h >= 21 || h < 5) return 0.5;
  if (h >= 19) return ((h - 19) / 2) * 0.5;
  if (h < 7) return ((7 - h) / 2) * 0.5;
  return 0;
}

const LAMP_POS: { x: number; y: number }[] = DECOR.filter((d) => d.kind === "lamp").map(
  (d) => ({ x: d.x * TILE + 16, y: d.y * TILE + 26 })
);

interface DrawItem {
  base: number;
  fn: (ctx: CanvasRenderingContext2D) => void;
}

/** Миникарта: база + игрок + цель + граница видимости. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  base: HTMLCanvasElement,
  playerX: number,
  playerY: number,
  target: { x: number; y: number } | null,
  cam: Camera,
  vp: ViewportInfo,
  t: number
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(base, 0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = MM_SCALE;
  // граница видимости
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    (cam.x - vp.vw / 2) * s,
    (cam.y - vp.vh / 2) * s,
    vp.vw * s,
    vp.vh * s
  );
  // цель
  if (target) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc((target.x + 0.5) * TILE * s, (target.y + 0.5) * TILE * s, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // игрок
  const px = (playerX + 0.5) * TILE * s;
  const py = (playerY + 0.5) * TILE * s;
  ctx.strokeStyle = `rgba(255,200,90,${0.5 + Math.sin(t / 300) * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffcf6a";
  ctx.beginPath();
  ctx.arc(px, py, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  tex: CityTextures,
  info: FrameInfo,
  t: number
): void {
  const { state, path, hover, target, player, weather, npcs, vehicles, cam, vp } = info;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const S = vp.dpr; // ZOOM = 1
  ctx.setTransform(S, 0, 0, S, ((vp.vw / 2 - cam.x) * S) | 0, ((vp.vh / 2 - cam.y) * S) | 0);

  const [vx0, vy0, vx1, vy1] = visibleOf(cam, vp);

  // грунт (вся текстура — GPU сама обрежет)
  ctx.drawImage(tex.ground, 0, 0, WORLD_W, WORLD_H);

  // путь
  if (path.length > 0 && !state.dead) {
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    for (const [px, py] of path) {
      if (px * TILE < vx0 || px * TILE > vx1 || py * TILE < vy0 || py * TILE > vy1) continue;
      ctx.beginPath();
      ctx.arc(px * TILE + 16, py * TILE + 16, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const [lx, ly] = path[path.length - 1];
    const r = 6 + Math.sin(t / 160) * 2;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx * TILE + 16, ly * TILE + 16, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // наведение
  if (hover && !state.dead) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(hover[0] * TILE, hover[1] * TILE, TILE, TILE);
  }

  /* ---------- depth-проход ---------- */
  const items: DrawItem[] = [];
  const inView = (x0: number, y0: number, x1: number, y1: number) =>
    intersects(x0, y0, x1, y1, vx0, vy0, vx1, vy1);

  for (const b of tex.buildings) {
    if (!inView(b.rect[0], b.rect[1], b.rect[2], b.rect[3])) continue;
    const canvas = b.canvas;
    items.push({
      base: b.baseY,
      fn: (c) => c.drawImage(canvas, b.ox, b.oy, b.dw, b.dh),
    });
  }
  for (const d of DECOR) {
    if (d.kind === "parking") continue;
    const x0 = d.x * TILE;
    const y0 = d.y * TILE;
    if (!inView(x0, y0 - 20, x0 + TILE, y0 + TILE)) continue;
    const base = d.y * TILE + decorBaseY(d.kind);
    items.push({ base, fn: (c) => drawDecorItem(c, d) });
  }
  for (const o of GRID_OBJS) {
    const x0 = o.x * TILE;
    const y0 = o.y * TILE;
    if (!inView(x0, y0 - 20, x0 + TILE, y0 + TILE)) continue;
    const base = o.y * TILE + GRID_OBJ_BASE[o.kind];
    items.push({ base, fn: (c) => drawGridObj(c, o) });
  }
  for (const v of vehicles) {
    const half = 34;
    if (!inView(v.x - half, v.y - half, v.x + half, v.y + half)) continue;
    items.push({ base: v.y + 12, fn: (c) => drawVehicle(c, v, t, 0) });
  }
  for (const n of npcs) {
    if (!inView(n.x - 32, n.y - 90, n.x + 32, n.y + 8)) continue;
    items.push({ base: n.y, fn: (c) => drawNpc(c, n, t) });
  }

  let feetX = (player.x + 0.5) * TILE;
  let feetY = (player.y + 0.5) * TILE;
  if (state.dead) {
    feetX = (state.x + 0.5) * TILE;
    feetY = (state.y + 0.5) * TILE;
    items.push({ base: feetY, fn: (c) => drawDead(c, feetX, feetY) });
  } else {
    items.push({ base: feetY, fn: (c) => drawPlayer(c, player, t) });
  }

  items.sort((a, b2) => a.base - b2.base);
  for (const it of items) it.fn(ctx);

  /* ---------- ночь ---------- */
  const dark = darkness(state.minutes);
  if (dark > 0) {
    const rx0 = Math.max(0, vx0);
    const ry0 = Math.max(0, vy0);
    const rx1 = Math.min(WORLD_W, vx1);
    const ry1 = Math.min(WORLD_H, vy1);

    ctx.fillStyle = `rgba(9, 13, 34, ${dark})`;
    ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);

    // мягкие пулы света от фонарей (сначала — на земле)
    for (const lp of LAMP_POS) {
      if (!inView(lp.x - 80, lp.y - 40, lp.x + 80, lp.y + 40)) continue;
      ctx.save();
      ctx.translate(lp.x, lp.y);
      ctx.scale(1, 0.55);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 84);
      g.addColorStop(0, `rgba(255,198,112,${0.30 * (dark / 0.5)})`);
      g.addColorStop(1, "rgba(255,198,112,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // окна и витрины
    for (const b of tex.buildings) {
      if (!inView(b.rect[0], b.rect[1], b.rect[2], b.rect[3])) continue;
      for (const w of b.lit) {
        if (!inView(w.x - 6, w.y - 6, w.x + w.w + 6, w.y + w.h + 6)) continue;
        ctx.fillStyle = `rgba(255,196,102,${0.16 * (dark / 0.5)})`;
        ctx.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
        ctx.fillStyle = `rgba(255,196,102,${0.55 * (dark / 0.5)})`;
        ctx.fillRect(w.x, w.y, w.w, w.h);
      }
      // свечение вывески
      if (inView(b.sign.x - 20, b.sign.y - 16, b.sign.x + b.sign.w + 20, b.sign.y + b.sign.h + 16)) {
        const g = ctx.createRadialGradient(
          b.sign.x + b.sign.w / 2, b.sign.y + 7, 4,
          b.sign.x + b.sign.w / 2, b.sign.y + 7, b.sign.w * 0.9
        );
        g.addColorStop(0, `rgba(255,214,140,${0.20 * (dark / 0.5)})`);
        g.addColorStop(1, "rgba(255,214,140,0)");
        ctx.fillStyle = g;
        ctx.fillRect(b.sign.x - 24, b.sign.y - 16, b.sign.w + 48, b.sign.h + 32);
      }
      // мигалка полиции
      if (b.roofLight) {
        const blink = Math.floor(t / 220) % 2 === 0;
        const col = blink ? "224,69,58" : "59,111,212";
        const g = ctx.createRadialGradient(b.roofLight.x, b.roofLight.y, 2, b.roofLight.x, b.roofLight.y, 34);
        g.addColorStop(0, `rgba(${col},${0.5 * (dark / 0.5) + 0.15})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.roofLight.x, b.roofLight.y, 34, 0, Math.PI * 2);
        ctx.fill();
      }
      // свет в дверях ночлежек и медпунктов
      if (b.doorC && (b.b.kind === "shelter" || b.b.id === "clinic" || b.b.id === "clinic2" || b.b.id === "hospital")) {
        const g = ctx.createRadialGradient(b.doorC.x, b.doorC.y, 2, b.doorC.x, b.doorC.y, 40);
        g.addColorStop(0, `rgba(255,205,120,${0.30 * (dark / 0.5)})`);
        g.addColorStop(1, "rgba(255,205,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.doorC.x, b.doorC.y, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // свет фар (повторно поверх тьмы — он был нарисован до)
    for (const v of vehicles) {
      const half = 70;
      if (!inView(v.x - half, v.y - half, v.x + half, v.y + half)) continue;
      drawVehicle(ctx, v, t, dark);
    }

    // персонаж: слабый свет вокруг
    if (!state.dead) {
      const g = ctx.createRadialGradient(feetX, feetY - 20, 4, feetX, feetY - 20, 46);
      g.addColorStop(0, `rgba(255,196,110,${0.14 * (dark / 0.5)})`);
      g.addColorStop(1, "rgba(255,196,110,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(feetX, feetY - 20, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- дождь ---------- */
  if (weather === "rain") {
    const rx0 = Math.max(0, vx0);
    const ry0 = Math.max(0, vy0);
    const rx1 = Math.min(WORLD_W, vx1);
    const ry1 = Math.min(WORLD_H, vy1);
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;

    ctx.fillStyle = "rgba(22, 32, 52, 0.13)";
    ctx.fillRect(rx0, ry0, rw, rh);

    // мокрые блики на дороге
    ctx.fillStyle = "rgba(120,150,200,0.05)";
    for (let ty = Math.floor(vy0 / TILE); ty <= Math.ceil(vy1 / TILE); ty++) {
      for (let tx = Math.floor(vx0 / TILE); tx <= Math.ceil(vx1 / TILE); tx++) {
        if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) continue;
        if (GRID[ty][tx].base !== "road") continue;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // шиммер в лужах + рябь
    for (const [x, y] of PUDDLES) {
      if (!inView(x * TILE, y * TILE, x * TILE + TILE, y * TILE + TILE)) continue;
      const cx = x * TILE + 16;
      const cy = y * TILE + 16;
      const ph = (t / 700 + x * 0.37) % 1;
      ctx.strokeStyle = `rgba(170,200,235,${0.22 * (1 - ph)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 3 + ph * 10, 1.5 + ph * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // капли
    ctx.strokeStyle = "rgba(185, 205, 235, 0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const count = Math.min(110, Math.floor((rw * rh) / 26000));
    for (let i = 0; i < count; i++) {
      const rxp = rx0 + ((i * 97.3 + t * 0.21 * (1 + (i % 3) * 0.25)) % rw);
      const ryp = ry0 + ((i * 61.7 + t * 0.85) % rh);
      ctx.moveTo(rxp, ryp);
      ctx.lineTo(rxp - 3.5, ryp + 9);
    }
    ctx.stroke();
  }

  /* ---------- подсказка E ---------- */
  if (target && !state.dead) {
    const tx = target.x * TILE + 16;
    const ty = target.y * TILE - 4;
    ctx.fillStyle = "rgba(15,17,22,0.88)";
    rrect(ctx, tx - 9, ty - 15, 18, 14, 4);
    ctx.fill();
    ctx.fillStyle = "#ffd76a";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("E", tx, ty - 7.5);
  }
}

function visibleOf(cam: Camera, vp: ViewportInfo): [number, number, number, number] {
  return [
    cam.x - vp.vw / 2 - 16,
    cam.y - vp.vh / 2 - 16,
    cam.x + vp.vw / 2 + 16,
    cam.y + vp.vh / 2 + 16,
  ];
}

/* ================================================================
 *  NPC и персонаж
 * ================================================================ */

function drawNpc(ctx: CanvasRenderingContext2D, n: Npc, t: number): void {
  const img = getNpcSheet();
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const col = n.walking ? 1 + (Math.floor((t + n.id * 137) / 110) % 4) : 0;
  const row = npcRow(n.palette, n.dir);
  const ax = FOOT_X * (NPC_W / FRAME_W);
  const ay = FOOT_Y * (NPC_H / FRAME_H);
  ctx.drawImage(
    img,
    col * FRAME_W,
    row * FRAME_H,
    FRAME_W,
    FRAME_H,
    n.x - ax,
    n.y - ay,
    NPC_W,
    NPC_H
  );
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  dir: Facing,
  colors: PlayerColors
): void {
  ctx.fillStyle = "#e7c39c";
  ctx.beginPath();
  ctx.arc(hx, hy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2e25";
  if (dir === "up") {
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (dir === "down") {
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 8, Math.PI, 0);
    ctx.fill();
  } else if (dir === "left") {
    ctx.beginPath();
    ctx.arc(hx, hy, 8, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(hx, hy, 8, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();
  }
  if (colors.hat) {
    ctx.fillStyle = colors.hat.color;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.5, 8.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(
      dir === "down" ? hx - 7 : dir === "left" ? hx - 11 : hx - 7,
      dir === "down" ? hy + 4 : dir === "up" ? hy - 11 : hy - 2,
      dir === "down" || dir === "up" ? 14 : 4,
      dir === "down" || dir === "up" ? 4.5 : 12
    );
  }
}

function drawBikeRider(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: Facing,
  colors: PlayerColors,
  t: number
): void {
  const ped = Math.sin(t / 90) * 3.5;
  ctx.strokeStyle = "#20242a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx - 11, cy + 9, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 11, cy + 9, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#c0392b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy + 9);
  ctx.lineTo(cx, cy + 1);
  ctx.lineTo(cx + 11, cy + 9);
  ctx.moveTo(cx, cy + 1);
  ctx.lineTo(cx + 1.5, cy - 6);
  ctx.stroke();
  ctx.fillStyle = "#555a5f";
  ctx.fillRect(cx - 3 + ped, cy + 4, 6, 4);
  ctx.fillRect(cx - 3 - ped, cy + 2, 6, 4);
  ctx.fillStyle = colors.jacket;
  rrect(ctx, cx - 8, cy - 10, 16, 15, 6);
  ctx.fill();
  ctx.fillStyle = colors.pants;
  ctx.fillRect(cx - 6, cy + 3, 5, 6);
  ctx.fillRect(cx + 1, cy + 3, 5, 6);
  drawHead(ctx, cx, cy - 14, dir, colors);
}

function drawWorkSpark(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  const sp = (t / 250) % 1;
  ctx.globalAlpha = Math.max(0, 1 - sp);
  ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
  ctx.beginPath();
  ctx.arc(cx + 12, cy - 30 - sp * 9, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerInfo, t: number): void {
  const cx = (p.x + 0.5) * TILE;
  const cy = (p.y + 0.5) * TILE;

  if (p.riding) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBikeRider(ctx, cx, cy, p.dir, p.colors, t);
    return;
  }

  if (p.mode === "rest") {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 11, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.colors.jacket;
    rrect(ctx, cx - 13, cy - 5, 26, 11, 5.5);
    ctx.fill();
    ctx.fillStyle = "#e7c39c";
    ctx.beginPath();
    ctx.arc(cx + 11, cy, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    const z1 = (t / 60) % 10;
    const z2 = (t / 60 + 5) % 10;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText("z", cx + 5, cy - 12 - z1 * 0.5);
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.fillText("z", cx + 12, cy - 19 - z2 * 0.5);
    return;
  }

  // основной путь: спрайт-лист 128x192 -> 64x96, ноги в точке опоры
  const img = getHeroSheet();
  if (sheetsReady() && img) {
    const col = frameColumn(p.mode, t, 0);
    const row = DIR_ROW[p.dir];
    ctx.drawImage(
      img,
      col * FRAME_W,
      row * FRAME_H,
      FRAME_W,
      FRAME_H,
      cx - ANCHOR_X,
      cy - ANCHOR_Y,
      CHAR_W,
      CHAR_H
    );
    if (p.mode === "work") drawWorkSpark(ctx, cx, cy, t);
    return;
  }

  // fallback до загрузки листа
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 11, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const moving = p.mode === "walk" || p.mode === "run";
  const speed = p.mode === "run" ? 70 : 120;
  const phase = moving ? Math.sin(t / speed) : 0;
  const f1 = phase * 3.5;
  const f2 = -phase * 3.5;
  ctx.fillStyle = p.colors.shoes;
  rrect(ctx, cx - 7, cy + 5 + f1, 6, 8, 2.5);
  ctx.fill();
  rrect(ctx, cx + 1.5, cy + 5 + f2, 6, 8, 2.5);
  ctx.fill();
  ctx.fillStyle = p.colors.jacket;
  rrect(ctx, cx - 9, cy - 10, 18, 17, 6);
  ctx.fill();
  ctx.fillStyle = p.colors.pants;
  rrect(ctx, cx - 8, cy + 3, 16, 6, 3);
  ctx.fill();
  drawHead(ctx, cx, cy - 14, p.dir, p.colors);
  if (p.mode === "work") drawWorkSpark(ctx, cx, cy, t);
}

function drawDead(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b6f76";
  ctx.strokeStyle = "#3c3f44";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 5, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
