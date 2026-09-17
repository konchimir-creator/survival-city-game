// Спрайт-листы: загрузка один раз + математика кадров.
// character-sheet.png — герой (128x192, 4 ряда направлений x 9 колонок анимации).
// npcs.png — 4 палитры персонажей (ряды: палитра*4 + направление).

import type { Facing } from "./types";

export const SHEET_SRC = "/sprites/character-sheet.png";
export const NPC_SHEET_SRC = "/sprites/npcs.png";

export const FRAME_W = 128; // кадр листа
export const FRAME_H = 192;
export const DIR_ROW: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };

// точка опоры внутри кадра: центр x=64, линия земли y=172
export const FOOT_X = 64;
export const FOOT_Y = 172;

// масштаб на карте: кадр 128x192 -> 64x96 px (персонаж ~86 px роста при ZOOM=1)
export const CHAR_W = 64;
export const CHAR_H = 96;
export const ANCHOR_X = FOOT_X * (CHAR_W / FRAME_W); // 32
export const ANCHOR_Y = FOOT_Y * (CHAR_H / FRAME_H); // 86

// NPC чуть меньше игрока
export const NPC_W = CHAR_W * 0.88;
export const NPC_H = CHAR_H * 0.88;

const WALK_FRAME_MS = 110;
const RUN_FRAME_MS = 62;

export type CharMode = "idle" | "walk" | "run" | "work" | "rest";

/** Колонка листа: 0 = idle, 1–4 = walk, 5–8 = run (по времени, без зависимости от FPS). */
export function frameColumn(mode: CharMode, t: number, phase: number): number {
  if (mode === "run") return 5 + (Math.floor((t + phase) / RUN_FRAME_MS) % 4);
  if (mode === "walk") return 1 + (Math.floor((t + phase) / WALK_FRAME_MS) % 4);
  return 0;
}

let heroSheet: HTMLImageElement | null = null;
let npcSheet: HTMLImageElement | null = null;
let loaded = false;

/** Загрузка листов один раз (singleton). Вызывается на старте. */
export function initSheets(): void {
  if (heroSheet) return;
  heroSheet = new Image();
  heroSheet.decoding = "async";
  heroSheet.src = SHEET_SRC;
  npcSheet = new Image();
  npcSheet.decoding = "async";
  npcSheet.src = NPC_SHEET_SRC;
  heroSheet.onload = () => {
    loaded = true;
  };
}

export function getHeroSheet(): HTMLImageElement | null {
  return heroSheet;
}

export function getNpcSheet(): HTMLImageElement | null {
  return npcSheet;
}

export function sheetsReady(): boolean {
  return !!heroSheet && heroSheet.complete && heroSheet.naturalWidth > 0;
}

/** Ряд в npcs.png для палитры и направления. */
export function npcRow(palette: number, dir: Facing): number {
  return ((palette % 4) * 4 + DIR_ROW[dir]) % 16;
}
