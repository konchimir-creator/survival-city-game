// Отрисовка мира: статический слой (грунт, здания, дороги) и динамическая рамка
// (игрок с анимациями, ночь, дождь, путь).

import { BUILDINGS, GRID_H, GRID_W, TILE, buildGrid } from "./world";
import type { Facing, GameState, Weather } from "./types";

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
  mode: "idle" | "walk" | "run" | "work" | "rest";
  riding: boolean;
  colors: PlayerColors;
}

export interface FrameInfo {
  state: GameState;
  path: [number, number][];
  hover: [number, number] | null;
  target: { x: number; y: number } | null;
  player: PlayerInfo;
  weather: Weather;
}

const W = GRID_W * TILE;
const H = GRID_H * TILE;
const SCALE = 2; // рендерим в 2x для чёткости

function rnd(x: number, y: number, salt: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function groundColor(base: string, b?: string): string {
  if (base === "building") {
    const building = BUILDINGS.find((bb) => bb.id === b);
    return building ? building.wall : "#777777";
  }
  switch (base) {
    case "grass":
      return "#46653c";
    case "road":
      return "#373a40";
    case "sidewalk":
      return "#6e737b";
    default:
      return "#4a443c";
  }
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

function drawGround(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  base: string,
  b?: string
): void {
  const px = x * TILE;
  const py = y * TILE;
  ctx.fillStyle = groundColor(base, b);
  ctx.fillRect(px, py, TILE, TILE);

  if (base === "dirt") {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(
        px + Math.floor(rnd(x, y, i) * 27),
        py + Math.floor(rnd(x, y, i + 10) * 27),
        3,
        2
      );
    }
  } else if (base === "grass") {
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(
        px + Math.floor(rnd(x, y, i) * 26),
        py + Math.floor(rnd(x, y, i + 20) * 26),
        3,
        3
      );
    }
  } else if (base === "sidewalk") {
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
}

function roofH(bh: number): number {
  return Math.max(26, Math.floor(bh * TILE * 0.42));
}

/** Статичный слой квартала, рисуется один раз. */
export function makeStaticLayer(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W * SCALE;
  c.height = H * SCALE;
  const ctx = c.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  const grid = buildGrid();

  // проход 1: грунт
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = grid[y][x];
      drawGround(ctx, x, y, t.base, t.b);
    }
  }

  // проход 2: объекты на тайлах
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = grid[y][x];
      const px = x * TILE;
      const py = y * TILE;

      if (t.kind === "fence") {
        ctx.fillStyle = "#5d4c39";
        ctx.fillRect(px, py + 10, TILE, 4);
        ctx.fillRect(px, py + 20, TILE, 4);
        ctx.fillStyle = "#4d3f30";
        ctx.fillRect(px + 5, py + 5, 4, 22);
        ctx.fillRect(px + 23, py + 5, 4, 22);
      } else if (t.kind === "tree") {
        ctx.fillStyle = "#5b432c";
        ctx.fillRect(px + 13, py + 15, 6, 13);
        ctx.fillStyle = "#2f4a2b";
        ctx.beginPath();
        ctx.arc(px + 16, py + 12, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3c5c37";
        ctx.beginPath();
        ctx.arc(px + 12, py + 13, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#47703f";
        ctx.beginPath();
        ctx.arc(px + 20, py + 9, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.kind === "bench") {
        ctx.fillStyle = "#5f4023";
        ctx.fillRect(px + 6, py + 14, 4, 9);
        ctx.fillRect(px + 22, py + 14, 4, 9);
        ctx.fillStyle = "#8a5a33";
        ctx.fillRect(px + 4, py + 9, 24, 5);
        ctx.fillRect(px + 4, py + 4, 24, 3);
      } else if (t.kind === "trash") {
        ctx.fillStyle = "#4f5d4a";
        ctx.fillRect(px + 8, py + 9, 16, 18);
        ctx.fillStyle = "#3f4a3b";
        ctx.fillRect(px + 6, py + 6, 20, 4);
        ctx.fillRect(px + 8, py + 14, 16, 3);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(px + 8, py + 22, 16, 5);
      } else if (t.kind === "atm") {
        ctx.fillStyle = "#3d434c";
        rrect(ctx, px + 7, py + 5, 18, 22, 3);
        ctx.fill();
        ctx.fillStyle = "#9fd8a8";
        ctx.fillRect(px + 10, py + 8, 12, 8);
        ctx.fillStyle = "#2a2f36";
        ctx.fillRect(px + 10, py + 19, 12, 4);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(px + 8, py + 25, 16, 2);
      } else if (t.kind === "door") {
        ctx.fillStyle = "#8a8f96";
        ctx.fillRect(px + 4, py + 27, 24, 5);
        if (t.base === "building") {
          ctx.fillStyle = "#3a3f47";
          ctx.fillRect(px + 6, py + 4, 20, 24);
        }
        ctx.fillStyle = "#6b4a2f";
        ctx.fillRect(px + 9, py + 8, 14, 19);
        ctx.fillStyle = "#d8b56a";
        ctx.beginPath();
        ctx.arc(px + 20, py + 18, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // проход 3: здания (крыши, окна, вывески)
  for (const b of BUILDINGS) {
    const rh = roofH(b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, rh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(b.x * TILE, b.y * TILE + rh - 3, b.w * TILE, 3);

    for (let yy = b.y; yy < b.y + b.h; yy++) {
      for (let xx = b.x; xx < b.x + b.w; xx++) {
        if (xx === b.doorX && yy === b.doorY) continue;
        const wy = yy * TILE + 10;
        if (wy <= b.y * TILE + rh) continue;
        const wx = xx * TILE + 10;
        const broken = (xx * 7 + yy * 13) % 6 === 0;
        ctx.fillStyle = broken ? "#1d2129" : "#2f3540";
        ctx.fillRect(wx, wy, 12, 12);
        if (!broken) {
          ctx.strokeStyle = "rgba(255,255,255,0.22)";
          ctx.lineWidth = 1;
          ctx.strokeRect(wx + 0.5, wy + 0.5, 11, 11);
          ctx.strokeStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.moveTo(wx + 6, wy);
          ctx.lineTo(wx + 6, wy + 12);
          ctx.moveTo(wx, wy + 6);
          ctx.lineTo(wx + 12, wy + 6);
          ctx.stroke();
        }
      }
    }

    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(b.name, (b.x + b.w / 2) * TILE, b.y * TILE - 5);
    ctx.shadowBlur = 0;
  }

  // разметка дорог
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(206,173,66,0.65)";
  ctx.beginPath();
  ctx.moveTo(0, 9 * TILE - 1);
  ctx.lineTo(W, 9 * TILE - 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(23 * TILE - 1, 0);
  ctx.lineTo(23 * TILE - 1, H);
  ctx.stroke();
  ctx.setLineDash([]);

  return c;
}

function darkness(minutes: number): number {
  const h = minutes / 60;
  if (h >= 21 || h < 5) return 0.45;
  if (h >= 19) return ((h - 19) / 2) * 0.45;
  if (h < 7) return ((7 - h) / 2) * 0.45;
  return 0;
}

/* ---------- персонаж ---------- */

function drawHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  dir: Facing,
  colors: PlayerColors
): void {
  // лицо
  ctx.fillStyle = "#e7c39c";
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();
  // волосы
  ctx.fillStyle = "#3a2e25";
  if (dir === "up") {
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (dir === "down") {
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 7, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#2c241d";
    ctx.beginPath();
    ctx.arc(hx - 2.5, hy + 2, 1.2, 0, Math.PI * 2);
    ctx.arc(hx + 2.5, hy + 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (dir === "left") {
    ctx.beginPath();
    ctx.arc(hx, hy, 7, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.fillStyle = "#2c241d";
    ctx.beginPath();
    ctx.arc(hx - 3.5, hy + 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(hx, hy, 7, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();
    ctx.fillStyle = "#2c241d";
    ctx.beginPath();
    ctx.arc(hx + 3.5, hy + 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // головной убор
  if (colors.hat) {
    ctx.fillStyle = colors.hat.color;
    ctx.beginPath();
    ctx.arc(hx, hy - 0.5, 7.2, 0, Math.PI * 2);
    ctx.fill();
    // козырёк по направлению
    ctx.fillRect(
      dir === "down" ? hx - 6 : dir === "left" ? hx - 10 : hx - 6,
      dir === "down" ? hy + 4 : dir === "up" ? hy - 10 : hy - 2,
      dir === "down" || dir === "up" ? 12 : 4,
      dir === "down" || dir === "up" ? 4 : 12
    );
    // шапка-ушанка: помпон
    if (colors.hat.kind === "beanie") {
      ctx.fillStyle = "#e8e2d5";
      ctx.beginPath();
      ctx.arc(hx, hy - 7, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
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
  const ped = Math.sin(t / 90) * 3;
  // колёса
  ctx.strokeStyle = "#20242a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - 9, cy + 8, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 9, cy + 8, 5, 0, Math.PI * 2);
  ctx.stroke();
  // рама
  ctx.strokeStyle = "#c0392b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 8);
  ctx.lineTo(cx, cy + 1);
  ctx.lineTo(cx + 9, cy + 8);
  ctx.moveTo(cx, cy + 1);
  ctx.lineTo(cx + 1, cy - 5);
  ctx.stroke();
  // педали
  ctx.fillStyle = "#555a5f";
  ctx.fillRect(cx - 2 + ped, cy + 4, 4, 3);
  ctx.fillRect(cx - 2 - ped, cy + 4, 4, 3);
  // райдер
  ctx.fillStyle = colors.jacket;
  rrect(ctx, cx - 7, cy - 8, 14, 12, 5);
  ctx.fill();
  ctx.fillStyle = colors.pants;
  ctx.fillRect(cx - 5, cy + 2, 4, 5);
  ctx.fillRect(cx + 1, cy + 2, 4, 5);
  drawHead(ctx, cx, cy - 11, dir, colors);
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerInfo, t: number): void {
  const cx = (p.x + 0.5) * TILE;
  const cy = (p.y + 0.5) * TILE;

  // тень
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 11, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.riding) {
    drawBikeRider(ctx, cx, cy, p.dir, p.colors, t);
    return;
  }

  // сон/отдых: лежит на лавке
  if (p.mode === "rest") {
    ctx.fillStyle = p.colors.jacket;
    rrect(ctx, cx - 12, cy - 4, 24, 10, 5);
    ctx.fill();
    ctx.fillStyle = "#e7c39c";
    ctx.beginPath();
    ctx.arc(cx + 10, cy + 1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.textAlign = "center";
    const z1 = (t / 60) % 10;
    const z2 = ((t / 60 + 5) % 10);
    ctx.font = "bold 9px system-ui, sans-serif";
    ctx.fillText("z", cx + 4, cy - 10 - z1 * 0.5);
    ctx.font = "bold 7px system-ui, sans-serif";
    ctx.fillText("z", cx + 10, cy - 16 - z2 * 0.5);
    return;
  }

  const moving = p.mode === "walk" || p.mode === "run";
  const workMode = p.mode === "work";
  const speed = p.mode === "run" ? 70 : workMode ? 85 : 120;
  const amp = p.mode === "run" ? 5 : 3.5;
  const phase = moving || workMode ? Math.sin(t / speed) : 0;
  const bob = p.mode === "idle" ? Math.sin(t / 500) * 0.8 : 0;
  const lean = p.mode === "run" ? (p.dir === "left" ? -1 : p.dir === "right" ? 1 : 0) : 0;
  const oy = cy - 2 + bob + lean * 0;

  // ноги (обувь)
  const f1 = phase * amp;
  const f2 = -phase * amp;
  ctx.fillStyle = p.colors.shoes;
  rrect(ctx, cx - 6.5, oy + 6 + f1, 5, 7, 2);
  ctx.fill();
  rrect(ctx, cx + 1.5, oy + 6 + f2, 5, 7, 2);
  ctx.fill();

  // руки
  ctx.fillStyle = p.colors.jacket;
  ctx.beginPath();
  ctx.arc(cx - 11, oy + 2 + f2, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 11, oy + 2 + f1, 3.4, 0, Math.PI * 2);
  ctx.fill();

  // корпус
  ctx.fillStyle = p.colors.jacket;
  rrect(ctx, cx - 9, oy - 8, 18, 16, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // пояс/брюки
  ctx.fillStyle = p.colors.pants;
  rrect(ctx, cx - 8, oy + 4, 16, 6, 3);
  ctx.fill();

  // голова
  const hx = cx + (p.dir === "left" ? -1 : p.dir === "right" ? 1 : 0);
  drawHead(ctx, hx, oy - 12, p.dir, p.colors);

  // искра при работе
  if (workMode) {
    const sp = (t / 250) % 1;
    ctx.globalAlpha = Math.max(0, 1 - sp);
    ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
    ctx.beginPath();
    ctx.arc(cx + 9, oy - 18 - sp * 8, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- кадр ---------- */

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  staticLayer: HTMLCanvasElement,
  info: FrameInfo,
  t: number
): void {
  const { state, path, hover, target, player, weather } = info;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(staticLayer, 0, 0, W, H);

  // путь
  if (path.length > 0 && !state.dead) {
    for (const [px, py] of path) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
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
    const [hx, hy] = hover;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(hx * TILE, hy * TILE, TILE, TILE);
  }

  // ночь
  const dark = darkness(state.minutes);
  if (dark > 0) {
    ctx.fillStyle = `rgba(8, 12, 34, ${dark})`;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255, 196, 102, 0.7)";
    for (const b of BUILDINGS) {
      const roofBottom = b.y * TILE + roofH(b.h);
      for (let yy = b.y; yy < b.y + b.h; yy++) {
        for (let xx = b.x; xx < b.x + b.w; xx++) {
          if (xx === b.doorX && yy === b.doorY) continue;
          if (yy * TILE + 10 <= roofBottom) continue;
          if ((xx * 3 + yy * 5) % 4 !== 0) continue;
          ctx.fillRect(xx * TILE + 10, yy * TILE + 10, 12, 12);
        }
      }
    }
  }

  // персонаж
  if (state.dead) {
    const cx = (state.x + 0.5) * TILE;
    const cy = (state.y + 0.5) * TILE;
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
  } else {
    drawPlayer(ctx, player, t);
  }

  // слабый свет вокруг персонажа ночью
  if (dark > 0 && !state.dead) {
    const px = (state.x + 0.5) * TILE;
    const py = (state.y + 0.5) * TILE;
    const g = ctx.createRadialGradient(px, py, 4, px, py, 46);
    g.addColorStop(0, "rgba(255,196,110,0.18)");
    g.addColorStop(1, "rgba(255,196,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 46, 0, Math.PI * 2);
    ctx.fill();
  }

  // дождь
  if (weather === "rain") {
    ctx.fillStyle = "rgba(20, 30, 50, 0.12)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(180, 200, 230, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const rx = (i * 97 + t * 0.25) % W;
      const ry = (i * 61 + t * 0.9) % H;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 7);
    }
    ctx.stroke();
  }

  // подсказка «E»
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
