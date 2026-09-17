// Мир игры: сетка тайлов, здания, путь, взаимодействия.
// Квартал 96x48 тайлов (3072x1536 px). Старый район (x0..33, y0..16) не изменён —
// старые сохранения остаются совместимыми.

export const TILE = 32;
export const GRID_W = 96;
export const GRID_H = 48;

export type GroundKind = "dirt" | "grass" | "road" | "sidewalk" | "building";
export type TileKind =
  | GroundKind
  | "door"
  | "fence"
  | "tree"
  | "bench"
  | "trash"
  | "atm"
  | "crate";

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
  kind: "shop" | "shelter" | "work" | "house" | "police";
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
  /* ---------- старый район (не менять) ---------- */
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

  /* ---------- северная линия, восток от старого района ---------- */
  {
    id: "shop2",
    name: "Продукты «Угол»",
    kind: "shop",
    jobs: ["seller"],
    x: 35,
    y: 1,
    w: 4,
    h: 3,
    wall: "#8a7a66",
    roof: "#5f5648",
    doorX: 37,
    doorY: 3,
    hasDoor: true,
    desc: "Дешевле «Скидки», почти. Почти — это когда есть.",
  },
  {
    id: "cafe2",
    name: "Кафе «Борщ»",
    kind: "work",
    jobs: ["kitchen"],
    x: 40,
    y: 1,
    w: 4,
    h: 3,
    wall: "#97665a",
    roof: "#6d463c",
    doorX: 42,
    doorY: 3,
    hasDoor: true,
    desc: "Борщ по-домашнему, если это вообще возможно в этом городе.",
  },
  {
    id: "hospital",
    name: "Больница",
    kind: "work",
    jobs: ["med1", "nurse"],
    x: 45,
    y: 1,
    w: 4,
    h: 3,
    wall: "#8aa0a6",
    roof: "#5d6d72",
    doorX: 47,
    doorY: 3,
    hasDoor: true,
    desc: "Больше «Медпункта», дороже, но с настоящим кроссом на стене.",
  },
  {
    id: "house3",
    name: "Старый дом",
    kind: "house",
    jobs: [],
    x: 49,
    y: 1,
    w: 3,
    h: 2,
    wall: "#70655b",
    roof: "#50483f",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Кто-то жил, кто-то ушёл.",
  },
  {
    id: "police",
    name: "Полиция",
    kind: "police",
    jobs: [],
    x: 57,
    y: 1,
    w: 4,
    h: 3,
    wall: "#4d5a70",
    roof: "#39445a",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Служба. Сигнальная мигалка на крыше, мигает даже днём.",
  },
  {
    id: "warehouse2",
    name: "Склад №12",
    kind: "work",
    jobs: ["loading", "courier"],
    x: 62,
    y: 1,
    w: 5,
    h: 3,
    wall: "#96856e",
    roof: "#6d6050",
    doorX: 64,
    doorY: 3,
    hasDoor: true,
    desc: "Паллеты, ящики и запах картонки. Платят по часам.",
  },
  {
    id: "garage2",
    name: "Автосервис «Пит-Лайн»",
    kind: "work",
    jobs: ["mechanic1", "mechanic2"],
    x: 68,
    y: 1,
    w: 4,
    h: 3,
    wall: "#87705f",
    roof: "#5f4f40",
    doorX: 70,
    doorY: 3,
    hasDoor: true,
    desc: "Тут чинят всё, кроме судьбы. Подъёмник, сварка, кофе.",
  },
  {
    id: "house4",
    name: "Заброшенный дом",
    kind: "house",
    jobs: [],
    x: 73,
    y: 1,
    w: 3,
    h: 2,
    wall: "#6b6057",
    roof: "#4c443c",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Крышу несёт, как и хозяина в прошлом веке.",
  },
  {
    id: "office2",
    name: "Офис «Северный»",
    kind: "work",
    jobs: ["computer"],
    x: 81,
    y: 1,
    w: 4,
    h: 3,
    wall: "#75809a",
    roof: "#4f5a74",
    doorX: 83,
    doorY: 3,
    hasDoor: true,
    desc: "Стекляшки, кондиционер и удалёнка для тех, у кого есть компьютер.",
  },
  {
    id: "house5",
    name: "Старый дом",
    kind: "house",
    jobs: [],
    x: 86,
    y: 1,
    w: 4,
    h: 3,
    wall: "#776c60",
    roof: "#564d42",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Долго стоял, ещё постоит.",
  },
  {
    id: "house6",
    name: "Заброшенный дом",
    kind: "house",
    jobs: [],
    x: 91,
    y: 1,
    w: 3,
    h: 2,
    wall: "#685d53",
    roof: "#494138",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Тут даже воробьи не гнёздят.",
  },

  /* ---------- южная линия ---------- */
  {
    id: "shop3",
    name: "Продукты «Сад»",
    kind: "shop",
    jobs: ["seller"],
    x: 35,
    y: 34,
    w: 4,
    h: 3,
    wall: "#8a7a66",
    roof: "#5f5648",
    doorX: 37,
    doorY: 36,
    hasDoor: true,
    desc: "Свежий хлеб до девяти, дальше — вчерашний. Но тоже свежий.",
  },
  {
    id: "clinic2",
    name: "Медпункт «Южный»",
    kind: "work",
    jobs: ["med1"],
    x: 40,
    y: 34,
    w: 4,
    h: 3,
    wall: "#7fa08f",
    roof: "#587567",
    doorX: 42,
    doorY: 36,
    hasDoor: true,
    desc: "Фельдшер, два кабинета и душ, который иногда работает.",
  },
  {
    id: "cafe3",
    name: "Кафе «Огонёк»",
    kind: "work",
    jobs: ["kitchen"],
    x: 45,
    y: 34,
    w: 4,
    h: 3,
    wall: "#9b6b5a",
    roof: "#71463a",
    doorX: 47,
    doorY: 36,
    hasDoor: true,
    desc: "Шашлычный сезон круглый год. Дым, огонь, деньги.",
  },
  {
    id: "house7",
    name: "Старый дом",
    kind: "house",
    jobs: [],
    x: 50,
    y: 34,
    w: 3,
    h: 2,
    wall: "#6e6259",
    roof: "#4f463f",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Соседи говорят, что в подвале что-то живёт.",
  },
  {
    id: "internet2",
    name: "Интернет-кафе «Центр»",
    kind: "work",
    jobs: ["computer"],
    x: 57,
    y: 34,
    w: 4,
    h: 3,
    wall: "#6f7d94",
    roof: "#4e5a6e",
    doorX: 59,
    doorY: 36,
    hasDoor: true,
    desc: "Второй по счёту. Системники поновее, цены те же.",
  },
  {
    id: "market",
    name: "Рынок «Южный»",
    kind: "shop",
    jobs: ["seller"],
    x: 62,
    y: 34,
    w: 5,
    h: 3,
    wall: "#93806a",
    roof: "#685946",
    doorX: 64,
    doorY: 36,
    hasDoor: true,
    desc: "Прилавок, ящики, честные (почти) цены. Здесь же принимают вещи.",
  },
  {
    id: "shelter2",
    name: "Ночлежка «Тёплая»",
    kind: "shelter",
    jobs: [],
    x: 68,
    y: 34,
    w: 4,
    h: 3,
    wall: "#8a7f6a",
    roof: "#655d4c",
    doorX: 70,
    doorY: 36,
    hasDoor: true,
    desc: "Вторая ночлежка города. Койки потеплее, люди потише.",
  },
  {
    id: "house8",
    name: "Заброшенный дом",
    kind: "house",
    jobs: [],
    x: 73,
    y: 34,
    w: 3,
    h: 2,
    wall: "#6b6057",
    roof: "#4c443c",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Дверь сломана лет десять назад.",
  },
  {
    id: "house9",
    name: "Старый дом",
    kind: "house",
    jobs: [],
    x: 81,
    y: 34,
    w: 4,
    h: 3,
    wall: "#776c60",
    roof: "#564d42",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Кто-то недавно красил забор. Это хорошо, правда?",
  },
  {
    id: "house10",
    name: "Школа",
    kind: "house",
    jobs: [],
    x: 86,
    y: 34,
    w: 4,
    h: 3,
    wall: "#8d8478",
    roof: "#61584c",
    doorX: -1,
    doorY: -1,
    hasDoor: false,
    desc: "Занятия перенесли «на неопределённый срок» в 2019-м.",
  },
];

