// Живой город: NPC на тротуарах и транспорт на дорогах.
// Чистая симуляция (без React): создание, обновление по dt, позиции в мировых px.

import { GRID_H, GRID_W, TILE } from "./world";
import type { Facing } from "./types";

export interface Npc {
  id: number;
  archetype: string; // «архетип» (подписи в отладке, палитра задаётся отдельно)
  palette: number; // 0..3 — палитра в npcs.png
  x: number; // мировые px (центр стопы)
  y: number;
  dir: Facing;
  walking: boolean;
  standUntil: number; // до этого времени — стоит (озирается)
  speed: number; // px/сек
  route: [number, number][]; // тайловые waypoints (замкнутый цикл)
  wp: number; // индекс следующего waypoint'а
}

export interface Vehicle {
  id: number;
  kind: "sedan" | "taxi" | "van" | "police";
  x: number; // мировые px, центр машины
  y: number;
  dir: Facing;
  speed: number; // px/сек
  // осевая петля
  axis: "h" | "v";
  fixed: number; // y (для h) или x (для v), мировые px
  sign: 1 | -1; // направление вдоль оси
}

/* ---------- маршруты (тайлы; тротуары/дороги) ---------- */

const ROUTES: [number, number][][] = [
  // западный контур старого района
  [[2, 7], [12, 7], [12, 10], [2, 10]],
  // юг старого района
  [[21, 10], [21, 16], [24, 16], [24, 10]],
  // северный коридор (через перекрёсток 54)
  [[35, 7], [53, 7], [53, 29], [35, 29]],
  // северный коридор восток
  [[56, 7], [76, 7], [76, 10], [57, 10]],
  // восточный коридор
  [[56, 29], [77, 29], [77, 32], [56, 32]],
  // западный южный парк
  [[2, 29], [12, 29], [12, 32], [2, 32]],
  // центральный юг
  [[36, 29], [52, 29], [52, 32], [36, 32]],
  // восточный парк
  [[82, 29], [93, 29], [93, 32], [82, 32]],
  // длинная северная линия
  [[3, 7], [34, 7], [34, 10], [3, 10]],
  // восточная северная линия
  [[81, 7], [94, 7], [94, 10], [81, 10]],
];

