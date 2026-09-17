"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Building } from "@/game/world";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
  TILE,
  bfs,
  buildGrid,
  canWalk,
  findInteractive,
} from "@/game/world";
import type { ItemId, Job } from "@/game/data";
import { ITEMS, JOBS, SHOP_CLOSE, SHOP_ITEMS, SHOP_OPEN, SHELTER_COST } from "@/game/data";
import type { Action, GameState } from "@/game/reducer";
import { fmtTime, initialState, reducer } from "@/game/reducer";
import { drawFrame, makeStaticLayer } from "@/game/render";

type Dialog =
  | { kind: "building"; b: Building }
  | { kind: "bench" }
  | { kind: "trash" }
  | null;

interface PanelProps {
  s: GameState;
  dispatch: React.Dispatch<Action>;
}

const hourOf = (s: GameState) => Math.floor(s.minutes / 60);

const cardCls = "rounded-lg border border-neutral-700 bg-neutral-900 p-3";
const actionBtn = (ok: boolean) =>
  `px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
    ok
      ? "bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400"
      : "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
  }`;
const ghostBtn =
  "px-3 py-2 rounded-lg text-sm border border-neutral-700 bg-neutral-800/70 hover:bg-neutral-800 text-neutral-200";

export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const grid = useMemo(() => buildGrid(), []);
  const [staticLayer, setStaticLayer] = useState<HTMLCanvasElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const pathRef = useRef<[number, number][]>([]);
  const hoverRef = useRef<[number, number] | null>(null);
  const lastStepRef = useRef(0);
  const tickAccRef = useRef(0);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [started, setStarted] = useState(false);

  // шаг в заданном направлении (клавиатура, D-pad, следование по пути)
  const tryStep = (dx: number, dy: number) => {
    const g = stateRef.current;
    if (g.dead) return;
    const nx = g.x + dx;
    const ny = g.y + dy;
    if (!canWalk(grid, nx, ny)) return;
    pathRef.current = [];
    lastStepRef.current = performance.now();
    dispatch({ type: "step", x: nx, y: ny });
    const t = grid[ny][nx];
    if (t.kind === "door") {
      const b = BUILDINGS.find((bb) => bb.id === t.b);
      if (b) setDialog({ kind: "building", b });
    } else {
      setDialog(null);
    }
  };

  // взаимодействие с ближайшим объектом (E / Enter)
  const pressE = () => {
    const g = stateRef.current;
    if (g.dead) return;
    const t = findInteractive(grid, g.x, g.y);
    if (!t) return;
    if (t.kind === "door") {
      const b = BUILDINGS.find((bb) => bb.id === t.b);
      if (b) setDialog({ kind: "building", b });
    } else if (t.kind === "bench") {
      setDialog({ kind: "bench" });
    } else {
      setDialog({ kind: "trash" });
    }
  };

  const tryStepRef = useRef(tryStep);
  tryStepRef.current = tryStep;
  const pressERef = useRef(pressE);
  pressERef.current = pressE;

  // статичный слой квартала
  useEffect(() => {
    setStaticLayer(makeStaticLayer());
  }, []);

  // главный цикл: пассивное время, движение, отрисовка
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const g = stateRef.current;

      if (!g.dead) {
        // мир «живёт»: 15 игровых минут каждые 5 реальных секунд
        tickAccRef.current += dt;
        while (tickAccRef.current >= 5000) {
          tickAccRef.current -= 5000;
          dispatch({ type: "tick", minutes: 15 });
        }

        if (now - lastStepRef.current > 150) {
          const k = keysRef.current;
          if (k.KeyW || k.ArrowUp) tryStepRef.current(0, -1);
          else if (k.KeyS || k.ArrowDown) tryStepRef.current(0, 1);
          else if (k.KeyA || k.ArrowLeft) tryStepRef.current(-1, 0);
          else if (k.KeyD || k.ArrowRight) tryStepRef.current(1, 0);
          else if (pathRef.current.length > 0) {
            const [nx, ny] = pathRef.current[0];
            if (nx === g.x && ny === g.y) {
              pathRef.current = pathRef.current.slice(1);
            } else if (canWalk(grid, nx, ny)) {
              tryStepRef.current(nx - g.x, ny - g.y);
            } else {
              pathRef.current = [];
            }
          }
        }
      }

      const cv = canvasRef.current;
      if (cv && staticLayer) {
        const ctx = cv.getContext("2d");
        if (ctx) {
          const t = findInteractive(grid, g.x, g.y);
          drawFrame(
            ctx,
            staticLayer,
            {
              state: g,
              path: pathRef.current,
              hover: hoverRef.current,
              target: t ? { x: t.x, y: t.y } : null,
            },
            now
          );
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, staticLayer, grid]);

  // клавиатура
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const c = e.code;
      if (
        c === "KeyW" ||
        c === "KeyA" ||
        c === "KeyS" ||
        c === "KeyD" ||
        c === "ArrowUp" ||
        c === "ArrowDown" ||
        c === "ArrowLeft" ||
        c === "ArrowRight"
      ) {
        e.preventDefault();
        keysRef.current[c] = true;
      } else if (c === "KeyE" || c === "Enter") {
        pressERef.current();
      } else if (c === "KeyI") {
        setInvOpen((v) => !v);
      } else if (c === "Escape") {
        setDialog(null);
        setInvOpen(false);
        setHelpOpen(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started]);

  const tileFromEvent = (e: React.MouseEvent): [number, number] | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * GRID_W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * GRID_H);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return [x, y];
  };

  const clickAt = (x: number, y: number) => {
    const g = stateRef.current;
    if (g.dead) return;
    const t = grid[y][x];
    if (t.kind === "bench" || t.kind === "trash") {
      if (Math.abs(x - g.x) + Math.abs(y - g.y) <= 1) {
        setDialog(t.kind === "bench" ? { kind: "bench" } : { kind: "trash" });
      }
      return;
    }
    if (t.kind === "door" || canWalk(grid, x, y)) {
      const p = bfs(grid, g.x, g.y, x, y);
      if (p) pathRef.current = p;
      return;
    }
    if (t.kind === "building") {
      const b = BUILDINGS.find((bb) => bb.id === t.b);
      if (b && b.hasDoor) {
        const p = bfs(grid, g.x, g.y, b.doorX, b.doorY);
        if (p) pathRef.current = p;
      }
    }
  };

  const hour = hourOf(state);
  const night = hour >= 21 || hour < 6;
  const invCount = Object.values(state.inv).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col items-center gap-3 px-3 py-4 select-none">
      {/* верхняя панель */}
      <header className="w-full max-w-[1220px] flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-wide text-amber-300">🏚️ Бедный квартал</h1>
          <span className="hidden sm:inline text-xs text-neutral-500">2D survival RPG · MVP</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 tabular-nums">
            {night ? "🌙" : "☀️"} День {state.day} · {fmtTime(state.minutes)}
          </span>
          <span className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 tabular-nums text-emerald-300">
            💵 ${state.money}
          </span>
        </div>
      </header>

      <div className="w-full max-w-[1220px] flex flex-col lg:flex-row gap-3 items-start">
        {/* карта */}
        <div className="relative w-full lg:flex-1">
          <canvas
            ref={canvasRef}
            width={GRID_W * TILE * 2}
            height={GRID_H * TILE * 2}
            className="w-full h-auto rounded-lg border border-neutral-800 shadow-2xl cursor-pointer"
            onClick={(e) => {
              const p = tileFromEvent(e);
              if (p) clickAt(p[0], p[1]);
            }}
            onMouseMove={(e) => {
              hoverRef.current = tileFromEvent(e);
            }}
            onMouseLeave={() => {
              hoverRef.current = null;
            }}
          />

          {/* журнал событий */}
          <div className="absolute left-2 bottom-2 max-w-[75%] flex flex-col gap-1 pointer-events-none">
            {state.log.slice(-5).map((l) => (
              <div
                key={l.id}
                className={`text-[11px] leading-tight px-2 py-1 rounded bg-black/60 ${
                  l.tone === "good"
                    ? "text-emerald-300"
                    : l.tone === "bad"
                      ? "text-red-300"
                      : "text-neutral-300"
                }`}
              >
                <span className="text-neutral-500 tabular-nums">Д{l.day} {l.time}</span> {l.text}
              </div>
            ))}
          </div>

          {/* D-pad для маленьких экранов */}
          <div className="absolute right-2 bottom-2 grid grid-cols-3 gap-1 w-36 lg:hidden">
            <span />
            <DBtn label="▲" onClick={() => tryStep(0, -1)} />
            <span />
            <DBtn label="◀" onClick={() => tryStep(-1, 0)} />
            <DBtn label="E" onClick={pressE} />
            <DBtn label="▶" onClick={() => tryStep(1, 0)} />
            <span />
            <DBtn label="▼" onClick={() => tryStep(0, 1)} />
            <span />
          </div>
        </div>

        {/* боковая панель */}
        <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-3">
          <div className={`${cardCls} flex flex-col gap-2.5`}>
            <StatBar label="⚡ Энергия" value={state.energy} kind="energy" />
            <StatBar label="🍖 Голод" value={state.hunger} kind="hunger" />
            <div className="text-[11px] leading-snug text-neutral-400">
              {state.hunger >= 100
                ? "⚠️ Ты изголодался — энергия улетает. Ищи еду!"
                : state.hunger >= 80
                  ? "Живот рёвет. Скоро совсем нечем будет работать."
                  : state.energy <= 10
                    ? "Ноги ватные. Отдохни или выпей что-нибудь."
                    : "Цель: выжить. Работа → еда → сон."}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className={ghostBtn} onClick={() => setInvOpen((v) => !v)}>
              🎒 Рюкзак{invCount > 0 ? ` (${invCount})` : ""}
            </button>
            <button className={ghostBtn} onClick={() => setHelpOpen((v) => !v)}>
              ❓ Помощь
            </button>
          </div>

          {dialog ? (
            <DialogCard
              dialog={dialog}
              s={state}
              dispatch={dispatch}
              onClose={() => setDialog(null)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-3 text-xs leading-relaxed text-neutral-400">
              Подойди к двери, лавке или мусорному баку и нажми{" "}
              <b className="text-amber-300">E</b>.
              <br />
              Клик по земле — идти туда. Клик по зданию — дойти до входа.
              <br />
              У тебя ничего нет: первые деньги принесёт подёнщина.
            </div>
          )}

          {invOpen && (
            <InventoryCard
              s={state}
              dispatch={dispatch}
              onClose={() => setInvOpen(false)}
            />
          )}
          {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}
        </aside>
      </div>

      <footer className="text-[11px] text-neutral-600">
        WASD/стрелки — ходьба · клик — путь · E — действие · I — рюкзак · Esc — закрыть
      </footer>

      {!started && <IntroOverlay onStart={() => setStarted(true)} />}
      {state.dead && (
        <DeathOverlay
          s={state}
          onRestart={() => {
            setDialog(null);
            setInvOpen(false);
            setHelpOpen(false);
            dispatch({ type: "restart" });
          }}
        />
      )}
    </div>
  );
}