export const START = { x: 13, y: 7 };

/** Раскладка квартала: старый район + расширенные улицы, парки и новые здания. */
export function buildGrid(): Tile[][] {
  const g: Tile[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) row.push({ kind: "dirt", base: "dirt" });
    g.push(row);
  }

  const set = (x: number, y: number, kind: TileKind, b?: string) => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
    const prev = g[y][x];
    // «грунтовые» виды задают и грунт под собой; объекты (дерево, лавка…)
    // оставляют прежний грунт видимым
    const isGround =
      kind === "dirt" || kind === "grass" || kind === "road" || kind === "sidewalk" || kind === "building";
    g[y][x] = { kind, b, base: isGround ? (kind as GroundKind) : prev.base };
  };
  const base = (x: number, y: number, kind: GroundKind) => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return;
    g[y][x].base = kind;
  };

  /* ---------- зелёные зоны ---------- */
  // старый парк
  for (let y = 11; y <= 16; y++) for (let x = 14; x <= 20; x++) set(x, y, "grass");
  // большой южный парк (под старым районом)
  for (let y = 18; y <= 28; y++) for (let x = 1; x <= 32; x++) set(x, y, "grass");
  // сквер восточнее старого района
  for (let y = 11; y <= 16; y++) for (let x = 58; x <= 75; x++) set(x, y, "grass");
  // восточный парк
  for (let y = 18; y <= 28; y++) for (let x = 82; x <= 94; x++) set(x, y, "grass");
  // южные скверы
  for (let y = 38; y <= 45; y++) for (let x = 36; x <= 52; x++) set(x, y, "grass");
  for (let y = 38; y <= 45; y++) for (let x = 82; x <= 94; x++) set(x, y, "grass");

  /* ---------- дороги ---------- */
  // главная горизонтальная (продолжена через весь квартал)
  for (let x = 0; x < GRID_W; x++) {
    set(x, 8, "road");
    set(x, 9, "road");
  }
  // южная горизонтальная
  for (let x = 0; x < GRID_W; x++) {
    set(x, 30, "road");
    set(x, 31, "road");
  }
  // вертикальные
  for (let y = 0; y < GRID_H; y++) {
    set(22, y, "road");
    set(23, y, "road");
    set(54, y, "road");
    set(55, y, "road");
    set(78, y, "road");
    set(79, y, "road");
  }

  /* ---------- тротуары ---------- */
  for (let x = 0; x < GRID_W; x++) {
    set(x, 7, "sidewalk");
    set(x, 10, "sidewalk");
    set(x, 29, "sidewalk");
    set(x, 32, "sidewalk");
  }
  for (let y = 0; y < GRID_H; y++) {
    set(21, y, "sidewalk");
    set(24, y, "sidewalk");
    set(53, y, "sidewalk");
    set(56, y, "sidewalk");
    set(77, y, "sidewalk");
    set(80, y, "sidewalk");
  }

  /* ---------- здания ---------- */
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

  /* ---------- парк / зелень (старые объекты) ---------- */
  for (const [x, y] of [
    [15, 12],
    [19, 12],
    [17, 15],
  ])
    set(x, y, "tree");
  for (const [x, y] of [
    [16, 13],
    [19, 14],
  ])
    set(x, y, "bench");
  for (const [x, y] of [
    [7, 6],
    [6, 11],
    [29, 13],
  ])
    set(x, y, "trash");
  for (const [x, y] of [
    [11, 6],
    [31, 10],
  ])
    set(x, y, "atm");

  /* ---------- новые деревья ---------- */
  for (const [x, y] of [
    // южный парк
    [5, 20],
    [9, 24],
    [14, 19],
    [18, 25],
    [23, 19],
    [27, 24],
    [30, 20],
    [12, 27],
    [26, 27],
    // сквер
    [60, 13],
    [64, 15],
    [68, 12],
    [72, 14],
    // восточный парк
    [84, 20],
    [88, 19],
    [92, 24],
    [86, 26],
    // южные скверы
    [39, 40],
    [44, 43],
    [48, 39],
    [84, 40],
    [89, 43],
    // фронтальные деревья вдоль улиц
    [34, 5],
    [52, 6],
    [57, 4],
    [76, 5],
    [80, 4],
    [94, 5],
    [34, 12],
    [52, 14],
    [76, 12],
    [80, 15],
    [94, 13],
    [34, 33],
    [76, 33],
    [80, 39],
    [95, 33],
    [9, 38],
    [30, 42],
    [58, 44],
    [75, 40],
  ])
    set(x, y, "tree");

  /* ---------- новые лавки / баки / банкоматы ---------- */
  for (const [x, y] of [
    [11, 22],
    [21, 23],
    [28, 26],
    [62, 13],
    [70, 14],
    [87, 22],
    [91, 26],
    [42, 41],
    [86, 41],
  ])
    set(x, y, "bench");
  for (const [x, y] of [
    [40, 7],
    [62, 7],
    [44, 10],
    [36, 32],
    [66, 32],
    [74, 29],
    [20, 21],
    [60, 44],
  ])
    set(x, y, "trash");
  for (const [x, y] of [
    [49, 6],
    [60, 33],
    [76, 8],
    [10, 30],
  ])
    set(x, y, "atm");

  /* ---------- ящики у складов (блокируют проход) ---------- */
  for (const [x, y] of [
    [61, 5],
    [67, 5],
    [61, 37],
    [67, 37],
  ])
    set(x, y, "crate");

  /* ---------- забор по периметру ---------- */
  for (let x = 0; x < GRID_W; x++) {
    set(x, 0, "fence");
    set(x, GRID_H - 1, "fence");
  }
  for (let y = 0; y < GRID_H; y++) {
    set(0, y, "fence");
    set(GRID_W - 1, y, "fence");
  }
  // ворота из старого района на главную улицу
  set(33, 8, "road");
  set(33, 9, "road");

  // газон у южной границы парка (под старым районом) — база уже grass
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