const ARCHETYPES: { name: string; palette: number; speed: [number, number] }[] = [
  { name: "worker", palette: 0, speed: [1.0, 1.3] }, // рабочий — джинсы/куртка
  { name: "student", palette: 1, speed: [1.2, 1.6] }, // студент — капюшон
  { name: "runner", palette: 2, speed: [2.0, 2.5] }, // спешащий — быстрые шаги
  { name: "business", palette: 3, speed: [0.9, 1.2] }, // деловой — тёмный костюм
  { name: "elder", palette: 1, speed: [0.6, 0.8] }, // пенсионер — медленный
  { name: "courier", palette: 2, speed: [1.6, 2.0] }, // курьер — быстрая походка
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createNpcs(count = 20): Npc[] {
  const npcs: Npc[] = [];
  for (let i = 0; i < count; i++) {
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const route = ROUTES[i % ROUTES.length];
    const start = route[i % route.length];
    npcs.push({
      id: i,
      archetype: arch.name,
      palette: arch.palette,
      x: (start[0] + 0.5) * TILE,
      y: (start[1] + 0.5) * TILE,
      dir: "down",
      walking: true,
      standUntil: 0,
      speed: rand(arch.speed[0], arch.speed[1]) * TILE,
      route,
      wp: (i % route.length) + 1,
    });
  }
  return npcs;
}

const tileCenter = (t: [number, number]) => [(t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE];

/** Обновляет NPC: движение по waypoints, паузы стоя, направление взгляда. */
export function updateNpcs(npcs: Npc[], dt: number, now: number): void {
  for (const n of npcs) {
    if (!n.walking) {
      if (now >= n.standUntil) {
        n.walking = true;
      } else {
        continue;
      }
    }
    const target = n.route[n.wp % n.route.length];
    const [tx, ty] = tileCenter(target);
    const dx = tx - n.x;
    const dy = ty - n.y;
    const dist = Math.hypot(dx, dy);
    const step = n.speed * (dt / 1000);
    if (dist <= step) {
      n.x = tx;
      n.y = ty;
      n.wp++;
      // иногда останавливается и «озирается»
      if (Math.random() < 0.35) {
        n.walking = false;
        n.standUntil = now + rand(2000, 9000);
      }
    } else {
      n.x += (dx / dist) * step;
      n.y += (dy / dist) * step;
      if (Math.abs(dx) > Math.abs(dy)) n.dir = dx > 0 ? "right" : "left";
      else n.dir = dy > 0 ? "down" : "up";
    }
  }
}

/* ---------- транспорт ---------- */

const W = GRID_W * TILE;
const H = GRID_H * TILE;

/** Полосы: ось, тайл полосы, направление. Машина едет по своей полосе. */
const LANES: { axis: "h" | "v"; tile: number; sign: 1 | -1 }[] = [
  { axis: "h", tile: 8, sign: -1 },
  { axis: "h", tile: 9, sign: 1 },
  { axis: "h", tile: 30, sign: -1 },
  { axis: "h", tile: 31, sign: 1 },
  { axis: "v", tile: 22, sign: 1 },
  { axis: "v", tile: 23, sign: -1 },
  { axis: "v", tile: 54, sign: 1 },
  { axis: "v", tile: 55, sign: -1 },
  { axis: "v", tile: 78, sign: 1 },
  { axis: "v", tile: 79, sign: -1 },
];

const VEHICLE_TYPES: { kind: Vehicle["kind"]; speed: [number, number] }[] = [
  { kind: "sedan", speed: [55, 70] },
  { kind: "sedan", speed: [55, 70] },
  { kind: "taxi", speed: [70, 85] },
  { kind: "van", speed: [45, 58] },
  { kind: "sedan", speed: [55, 70] },
  { kind: "taxi", speed: [70, 85] },
  { kind: "van", speed: [45, 58] },
  { kind: "sedan", speed: [55, 70] },
  { kind: "police", speed: [90, 110] },
  { kind: "sedan", speed: [55, 70] },
  { kind: "taxi", speed: [70, 85] },
];

const laneCenter = (lane: { axis: "h" | "v"; tile: number; sign: 1 | -1 }): number =>
  (lane.tile + (lane.sign > 0 ? 0.72 : 0.28)) * TILE;

export function createVehicles(): Vehicle[] {
  const cars: Vehicle[] = [];
  for (let i = 0; i < VEHICLE_TYPES.length; i++) {
    const lane = LANES[i % LANES.length];
    const type = VEHICLE_TYPES[i];
    const span = lane.axis === "h" ? W : H;
    const along = rand(40, span - 40);
    cars.push({
      id: i,
      kind: type.kind,
      x: lane.axis === "h" ? along : laneCenter(lane),
      y: lane.axis === "h" ? laneCenter(lane) : along,
      dir:
        lane.axis === "h"
          ? lane.sign > 0
            ? "right"
            : "left"
          : lane.sign > 0
            ? "down"
            : "up",
      speed: rand(type.speed[0], type.speed[1]),
      axis: lane.axis,
      fixed: laneCenter(lane),
      sign: lane.sign,
    });
  }
  return cars;
}

/** Транспорт: петля по полосе с заворотом за краями мира. */
export function updateVehicles(cars: Vehicle[], dt: number): void {
  for (const c of cars) {
    const step = c.speed * (dt / 1000);
    if (c.axis === "h") {
      c.x += c.sign * step;
      if (c.sign > 0 && c.x > W + 80) c.x = -80;
      if (c.sign < 0 && c.x < -80) c.x = W + 80;
      c.fixed = c.y;
    } else {
      c.y += c.sign * step;
      if (c.sign > 0 && c.y > H + 80) c.y = -80;
      if (c.sign < 0 && c.y < -80) c.y = H + 80;
      c.fixed = c.x;
    }
  }
}
