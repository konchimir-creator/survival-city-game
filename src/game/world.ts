// Мир игры: сетка тайлов, здания, путь, взаимодействия.

export const TILE = 32;
export const GRID_W = 34;
export const GRID_H = 17;

export type GroundKind = "dirt" | "grass" | "road" | "sidewalk" | "building";
export type TileKind = GroundKind | "door" | "fence" | "tree" | "bench" | "trash" | "atm";

export interface Tile {
  kind: TileKind;
  /** id здания, если тайл относится к зданию */
  b?: string;
  /** какой грунт лежит под тайлом (для отрисовки) */
  base: GroundKind;
}

export type JobId =
  | "loading"
  | "courier"
  | "driver"
  | "kitchen"
  | "cleaning"
  | "mechanic1"
  | "mechanic2"
  | "med1"
  | "nurse"
  | "seller"
  | "computer";

export interface Building {
  id: string;
  name: string;
  kind: "shop" | "shelter" | "work" | "house";
  jobs: JobId[];
  x: number;
  y: number;
  w: number;
  h: number;
  wall: string;
  roof: string;
  doorX: number;
  doorY: number;
  hasDoor: boolean;
  desc: string;
}

export const BUILDINGS: Building[] = [
  {
    id: "shop",
    name: "Продукты «Скидка»",
    kind: "shop",
    jobs: ["seller"],
    x: 2,
    y: 3,
    w: 5,
    h: 3,
    wall: "#7d8894",
    roof: "#59626e",
    doorX: 4,
    doorY: 5,
    hasDoor: true,
    desc: "Бедный универсам. Открыт 08:00–21:00. Здесь же принимают вещи на продажу.",
  },
  {
    id: "shelter",
    name: "Ночлежка «Рассвет»",
    kind: "shelter",
    jobs: [],
    x: 8,
    y: 3,
    w: 3,
    h: 3,
    wall: "#8a7f6a",
    roof: "#655d4c",
    doorX: 9,
    doorY: 5,
    hasDoor: true,
    desc: "Койки, а теперь и одна съёмная комната. Круглосуточно.",
  },
  {
    id: "garage",
    name: "Автосервис «Гараж»",
    kind: "work",
    jobs: ["mechanic1", "mechanic2"],
    x: 12,
    y: 3,
    w: 4,
    h: 3,
    wall: "#8a6f5c",
    roof: "#63503f",
    doorX: 13,
    doorY: 5,
    hasDoor: true,
    desc: "Запчасти, масло, терпение мастера. Здесь растут механики.",
  },
  {
    id: "clinic",
    name: "Медпункт",
    kind: "work",
    jobs: ["med1", "nurse"],
    x: 17,
    y: 3,
    w: 3,
    h: 3,
    wall: "#7fa08f",
    roof: "#587567",
    doorX: 18,
    doorY: 5,
    hasDoor: true,
    desc: "Три кабинета, пахнет хлоркой. Здесь же — общественный душ.",
  },
  {
    id: "warehouse",
    name: "Склад №7",
    kind: "work",
    jobs: ["loading", "courier", "driver"],
    x: 26,
    y: 3,
    w: 4,
    h: 3,
    wall: "#94826b",
    roof: "#6c5f4e",
    doorX: 27,
    doorY: 5,
    hasDoor: true,
    desc: "Ящики, паллеты, курьерские маршруты. Платят наличными.",
  },
  {
    id: "cafe",
    name: "Кафе «Гусяк»",
    kind: "work",
    jobs: ["kitchen"],
    x: 2,
    y: 12,
    w: 4,
    h: 3,
    wall: "#9b6b5a",
    roof: "#71463a",
    doorX: 4,
    doorY: 11,
    hasDoor: true,
    desc: "Помощь на кухне. Вечерняя смена платит больше. Грязных не пускают.",
  },
  {
    id: "house1",
    name: "Заброшенный дом",
    kind: "house",
    jobs: [],
    x: 6,
    y: 13,
    w: 3,
    h: 2,
    wall: "#6e6259",
    roof: "#4f463f",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Окна заколочены досками.",
  },
  {
    id: "internet",
    name: "Интернет-кафе «Вайфай»",
    kind: "work",
    jobs: ["computer"],
    x: 10,
    y: 12,
    w: 3,
    h: 3,
    wall: "#6f7d94",
    roof: "#4e5a6e",
    doorX: 11,
    doorY: 11,
    hasDoor: true,
    desc: "Шесть тупых компьютеров и вечный гул системников. По $2 за час.",
  },
  {
    id: "office",
    name: "Участок «Южный»",
    kind: "work",
    jobs: ["cleaning"],
    x: 26,
    y: 12,
    w: 3,
    h: 3,
    wall: "#7e8a6e",
    roof: "#59634c",
    doorX: 27,
    doorY: 11,
    hasDoor: true,
    desc: "Муниципальная уборка улиц. Здесь оформляют документы.",
  },
  {
    id: "house2",
    name: "Старый дом",
    kind: "house",
    jobs: [],
    x: 25,
    y: 1,
    w: 3,
    h: 2,
    wall: "#756a5e",
    roof: "#554d44",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Соседи съехали давно.",
  },
];