/* ================= декор (не блокирует проход) ================= */

export type DecorKind =
  | "lamp"
  | "sign"
  | "hydrant"
  | "bush"
  | "pole"
  | "billboard"
  | "bag"
  | "parking"
  | "parked-car";

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  /** доп. данные (например, ориентация/вариант) */
  v?: number;
}

function buildDecor(): Decor[] {
  const d: Decor[] = [];
  const has = (x: number, y: number, kinds: string[]) => {
    // декор не ставим на тайлы объектов/зданий
    return !kinds.includes("x");
  };
  void has;

  // фонари: вдоль основных тротуаров
  const lampRows: [number, number[]][] = [
    [7, [36, 41, 46, 51, 59, 65, 71, 75, 84, 89, 94]],
    [10, [38, 58, 68, 88, 10, 18, 26]],
    [29, [4, 12, 20, 28, 40, 48, 58, 66, 74, 84, 92]],
    [32, [36, 46, 56, 66, 76, 86, 94, 8]],
  ];
  for (const [y, xs] of lampRows) for (const x of xs) d.push({ kind: "lamp", x, y });
  const lampCols: [number, number[]][] = [
    [53, [2, 6, 12, 16, 22, 26, 36, 42, 46]],
    [56, [4, 20, 34, 44]],
    [77, [2, 10, 18, 26, 38, 46]],
    [80, [6, 14, 24, 34, 44]],
  ];
  for (const [x, ys] of lampCols) for (const y of ys) d.push({ kind: "lamp", x, y });

  // дорожные знаки у перекрёстков
  for (const [x, y] of [
    [53, 7],
    [56, 10],
    [77, 7],
    [80, 10],
    [53, 29],
    [56, 32],
    [77, 29],
    [80, 32],
    [21, 7],
    [24, 10],
    [52, 29],
    [57, 32],
  ])
    d.push({ kind: "sign", x, y });

  // пожарные гидранты
  for (const [x, y] of [
    [57, 9],
    [77, 8],
    [57, 31],
    [77, 30],
    [23, 10],
    [54, 7],
  ])
    d.push({ kind: "hydrant", x, y });

  // столбы (у линий/вывесок)
  for (const [x, y] of [
    [35, 6],
    [44, 6],
    [51, 6],
    [62, 6],
    [73, 6],
    [81, 6],
    [35, 33],
    [44, 33],
    [51, 33],
    [61, 33],
    [72, 33],
    [81, 33],
    [14, 7],
    [20, 7],
    [28, 10],
    [16, 29],
    [24, 29],
  ])
    d.push({ kind: "pole", x, y });

  // кусты: у заборов, парков, у оснований зданий
  for (const [x, y] of [
    [3, 2],
    [8, 2],
    [13, 2],
    [21, 2],
    [25, 2],
    [3, 14],
    [12, 14],
    [22, 13],
    [31, 2],
    [34, 2],
    [34, 12],
    [52, 2],
    [57, 2],
    [66, 2],
    [76, 2],
    [80, 2],
    [90, 2],
    [34, 15],
    [52, 13],
    [76, 15],
    [80, 12],
    [94, 12],
    [34, 37],
    [52, 37],
    [76, 37],
    [80, 37],
    [94, 37],
    [9, 39],
    [29, 39],
    [9, 44],
    [29, 44],
    [6, 19],
    [29, 19],
    [84, 19],
    [92, 19],
    [84, 27],
    [92, 27],
  ])
    d.push({ kind: "bush", x, y, v: (x * 31 + y * 17) % 3 });

  // рекламные щиты
  for (const [x, y] of [
    [35, 17],
    [95, 18],
    [1, 17],
    [75, 17],
  ])
    d.push({ kind: "billboard", x, y, v: (x + y) % 3 });

  // пакеты мусора
  for (const [x, y] of [
    [34, 8],
    [77, 9],
    [56, 31],
    [20, 24],
    [88, 23],
    [44, 38],
  ])
    d.push({ kind: "bag", x, y, v: (x * 7 + y) % 3 });

  // парковочные места (разметка на грунте)
  for (let x = 58; x <= 70; x += 2) {
    d.push({ kind: "parking", x, y: 40, v: 0 });
    d.push({ kind: "parking", x, y: 43, v: 1 });
  }

  // припаркованные машины (декор, на парковке)
  for (const [x, y] of [
    [59, 40],
    [65, 40],
    [69, 43],
  ])
    d.push({ kind: "parked-car", x, y, v: x % 3 });

  return d;
}

