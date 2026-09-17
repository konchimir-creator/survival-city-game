// Автосохранение в localStorage.

import type { GameState } from "./types";

const KEY = "survival-city-save";
const VERSION = 2;

export function saveGame(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, state: s }));
  } catch {
    /* приватный режим и т.п. — молча пропускаем */
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; state: GameState };
    if (parsed.v !== VERSION || !parsed.state || !parsed.state.char) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
