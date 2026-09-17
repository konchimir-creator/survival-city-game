// Временная проверка: drawFrame реально использует character-sheet.png
// (исправный source-прямоугольник, якорь у ног, depth-проход).
// Запуск: npx tsx scripts/verify-sprite.ts
import { drawFrame, initCharacterSheet, makeStaticLayer } from "../src/game/render";
import type { FrameInfo } from "../src/game/render";
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
  const ctx = {
    setTransform: rec("setTransform"),
    scale: () => {},
    translate: () => {},
    ellipse: () => {},
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
    setLineDash: rec("setLineDash"),
    createRadialGradient: () => ({ addColorStop: () => {} }),
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

// drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) — 9 аргументов
function sheetCalls(calls: Call[]) {
  return calls.filter(
    (c) =>
      c.method === "drawImage" &&
      c.args.length === 9 &&
      c.args[3] === 64 &&
      c.args[4] === 96
  );
}

function runFrame(
  state: GameState,
  player: FrameInfo["player"],
  t: number
): Call[] {
  const { ctx, calls } = makeCtx();
  const s = initialState();
  const merged: GameState = { ...s, ...state };
  drawFrame(ctx, makeStaticLayer() as HTMLCanvasElement, {
    state: merged,
    path: [],
    hover: null,
    target: null,
    player,
    weather: "clear",
  }, t);
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

async function main() {
  const base = initialState();

  // 1) до загрузки листа — только placeholder (sheet-вызовов нет)
  const preCalls = runFrame({ ...base, dead: false }, { ...basePlayer }, 0);
  let calls = preCalls;
  check("до загрузки листа sheet-отрисовки нет (placeholder)", sheetCalls(calls).length === 0);

  // 2) загружаем лист один раз
  initCharacterSheet();
  await new Promise((r) => setTimeout(r, 50));
  initCharacterSheet(); // повторный вызов — безопасный no-op
  calls = runFrame({ ...base, dead: false }, { ...basePlayer }, 0);
  const sc = sheetCalls(calls);
  check("после загрузки sheet-кадр рисуется", sc.length === 1);
  check(
    "idle down: source (0,0,64,96)",
    sc.length === 1 && sc[0].args[1] === 0 && sc[0].args[2] === 0,
    JSON.stringify(sc[0]?.args.slice(1))
  );
  // якорь: ноги в (13.5*32, 7.5*32) = (432, 240);
  // dest = (416, 197), 32x48 (рамка кадра 64x96 при масштабе 0.5;
  // линия земли кадра y=86 -> feetY, низ рамки на 5px ниже ног)
  check(
    "якорь у ног: dest (416,197,32,48)",
    sc.length === 1 &&
      Math.abs(Number(sc[0].args[5]) - 416) < 1e-6 &&
      Math.abs(Number(sc[0].args[6]) - 197) < 1e-6 &&
      sc[0].args[7] === 32 &&
      sc[0].args[8] === 48,
    JSON.stringify(sc[0]?.args.slice(5))
  );

  // 3) walk-цикл 1→2→3→4
  const walkCols = [0, 80, 160, 240, 320].map((t) =>
    runFrame({ ...base, dead: false }, { ...basePlayer, mode: "walk" }, t)
  );
  // source x = колонка * 64
  const wc = walkCols.map((c) => sheetCalls(c)[0]?.args[1]);
  check(
    "walk цикл колонок 1,2,3,4,1",
    JSON.stringify(wc) === JSON.stringify([64, 128, 192, 256, 64]),
    JSON.stringify(wc)
  );

  // 4) run-цикл 5→6→7→8
  const runCols = [0, 45, 90, 135, 180].map((t) =>
    runFrame({ ...base, dead: false }, { ...basePlayer, mode: "run" }, t)
  );
  const rc = runCols.map((c) => sheetCalls(c)[0]?.args[1]);
  check(
    "run цикл колонок 5,6,7,8,5",
    JSON.stringify(rc) === JSON.stringify([320, 384, 448, 512, 320]),
    JSON.stringify(rc)
  );

  // 5) ряды направлений (source y = args[2])
  const rows = (["down", "up", "left", "right"] as const).map((dir) =>
    sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, dir }, 0))[0]?.args[2]
  );
  check("ряды down/up/left/right = 0/96/192/288", JSON.stringify(rows) === JSON.stringify([0, 96, 192, 288]), JSON.stringify(rows));

  // 6) work = idle-кадр + без дублей
  const workCol = sheetCalls(runFrame({ ...base, dead: false }, { ...basePlayer, mode: "work" }, 1234))[0]?.args[1];
  check("work: кадр idle (колонка 0)", workCol === 0);

  // 7) источник всегда целый
  calls = runFrame({ ...base, dead: false }, { ...basePlayer, mode: "walk" }, 123);
  const frac = sheetCalls(calls).some(
    (c) => !Number.isInteger(c.args[1]) || !Number.isInteger(c.args[4])
  );
  check("source-координаты всегда целые", !frac);

  // 8) depth: игрок ЗА деревом (15,12) — та же строка, дерево перечерчивается поверх;
  // южнее дерева — персонаж перед ним, redraw не нужен
  const behindTree = runFrame({ ...base, dead: false }, { ...basePlayer, x: 14, y: 12 }, 0);
  const frontTree = runFrame({ ...base, dead: false }, { ...basePlayer, x: 15, y: 13 }, 0);
  const treeTrunk = (c: Call[]) =>
    c.some((x) => x.method === "fillRect" && x.args[0] === 15 * 32 + 13 && x.args[1] === 12 * 32 + 15);
  check("за деревом (запад, та же строка): ствол перечерчивается (depth)", treeTrunk(behindTree));
  check("южнее дерева: ствол НЕ перечерчивается (depth)", !treeTrunk(frontTree));

  // 9) depth: на двери магазина (4,5) здание перечерчивается (вывеска)
  const atDoor = runFrame({ ...base, dead: false, facing: "up" }, { ...basePlayer, x: 4, y: 5, dir: "up" }, 0);
  const southOfShop = runFrame({ ...base, dead: false }, { ...basePlayer, x: 4, y: 6 }, 0);
  const shopSign = (c: Call[]) => c.some((x) => x.method === "fillText" && x.args[0] === "Продукты «Скидка»");
  check("у двери магазина: здание поверх персонажа", shopSign(atDoor));
  check("южнее магазина: здание НЕ поверх персонажа", !shopSign(southOfShop));

  // 10) mёртвый персонаж: depth тоже работает, sheet не рисуется
  const dead = runFrame({ ...base, dead: true, x: 14, y: 12 }, { ...basePlayer, x: 14, y: 12 }, 0);
  check("смерть: sheet не рисуется", sheetCalls(dead).length === 0);
  check("смерть: depth-проход активен", treeTrunk(dead));

  // 11) riding: sheet не используется (арт велосипеда), placeholder-тень рисуется
  const riding = runFrame({ ...base, dead: false }, { ...basePlayer, riding: true, mode: "run" }, 0);
  check("на велосипеде: sheet не используется", sheetCalls(riding).length === 0);

  console.log(`\nИтог: ${passed} ok, ${failed} fail`);
  if (failed > 0) process.exit(1);
}

main();
