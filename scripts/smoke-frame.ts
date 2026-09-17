// Смоук-тест кадра: динамические сущности (NPC/машины), ночь, дождь,
// крайние позиции камеры, миникарта. Ловит рантайм-ошибки логики отрисовки.
// Запуск: npx tsx scripts/smoke-frame.ts
import { drawFrame, drawMinimap, makeCityTextures } from "../src/game/render";
import type { CityTextures, FrameInfo } from "../src/game/render";
import { clampCamera, createCamera } from "../src/game/camera";
import { initialState } from "../src/game/reducer";
import type { GameState } from "../src/game/types";
import { createNpcs, createVehicles, updateNpcs, updateVehicles } from "../src/game/entities";

// строгий стаб: любой неизвестный метод — ошибка
function makeCtx() {
  const calls = { n: 0 };
  const known = new Set([
    "setTransform", "scale", "save", "restore", "translate", "rotate", "ellipse",
    "clearRect", "fillRect", "strokeRect", "beginPath", "arc", "arcTo", "fill",
    "stroke", "moveTo", "lineTo", "closePath", "fillText", "measureText",
    "setLineDash", "createRadialGradient", "createLinearGradient", "drawImage",
  ]);
  const base: Record<string, unknown> = {
    canvas: { width: 1920, height: 1080 },
    measureText: () => ({ width: 96 }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  for (const m of known) {
    if (m === "createRadialGradient" || m === "createLinearGradient") {
      base[m] = (..._a: unknown[]) => {
        calls.n++;
        return { addColorStop: () => {} };
      };
      continue;
    }
    if (m === "measureText") {
      base[m] = (..._a: unknown[]) => {
        calls.n++;
        return { width: 96 };
      };
      continue;
    }
    base[m] = (..._a: unknown[]) => {
      calls.n++;
    };
  }
  const handler: ProxyHandler<typeof base> = {
    get(target, prop: PropertyKey) {
      if (typeof prop === "symbol") return undefined;
      if (prop in target) return target[prop];
      if (typeof prop === "string") {
        // свойства цвета/линий — молча принимаем
        if (
          prop === "fillStyle" || prop === "strokeStyle" || prop === "lineWidth" ||
          prop === "lineCap" || prop === "lineJoin" || prop === "globalAlpha" ||
          prop === "font" || prop === "textAlign" || prop === "textBaseline" ||
          prop === "shadowColor" || prop === "shadowBlur"
        )
          return "#000";
        throw new Error("Неизвестный метод ctx: " + String(prop));
      }
      return undefined;
    },
    set() {
      return true;
    },
  };
  return { ctx: new Proxy(base, handler) as unknown as CanvasRenderingContext2D, calls };
}

(globalThis as Record<string, unknown>).document = {
  createElement: () => {
    const { ctx } = makeCtx();
    return { width: 0, height: 0, getContext: () => ctx };
  },
};
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _s = "";
  set src(v: string) {
    this._s = v;
    setTimeout(() => this.onload?.(), 5);
  }
  get src() {
    return this._s;
  }
  get complete() {
    return !!this._s;
  }
  get naturalWidth() {
    return this._s ? 1152 : 0;
  }
}
(globalThis as Record<string, unknown>).Image = FakeImage;

async function main() {
  const { initSheets } = await import("../src/game/sprites");
  initSheets();
  await new Promise((r) => setTimeout(r, 50));
  const tex: CityTextures = makeCityTextures();
  const npcs = createNpcs(20);
  const vehicles = createVehicles();
  const base = initialState();

  let errors = 0;
  const frame = (
    name: string,
    opts: {
      minutes?: number;
      weather?: "clear" | "overcast" | "rain";
      x?: number;
      y?: number;
      vw?: number;
      vh?: number;
      dead?: boolean;
    } = {}
  ) => {
    try {
      const { ctx, calls } = makeCtx();
      const vw = opts.vw ?? 1920;
      const vh = opts.vh ?? 1080;
      const px = opts.x ?? 13;
      const py = opts.y ?? 7;
      const cam = createCamera((px + 0.5) * 32, (py + 0.5) * 32);
      clampCamera(cam, vw, vh);
      const state: GameState = {
        ...base,
        dead: opts.dead ?? false,
        x: px,
        y: py,
        minutes: opts.minutes ?? 12 * 60,
        weather: opts.weather ?? "clear",
      };
      const info: FrameInfo = {
        state,
        path: [],
        hover: null,
        target: null,
        player: {
          x: px,
          y: py,
          dir: "down",
          mode: "idle",
          riding: false,
          colors: { jacket: "#b5433a", pants: "#3f4a55", shoes: "#555a5f", hat: null },
        },
        weather: state.weather,
        npcs,
        vehicles,
        cam,
        vp: { vw, vh, dpr: 1 },
      };
      drawFrame(ctx, tex, info, 1234);
      // симуляция: шаг вперёд и ещё кадр
      updateNpcs(npcs, 1000, 2234);
      updateVehicles(vehicles, 1000);
      drawFrame(ctx, tex, info, 2234);
      // миникарта
      const { ctx: mctx } = makeCtx();
      (mctx.canvas as { width: number; height: number }).width = 192;
      (mctx.canvas as { width: number; height: number }).height = 96;
      drawMinimap(mctx, tex.minimapBase, px, py, { x: px + 1, y: py }, cam, info.vp, 1234);
      if (calls.n < 100) throw new Error("слишком мало вызовов ctx — кадр пустой");
      console.log(`  ok   ${name} (${calls.n} ctx-вызовов)`);
    } catch (e) {
      errors++;
      console.log(`  FAIL ${name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  frame("день, старт (1920x1080)");
  frame("день, 1366x768");
  frame("день, маленький экран 768x500");
  frame("ночь 23:00, дождь, старый район");
  frame("ночь 23:00, дождь, восточный район");
  frame("рассвет 6:00, северная линия");
  frame("закат 20:00, южный парк");
  frame("камера в левом верхнем углу мира", { x: 1, y: 1 });
  frame("камера в правом нижнем углу мира", { x: 94, y: 46 });
  frame("смерть в центре перекрёстка", { x: 54, y: 8, dead: true, minutes: 22 * 60, weather: "rain" });
  frame("перекрёсток с машинами и NPC, дождь", { x: 54, y: 8, weather: "rain", minutes: 14 * 60 });

  console.log(errors === 0 ? "\nСмоук: все кадры ок" : `\nСмоук: ${errors} ошибок`);
  process.exit(errors === 0 ? 0 : 1);
}

main();