/* ---------- маленькие компоненты ---------- */

function StatBar({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: "energy" | "hunger";
}) {
  const v = Math.round(value);
  const color =
    kind === "energy"
      ? v > 50
        ? "bg-lime-500"
        : v > 25
          ? "bg-amber-500"
          : "bg-red-500"
      : v < 50
        ? "bg-emerald-500"
        : v < 80
          ? "bg-amber-500"
          : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-neutral-300">{label}</span>
        <span className="tabular-nums text-neutral-400">{v}/100</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded bg-neutral-800">
        <div
          className={`h-full ${color} transition-[width] duration-300`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function Headline({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-bold text-amber-200">{title}</h2>
      <button
        onClick={onClose}
        className="text-neutral-500 hover:text-neutral-200 leading-none"
        aria-label="Закрыть"
      >
        ✕
      </button>
    </div>
  );
}

function DialogCard({
  dialog,
  s,
  dispatch,
  onClose,
}: {
  dialog: NonNullable<Dialog>;
  s: GameState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
}) {
  return (
    <div className={`${cardCls} flex flex-col gap-2`}>
      {dialog.kind === "building" && (
        <BuildingPanel b={dialog.b} s={s} dispatch={dispatch} onClose={onClose} />
      )}
      {dialog.kind === "bench" && (
        <>
          <Headline title="🪑 Парковая лавка" onClose={onClose} />
          <p className="text-xs text-neutral-400">
            Дерево ещё тёплое. Можно посидеть и собраться с мыслями.
          </p>
          <button className={actionBtn(true)} onClick={() => dispatch({ type: "rest" })}>
            💤 Отдохнуть 15 мин (+энергия)
          </button>
        </>
      )}
      {dialog.kind === "trash" && (
        <>
          <Headline title="🗑️ Мусорный бак" onClose={onClose} />
          <p className="text-xs text-neutral-400">
            Пахнет не ахти, но сюда выбрасывают и еду.
          </p>
          <button className={actionBtn(true)} onClick={() => dispatch({ type: "scavenge" })}>
            🔎 Пошерстить (15 мин, −2 ⚡)
          </button>
        </>
      )}
    </div>
  );
}

function BuildingPanel({
  b,
  s,
  dispatch,
  onClose,
}: {
  b: Building;
  s: GameState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
}) {
  return (
    <>
      <Headline title={b.name} onClose={onClose} />
      <p className="text-xs text-neutral-400">{b.desc}</p>
      {b.kind === "shop" && <ShopPanel s={s} dispatch={dispatch} />}
      {b.kind === "shelter" && <ShelterPanel s={s} dispatch={dispatch} />}
      {b.kind === "work" && b.job && <WorkPanel s={s} job={JOBS[b.job]} dispatch={dispatch} />}
      {b.kind === "house" && (
        <p className="text-xs italic text-neutral-500">Дверь заперта. Здесь никто не живёт.</p>
      )}
    </>
  );
}

function ShopPanel({ s, dispatch }: PanelProps) {
  const h = hourOf(s);
  const open = h >= SHOP_OPEN && h < SHOP_CLOSE;
  if (!open) {
    return (
      <p className="text-xs text-red-300">
        Закрыто. Режим: {fmtTime(SHOP_OPEN * 60)}–{fmtTime(SHOP_CLOSE * 60)}.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {SHOP_ITEMS.map((id) => {
        const it = ITEMS[id];
        const afford = s.money >= it.price;
        return (
          <div
            key={id}
            className="flex items-center justify-between gap-2 rounded-md bg-neutral-800/70 px-2 py-1.5"
          >
            <div className="text-xs text-neutral-200">
              {it.icon} {it.name} <span className="text-neutral-500">· {it.desc}</span>
            </div>
            <button
              disabled={!afford}
              onClick={() => dispatch({ type: "buy", item: id })}
              className={`shrink-0 rounded-md border px-2 py-1 text-xs tabular-nums ${
                afford
                  ? "border-emerald-700 bg-emerald-900/50 text-emerald-200 hover:bg-emerald-800/60"
                  : "cursor-not-allowed border-neutral-700 bg-neutral-800 text-neutral-600"
              }`}
            >
              ${it.price}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ShelterPanel({ s, dispatch }: PanelProps) {
  const afford = s.money >= SHELTER_COST;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400">
        Койка, лоскутное одеяло и чужой храп. До 08:00.
      </p>
      <button
        disabled={!afford}
        onClick={() => dispatch({ type: "sleep", paid: true })}
        className={actionBtn(afford)}
      >
        🛏️ Спать на койке — ${SHELTER_COST} (⚡ → 100)
      </button>
      <button onClick={() => dispatch({ type: "sleep", paid: false })} className={ghostBtn}>
        😴 Спать на улице — бесплатно (+40 ⚡, +10 голода)
      </button>
    </div>
  );
}

function WorkPanel({ s, job, dispatch }: PanelProps & { job: Job }) {
  const h = hourOf(s);
  const open = h >= job.open && h < job.close;
  const enough = s.energy >= job.energy;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 rounded-md bg-neutral-800/70 p-2 text-xs">
        <div className="font-semibold text-neutral-100">🔧 {job.title}</div>
        <div className="text-neutral-400">{job.desc}</div>
        <div className="tabular-nums text-neutral-300">
          Оплата: <span className="text-emerald-300">${job.pay}/час</span> · Смена:{" "}
          {fmtTime(job.open * 60)}–{fmtTime(job.close * 60)}
        </div>
        <div className="tabular-nums text-neutral-400">
          Расход: −{job.energy} ⚡, +{job.hunger} голода, 60 мин
        </div>
      </div>
      {open ? (
        <button
          disabled={!enough}
          onClick={() => dispatch({ type: "work", job: job.id })}
          className={actionBtn(open && enough)}
        >
          {enough ? `Работать 1 час (+$${job.pay})` : "Не хватает сил"}
        </button>
      ) : (
        <p className="text-xs text-red-300">
          Сейчас смена не идёт (до {fmtTime(job.close * 60)}).
        </p>
      )}
    </div>
  );
}

function InventoryCard({
  s,
  dispatch,
  onClose,
}: PanelProps & { onClose: () => void }) {
  const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => (s.inv[id] ?? 0) > 0);
  return (
    <div className={`${cardCls} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-amber-200">🎒 Рюкзак</h2>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Закрыть">
          ✕
        </button>
      </div>
      {ids.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Пусто. В магазин дойдёт не каждый — тем, у кого в кармане пусто.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {ids.map((id) => {
            const it = ITEMS[id];
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-md bg-neutral-800/70 px-2 py-1.5"
              >
                <div className="text-xs text-neutral-200">
                  {it.icon} {it.name}{" "}
                  <span className="text-neutral-500">
                    ×{s.inv[id]} · {it.desc}
                  </span>
                </div>
                <button
                  onClick={() => dispatch({ type: "eat", item: id })}
                  className="shrink-0 rounded-md border border-sky-700 bg-sky-900/50 px-2 py-1 text-xs text-sky-200 hover:bg-sky-800/60"
                >
                  Съесть
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HelpCard({ onClose }: { onClose: () => void }) {
  return (
    <div className={`${cardCls} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-amber-200">❓ Помощь</h2>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Закрыть">
          ✕
        </button>
      </div>
      <ul className="list-inside list-disc flex flex-col gap-1 text-xs leading-relaxed text-neutral-300">
        <li>
          <b>WASD / стрелки</b> — ходьба (шаг = 2 игровые минуты).
        </li>
        <li>
          <b>Клик</b> — путь к тайлу; клик по зданию — дойти до его входа.
        </li>
        <li>
          <b>E</b> — действие с ближайшей дверью, лавкой или мусорным баком.
        </li>
        <li>
          <b>I</b> — рюкзак, <b>Esc</b> — закрыть окна.
        </li>
        <li>Работа приносит деньги, но отнимает энергию и время.</li>
        <li>Еда и напитки съедаются из рюкзака (I).</li>
        <li>Магазин: 08:00–21:00. Ночлежка — круглосуточно.</li>
        <li>При полном голоде энергия тает быстро. Не доходи до нуля сил.</li>
      </ul>
    </div>
  );
}

function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <h1 className="text-2xl font-black text-amber-300">🏚️ Бедный квартал</h1>
        <p className="text-sm leading-relaxed text-neutral-300">
          Ты — безымянный. 0 $ в кармане, ни жилья, ни работы, ни транспорта. Вокруг —
          квартал, где выживают те, кто не стоит на месте.
        </p>
        <ul className="list-inside list-disc text-xs leading-relaxed text-neutral-400">
          <li>Работай в трёх местах: склад, кафе, уборка улиц.</li>
          <li>Покупай еду и напитки в магазине «Скидка» (08:00–21:00).</li>
          <li>Спи в ночлежке «Рассвет» — или на улице, если не хватает денег.</li>
          <li>Отдыхай на лавках, шурудись в мусорных баках.</li>
          <li>Голод и усталость убивают. Не дай себе дойти до нуля сил.</li>
        </ul>
        <div className="text-xs text-neutral-400">
          <b className="text-neutral-200">Управление:</b> WASD / стрелки — ходьба · клик — путь · E
          — действие · I — рюкзак
        </div>
        <button
          onClick={onStart}
          className="rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-neutral-950 hover:bg-amber-400"
        >
          Начать выживание
        </button>
      </div>
    </div>
  );
}

function DeathOverlay({ s, onRestart }: { s: GameState; onRestart: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-red-900/60 bg-neutral-900 p-6 text-center">
        <div className="text-4xl">💀</div>
        <h1 className="text-xl font-black text-red-400">Ты не выжил</h1>
        <p className="text-sm text-neutral-300">
          Голод и усталость одолели тебя посреди квартала.
        </p>
        <div className="flex flex-col gap-1 text-xs text-neutral-400">
          <div>
            Дней прожито: <b className="text-neutral-200">{s.day}</b>
          </div>
          <div>
            Всего заработано: <b className="text-emerald-300">${s.earned}</b>
          </div>
          <div>
            Осталось в кармане: <b className="text-neutral-200">${s.money}</b>
          </div>
        </div>
        <button onClick={onRestart} className={actionBtn(true)}>
          Начать заново
        </button>
      </div>
    </div>
  );
}

function DBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-9 rounded border border-neutral-700 bg-neutral-800/80 text-neutral-300 active:bg-neutral-700"
    >
      {label}
    </button>
  );
}
