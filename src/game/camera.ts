// Камера: плавное следование за персонажем, границы мира, world<->screen.

import { GRID_H, GRID_W, TILE } from "./world";

export const WORLD_W = GRID_W * TILE; // 3072
export const WORLD_H = GRID_H * TILE; // 1536
export const ZOOM = 1; // 1 экранный px = 1 мировой px (масштаб персонажа ~66 px)

export interface Camera {
  x: number; // центр камеры в мировых px
  y: number;
}

export interface Viewport {
  vw: number; // css-px
  vh: number;
  dpr: number;
}

export function createCamera(tx: number, ty: number): Camera {
  return { x: tx, y: ty };
}

/** Плавное следование: экспоненциальное сглаживание, не зависит от FPS. */
export function updateCamera(cam: Camera, tx: number, ty: number, dt: number): void {
  const k = 1 - Math.exp(-dt / 110); // tau ~110 мс
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
}

/** Ограничение камеры границами мира с учётом viewport'а. */
export function clampCamera(cam: Camera, vw: number, vh: number): void {
  const hw = vw / (2 * ZOOM);
  const hh = vh / (2 * ZOOM);
  if (WORLD_W <= hw * 2) {
    cam.x = WORLD_W / 2;
  } else {
    cam.x = Math.min(WORLD_W - hw, Math.max(hw, cam.x));
  }
  if (WORLD_H <= hh * 2) {
    cam.y = WORLD_H / 2;
  } else {
    cam.y = Math.min(WORLD_H - hh, Math.max(hh, cam.y));
  }
}

/** world px -> screen css px */
export function worldToScreen(cam: Camera, wp: number, vp: number): [number, number] {
  return [(wp - cam.x) * ZOOM, (vp - cam.y) * ZOOM];
}

/** screen css px -> world px */
export function screenToWorld(cam: Camera, vp: Viewport, sx: number, sy: number): [number, number] {
  return [sx / ZOOM + cam.x - vp.vw / (2 * ZOOM), sy / ZOOM + cam.y - vp.vh / (2 * ZOOM)];
}

export function clampCameraToViewport(cam: Camera, vp: Viewport): void {
  clampCamera(cam, vp.vw, vp.vh);
}

/** Прямоугольник видимой области мира (world px). */
export function visibleRect(cam: Camera, vp: Viewport): [number, number, number, number] {
  const x0 = cam.x - vp.vw / (2 * ZOOM) - 16;
  const y0 = cam.y - vp.vh / (2 * ZOOM) - 16;
  const x1 = cam.x + vp.vw / (2 * ZOOM) + 16;
  const y1 = cam.y + vp.vh / (2 * ZOOM) + 16;
  return [x0, y0, x1, y1];
}