export const START = { x: 13, y: 7 };

/** Раскладка квартала: дорога-перекрёсток, тротуары, парк, здания, лавки, баки, банкоматы. */
export function buildGrid(): Tile[][] {
  const g: Tile[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) row.push({ kind: "dirt", base: "dirt" });
    g.push(row);
  }

  const set = (x: number, y: number, kind: TileKind, b?: string) => {
    const prev = g[y][x];
    g[y][x] = { kind, b, base: prev.base };
  };

  // парк (единственная зелень в квартале)
  for (let y = 11; y <= 16; y++) for (let x = 14; x <= 20; x++) set(x, y, "grass");

  // дороги
  for (let x = 0; x < GRID_W; x++) {
    set(x, 8, "road");
    set(x, 9, "road");
  }
  for (let y = 0; y < GRID_H; y++) {
    set(22, y, "road");
    set(23, y, "road");
  }

  // тротуары вдоль дорог
  for (let x = 0; x < GRID_W; x++) {
    set(x, 7, "sidewalk");
    set(x, 10, "sidewalk");
  }
  for (let y = 0; y < GRID_H; y++) {
    set(21, y, "sidewalk");
    set(24, y, "sidewalk");
  }

  // здания
  for (const b of BUILDINGS) {
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) set(x, y, "building", b.id);
    if (b.hasDoor) {
      set(b.doorX, b.doorY, "door", b.id);
      const inside =
        b.doorY >= b.y && b.doorY < b.y + b.h && b.doorX >= b.x && b.doorX < b.x + b.w;
      if (inside) g[b.doorY][b.doorX].base = "building";
    }
  }

  // деревья в парке
  for (const [x, y] of [
    [15, 12],
    [19, 12],
    [17, 15],
  ])
    set(x, y, "tree");

  // лавки
  for (const [x, y] of [
    [16, 13],
    [19, 14],
  ])
    set(x, y, "bench");

  // мусорные баки
  for (const [x, y] of [
    [7, 6],
    [6, 11],
    [29, 13],
  ])
    set(x, y, "trash");

  // банкоматы
  for (const [x, y] of [
    [11, 6],
    [31, 10],
  ])
    set(x, y, "atm");

  // забор по периметру квартала
  for (let x = 0; x < GRID_W; x++) {
    set(x, 0, "fence");
    set(x, GRID_H - 1, "fence");
  }
  for (let y = 0; y < GRID_H; y++) {
    set(0, y, "fence");
    set(GRID_W - 1, y, "fence");
  }

  return g;
}

export function isWalkable(t: Tile): boolean {
  return (
    t.kind === "dirt" ||
    t.kind === "grass" ||
    t.kind === "road" ||
    t.kind === "sidewalk" ||
    t.kind === "door"
  );
}

export function canWalk(g: Tile[][], x: number, y: number): boolean {
  const t = g[y]?.[x];
  return !!t && isWalkable(t);
}

/** BFS-поиск пути. Возвращает список тайлов (без точки старта) или null. */
export function bfs(
  g: Tile[][],
  sx: number,
  sy: number,
  tx: number,
  ty: number
): [number, number][] | null {
  if (sx === tx && sy === ty) return [];
  const key = (x: number, y: number) => y * GRID_W + x;
  const start = key(sx, sy);
  const target = key(tx, ty);
  const prev = new Map<number, number>();
  const seen = new Set<number>([start]);
  const q: [number, number][] = [[sx, sy]];
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (q.length > 0) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (!canWalk(g, nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, key(x, y));
      if (k === target) {
        const path: [number, number][] = [];
        let c = k;
        while (c !== start) {
          path.push([c % GRID_W, Math.floor(c / GRID_W)]);
          c = prev.get(c)!;
        }
        return path.reverse();
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

export interface Interactive {
  kind: "door" | "bench" | "trash" | "atm";
  x: number;
  y: number;
  b?: string;
}

/** Ближайшее взаимодействуемое: дверь под ногами, затем соседние двери, лавки, банкоматы, баки. */
export function findInteractive(
  g: Tile[][],
  px: number,
  py: number
): Interactive | null {
  const here = g[py]?.[px];
  if (here && here.kind === "door")
    return { kind: "door", x: px, y: py, b: here.b };

  const n: [number, number][] = [
    [px, py - 1],
    [px + 1, py],
    [px, py + 1],
    [px - 1, py],
  ];
  for (const [x, y] of n) {
    const t = g[y]?.[x];
    if (!t) continue;
    if (t.kind === "door") return { kind: "door", x, y, b: t.b };
    if (t.kind === "bench") return { kind: "bench", x, y };
    if (t.kind === "atm") return { kind: "atm", x, y };
  }
  for (const [x, y] of n) {
    const t = g[y]?.[x];
    if (t && t.kind === "trash") return { kind: "trash", x, y };
  }
  return null;
}
