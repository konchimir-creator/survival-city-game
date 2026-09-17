// Проверка: drawFrame реально использует character-sheet.png
// (спрайт 128x192 -> 64x96, якорь у ног, depth-порядок, камера/culling).
// Запуск: npx tsx scripts/verify-sprite.ts
import { drawFrame, makeCityTextures } from "../src/game/render";
import type { CityTextures, FrameInfo } from "../src/game/render";
import { createCamera } from "../src/game/camera";
import { initialState } from "../src/game/reducer";
import type { GameState } from "../src/game/types";

interface Call {
  method: string;
  args: unknown[];
}

function makeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const rec = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };
  const canvasStub = { width: 1280, height: 720 };
  const ctx = {
    canvas: canvasStub,
    setTransform: rec("setTransform"),
    scale: rec("scale"),
    save: rec("save"),
    restore: rec("restore"),
    translate: rec("translate"),
    rotate: rec("rotate"),
    ellipse: rec("ellipse"),
    clearRect: rec("clearRect"),
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    arc: rec("arc"),
    arcTo: rec("arcTo"),
    fill: rec("fill"),
    stroke: rec("stroke"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    closePath: rec("closePath"),
    fillText: rec("fillText"),
    measureText: () => ({ width: 96 }),
    setLineDash: rec("setLineDash"),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    drawImage: rec("drawImage"),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

// ---------- глобальные стабы (Node) ----------
(globalThis as Record<string, unknown>).document = {
  createElement: () => {
    const { ctx } = makeCtx();
    return { width: 0, height: 0, getContext: () => ctx };
  },
};
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  set src(v: string) {
    this._src = v;
    setTimeout(() => this.onload?.(), 5);
  }
  get src() {
    return this._src;
  }
  get complete() {
    return !!this._src;
  }
  get naturalWidth() {
    return this._src ? 1152 : 0;
  }
}
(globalThis as Record<string, unknown>).Image = FakeImage;

// ---------- утилиты ----------
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log("  ok   " + name);
  } else {
    failed++;
    console.log("  FAIL " + name + (extra ? " — " + extra : ""));
  }
}

// drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) — 9 аргументов; кадр листа 128x192
function sheetCalls(calls: Call[]) {
  return calls.filter(
    (c) =>
      c.method === "drawImage" &&
      c.args.length === 9 &&
      c.args[3] === 128 &&
      c.args[4] === 192
  );
}

const TEX: CityTextures = makeCityTextures();

function runFrame(
  state: GameState,
  player: FrameInfo["player"],
  t: number
): Call[] {
  const { ctx, calls } = makeCtx();
  const s = initialState();
  const merged: GameState = { ...s, ...state };
  const cam = createCamera((player.x + 0.5) * 32, (player.y + 0.5) * 32);
  drawFrame(
    ctx,
    TEX,
    {
      state: merged,
      path: [],
      hover: null,
      target: null,
      player,
      weather: "clear",
      npcs: [],
      vehicles: [],
      cam,
      vp: { vw: 1280, vh: 720, dpr: 1 },
    },
    t
  );
  return calls;
}

const basePlayer: FrameInfo["player"] = {
  x: 13,
  y: 7,
  dir: "down",
  mode: "idle",
  riding: false,
  colors: {
    jacket: "#b5433a",
    pants: "#3f4a55",
    shoes: "#555a5f",
    hat: null,
  },
};

// индексы вызовов: ствол дерева (15,12) и вывеска магазина
const TREE_TRUNK = (c: Call[]) =>
  c.findIndex(
    (x) => x.method === "fillRect" && x.args[0] === 15 * 32 + 13.5 && x.args[1] === 12 * 32 + 14
  );
// здание магазина — 5-аргументный drawImage канваса здания (ox=52, oy=92, 184x104)
const SHOP_ART = (c: Call[]) =>
  c.findIndex(
    (x) =>
      x.method === "drawImage" &&
      x.args.length === 5 &&
      x.args[1] === 52 &&
      x.args[2] === 92 &&
      x.args[3] === 184 &&
      x.args[4] === 104
  );
const SHEET_AT = (c: Call[]) => sheetCalls(c).length ? c.findIndex((x) => sheetCalls(c).includes(x as Call)) : -1;