export const DECOR: Decor[] = buildDecor();

/** Пешеходные переходы (зебра) — по тайлам, на которых рисуются полосы. */
export const CROSSWALKS: { x: number; y: number; dir: "h" | "v" }[] = (() => {
  const list: { x: number; y: number; dir: "h" | "v" }[] = [];
  const corners: [number, number][] = [
    [54, 8],
    [55, 8],
    [54, 30],
    [55, 30],
    [78, 8],
    [79, 8],
    [78, 30],
    [79, 30],
  ];
  for (const [cx, cy] of corners) {
    list.push({ x: cx - 1, y: cy, dir: "v" }); // западный заход
    list.push({ x: cx + 1, y: cy, dir: "v" }); // восточный заход
    list.push({ x: cx, y: cy - 1, dir: "h" }); // северный заход
    list.push({ x: cx, y: cy + 1, dir: "h" }); // южный заход
  }
  return list;
})();

/** Люки (позиции на дорогах). */
export const MANHOLES: [number, number][] = [
  [38, 8],
  [72, 9],
  [55, 18],
  [79, 40],
  [12, 9],
  [30, 8],
  [60, 30],
  [90, 31],
  [8, 30],
  [46, 9],
];

/** Лужи (дорога); в дождь — заметнее. */
export const PUDDLES: [number, number][] = [
  [36, 9],
  [66, 8],
  [55, 22],
  [78, 12],
  [8, 9],
  [48, 31],
  [70, 30],
  [92, 8],
  [20, 30],
  [84, 9],
];