async function main() {
  const base = initialState();

  // 1) до загрузки листа — только placeholder (sheet-вызовов нет)
  const preCalls = runFrame({ ...base, dead: false }, { ...basePlayer }, 0);
  check("до загрузки листа sheet-отрисовки нет (placeholder)", sheetCalls(preCalls).length === 0);

  // 2) загружаем лист один раз
  const { initSheets } = await import("../src/game/sprites");
  initSheets();
  await new Promise((r) => setTimeout(r, 50));
  initSheets(); // повторный вызов — безопасный no-op
  const calls = runFrame({ ...base, dead: false }, { ...basePlayer }, 0);
  const sc = sheetCalls(calls);
  check("после загрузки sheet-кадр рисуется", sc.length === 1);
  check(
    "idle down: source (0,0,128,192)",
    sc.length === 1 && sc[0].args[1] === 0 && sc[0].args[2] === 0,
    JSON.stringify(sc[0]?.args.slice(1))
  );
  // якорь: ноги в (13.5*32, 7.5*32) = (432, 240);
  // dest = (432-32, 240-86) = (400, 154), 64x96 (линия земли кадра y=172 -> feetY)
  check(
    "якорь у ног: dest (400,154,64,96)",
    sc.length === 1 &&
      Math.abs(Number(sc[0].args[5]) - 400) < 1e-6 &&
      Math.abs(Number(sc[0].args[6]) - 154) < 1e-6 &&
      sc[0].args[7] === 64 &&
      sc[0].args[8] === 96,
    JSON.stringify(sc[0]?.args.slice(5))
  );

  // 3) walk-цикл 1→2→3→4 (110 мс/кадр)
  const wc = [0, 110, 220, 330, 440].map((t) =>
    sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, mode: "walk" }, t))[0]?.args[1]
  );
  check(
    "walk цикл source-x 128,256,384,512,128",
    JSON.stringify(wc) === JSON.stringify([128, 256, 384, 512, 128]),
    JSON.stringify(wc)
  );

  // 4) run-цикл 5→6→7→8 (62 мс/кадр)
  const rc = [0, 62, 124, 186, 248].map((t) =>
    sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, mode: "run" }, t))[0]?.args[1]
  );
  check(
    "run цикл source-x 640,768,896,1024,640",
    JSON.stringify(rc) === JSON.stringify([640, 768, 896, 1024, 640]),
    JSON.stringify(rc)
  );

  // 5) ряды направлений (source y = args[2])
  const rows = (["down", "up", "left", "right"] as const).map(
    (dir) =>
      sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, dir }, 0))[0]?.args[2]
  );
  check(
    "ряды down/up/left/right = 0/192/384/576",
    JSON.stringify(rows) === JSON.stringify([0, 192, 384, 576]),
    JSON.stringify(rows)
  );

  // 6) work = idle-кадр
  const workCol =
    sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, mode: "work" }, 1234))[0]?.args[1];
  check("work: кадр idle (колонка 0)", workCol === 0);

  // 7) источник всегда целый
  const frac = sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, mode: "walk" }, 123)).some(
    (c) => !Number.isInteger(c.args[1]) || !Number.isInteger(c.args[2])
  );
  check("source-координаты всегда целые", !frac);

  // 8) depth: игрок ЗА деревом (15,12) — дерево рисуется ПОСЛЕ персонажа
  const behindTree = runFrame({ ...base, dead: false }, { ...basePlayer, x: 14, y: 12 }, 0);
  const frontTree = runFrame({ ...base, dead: false }, { ...basePlayer, x: 15, y: 13 }, 0);
  check(
    "за деревом (запад): дерево поверх персонажа (depth)",
    TREE_TRUNK(behindTree) > SHEET_AT(behindTree) && SHEET_AT(behindTree) >= 0,
    `tree@${TREE_TRUNK(behindTree)} sheet@${SHEET_AT(behindTree)}`
  );
  check(
    "южнее дерева: дерево НЕ поверх персонажа (depth)",
    TREE_TRUNK(frontTree) >= 0 && TREE_TRUNK(frontTree) < SHEET_AT(frontTree),
    `tree@${TREE_TRUNK(frontTree)} sheet@${SHEET_AT(frontTree)}`
  );

  // 9) depth: у двери магазина (4,5) здание поверх персонажа
  const atDoor = runFrame({ ...base, dead: false, facing: "up" }, { ...basePlayer, x: 4, y: 5, dir: "up" }, 0);
  const southOfShop = runFrame({ ...base, dead: false }, { ...basePlayer, x: 4, y: 6 }, 0);
  check(
    "у двери магазина: здание поверх персонажа",
    SHOP_ART(atDoor) > SHEET_AT(atDoor) && SHEET_AT(atDoor) >= 0,
    `sign@${SHOP_ART(atDoor)} sheet@${SHEET_AT(atDoor)}`
  );
  check(
    "южнее магазина: здание НЕ поверх персонажа",
    SHOP_ART(southOfShop) >= 0 && SHOP_ART(southOfShop) < SHEET_AT(southOfShop),
    `sign@${SHOP_ART(southOfShop)} sheet@${SHEET_AT(southOfShop)}`
  );

  // 10) мёртвый персонаж: sheet не рисуется, depth активен
  const dead = runFrame({ ...base, dead: true, x: 14, y: 12 }, { ...basePlayer, x: 14, y: 12 }, 0);
  check("смерть: sheet не рисуется", sheetCalls(dead).length === 0);
  check("смерть: окружение (дерево) рисуется", TREE_TRUNK(dead) >= 0);

  // 11) riding: sheet не используется (арт велосипеда)
  const riding = runFrame({ ...base, dead: false }, { ...basePlayer, riding: true, mode: "run" }, 0);
  check("на велосипеде: sheet не используется", sheetCalls(riding).length === 0);

  console.log(`\nИтог: ${passed} ok, ${failed} fail`);
  if (failed > 0) process.exit(1);
}

main();
