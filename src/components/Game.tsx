"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Building } from "@/game/world";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
  START,
  TILE,
  bfs,
  buildGrid,
  canWalk,
  findInteractive,
} from "@/game/world";
import type { Item, ItemId, SkillId } from "@/game/data";
import {
  ITEMS,
  JOBS,
  LOAN_DEBT,
  LOAN_PER_DAY,
  LOAN_SUM,
  PC_COST,
  ROOM_COST,
  SHELTER_COST,
  SHOP_CLOSE,
  SHOP_GROUPS,
  SHOP_OPEN,
  SHOWER_COST,
  SKILL_NAMES,
  SLOT_NAMES,
  SLOTS,
  STAT_DESC,
  STAT_NAMES,
} from "@/game/data";
import type { Action, GameState } from "@/game/types";
import { fmtTime, initialState, reducer } from "@/game/reducer";
import {
  derivedStatuses,
  invCount,
  jobEnergyCost,
  jobIssue,
  jobPay,
  sellPrice,
  WEATHER_NAMES,
  xpForNext,
} from "@/game/character";
import { clearSave, hasSave, loadGame, saveGame } from "@/game/save";
import { drawFrame, makeStaticLayer } from "@/game/render";
import type { PlayerColors } from "@/game/render";

type Dialog =
  | { kind: "building"; b: Building }
  | { kind: "bench" }
  | { kind: "trash" }
  | { kind: "atm" }
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
      : "cursor-not-allowed bg-neutral-800 text-neutral-500 border-neutral-700"
  }`;
const ghostBtn =
  "px-3 py-2 rounded-lg text-sm border border-neutral-700 bg-neutral-800/70 hover:bg-neutral-800 text-neutral-200";

const WEATHER_ICONS = { clear: "☀️", overcast: "☁️", rain: "🌧️" } as const;

function playerColors(s: GameState): PlayerColors {
  const eq = s.char.equipment;
  const top = eq.top ? ITEMS[eq.top.id] : null;
  const bottom = eq.bottom ? ITEMS[eq.bottom.id] : null;
  const shoes = eq.shoes ? ITEMS[eq.shoes.id] : null;
  const head = eq.head ? ITEMS[eq.head.id] : null;
  return {
    jacket: top?.color ?? "#b5433a",
    pants: bottom?.color ?? "#3f4a55",
    shoes: shoes?.color ?? "#555a5f",
    hat: head ? { color: head.color ?? "#888", kind: head.id } : null,
  };
}

export default function Game() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const startedRef = useRef(false);

  const grid = useMemo(() => buildGrid(), []);
  const [staticLayer, setStaticLayer] = useState<HTMLCanvasElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const pathRef = useRef<[number, number][]>([]);
  const hoverRef = useRef<[number, number] | null>(null);
  const lastStepRef = useRef(0);
  const tickAccRef = useRef(0);
  const moveRef = useRef({
    from: { x: START.x, y: START.y },
    to: { x: START.x, y: START.y },
    t0: 0,
    dur: 160,
  });
  const animRef = useRef({ workUntil: 0, restUntil: 0 });
  const saveThrottleRef = useRef(0);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [started, setStarted] = useState(false);
  startedRef.current = started;

  /* ---------- действия ---------- */

  const tryStep = (dx: number, dy: number, run: boolean, door: boolean) => {
    const g = stateRef.current;
    if (g.dead) return;
    const nx = g.x + dx;
    const ny = g.y + dy;
    if (!canWalk(grid, nx, ny)) return;
    pathRef.current = [];
    const now = performance.now();
    const m = moveRef.current;
    const p = Math.min(1, (now - m.t0) / m.dur);
    m.from = {
      x: m.from.x + (m.to.x - m.from.x) * p,
      y: m.from.y + (m.to.y - m.from.y) * p,
    };
    m.to = { x: nx, y: ny };
    m.t0 = now;
    const agi = g.char.stats.agi;
    m.dur = g.char.riding ? 70 : run ? 95 : Math.max(110, 160 - (agi - 2) * 8);
    lastStepRef.current = now;
    dispatch({ type: "step", x: nx, y: ny, run, door });
    const t = grid[ny][nx];
    if (t.kind === "door") {
      const b = BUILDINGS.find((bb) => bb.id === t.b);
      if (b) setDialog({ kind: "building", b });
    } else {
      setDialog(null);
    }
  };

  const pressE = () => {
    const g = stateRef.current;
    if (g.dead || g.char.riding) return;
    const t = findInteractive(grid, g.x, g.y);
    if (!t) return;
    if (t.kind === "door") {
      const b = BUILDINGS.find((bb) => bb.id === t.b);
      if (b) setDialog({ kind: "building", b });
    } else if (t.kind === "bench") {
      animRef.current.restUntil = performance.now() + 2500;
      setDialog({ kind: "bench" });
    } else if (t.kind === "atm") {
      setDialog({ kind: "atm" });
    } else {
      setDialog({ kind: "trash" });
    }
  };

  const rideToggle = () => {
    const g = stateRef.current;
    if (g.dead) return;
    dispatch({ type: "ride", on: !g.char.riding });
  };

  const tryStepRef = useRef(tryStep);
  tryStepRef.current = tryStep;
  const pressERef = useRef(pressE);
  pressERef.current = pressE;
  const rideRef = useRef(rideToggle);
  rideRef.current = rideToggle;

  /* ---------- эффекты ---------- */

  useEffect(() => {
    setStaticLayer(makeStaticLayer());
  }, []);

  // главный цикл
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const g = stateRef.current;

      if (!g.dead) {
        tickAccRef.current += dt;
        while (tickAccRef.current >= 5000) {
          tickAccRef.current -= 5000;
          dispatch({ type: "tick", minutes: 15 });
        }

        if (now - lastStepRef.current > (g.char.riding ? 70 : 150)) {
          const k = keysRef.current;
          const run = k.ShiftLeft || k.ShiftRight;
          if (k.KeyW || k.ArrowUp) tryStepRef.current(0, -1, run, false);
          else if (k.KeyS || k.ArrowDown) tryStepRef.current(0, 1, run, false);
          else if (k.KeyA || k.ArrowLeft) tryStepRef.current(-1, 0, run, false);
          else if (k.KeyD || k.ArrowRight) tryStepRef.current(1, 0, run, false);
          else if (pathRef.current.length > 0) {
            const [nx, ny] = pathRef.current[0];
            if (nx === g.x && ny === g.y) {
              pathRef.current = pathRef.current.slice(1);
            } else if (canWalk(grid, nx, ny)) {
              const d = grid[ny][nx];
              tryStepRef.current(nx - g.x, ny - g.y, false, d.kind === "door");
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
          const m = moveRef.current;
          const p = Math.min(1, (now - m.t0) / m.dur);
          const rx = m.from.x + (m.to.x - m.from.x) * p;
          const ry = m.from.y + (m.to.y - m.from.y) * p;
          const k = keysRef.current;
          const dirKey =
            k.KeyW || k.KeyS || k.KeyA || k.KeyD ||
            k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight;
          const moving = dirKey || pathRef.current.length > 0;
          const run = k.ShiftLeft || k.ShiftRight;
          const mode: "idle" | "walk" | "run" | "work" | "rest" =
            now < animRef.current.workUntil
              ? "work"
              : now < animRef.current.restUntil
                ? "rest"
                : g.char.riding
                  ? "run"
                  : moving
                    ? run && !g.char.riding
                      ? "run"
                      : "walk"
                    : "idle";
          const t = findInteractive(grid, g.x, g.y);
          drawFrame(
            ctx,
            staticLayer,
            {
              state: g,
              path: pathRef.current,
              hover: hoverRef.current,
              target: t ? { x: t.x, y: t.y } : null,
              player: {
                x: g.dead ? g.x : rx,
                y: g.dead ? g.y : ry,
                dir: g.facing,
                mode,
                riding: g.char.riding,
                colors: playerColors(g),
              },
              weather: g.weather,
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
        c === "KeyW" || c === "KeyA" || c === "KeyS" || c === "KeyD" ||
        c === "ArrowUp" || c === "ArrowDown" || c === "ArrowLeft" || c === "ArrowRight" ||
        c === "ShiftLeft" || c === "ShiftRight"
      ) {
        e.preventDefault();
        keysRef.current[c] = true;
      } else if (c === "KeyE" || c === "Enter") {
        pressERef.current();
      } else if (c === "KeyI") {
        setInvOpen((v) => !v);
      } else if (c === "KeyC") {
        setProfileOpen((v) => !v);
      } else if (c === "KeyB") {
        rideRef.current();
      } else if (c === "Escape") {
        setDialog(null);
        setInvOpen(false);
        setHelpOpen(false);
        setProfileOpen(false);
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

  // автосохранение
  useEffect(() => {
    if (!started) return;
    const now = Date.now();
    if (now - saveThrottleRef.current < 3000) return;
    saveThrottleRef.current = now;
    saveGame(state);
  }, [state, started]);

  useEffect(() => {
    const h = () => {
      if (startedRef.current) saveGame(stateRef.current);
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  /* ---------- ввод мышью ---------- */

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
    if (g.dead || g.char.riding) return;
    const t = grid[y][x];
    if (t.kind === "bench" || t.kind === "trash" || t.kind === "atm") {
      if (Math.abs(x - g.x) + Math.abs(y - g.y) <= 1) {
        if (t.kind === "bench") {
          animRef.current.restUntil = performance.now() + 2500;
          setDialog({ kind: "bench" });
        } else if (t.kind === "atm") setDialog({ kind: "atm" });
        else setDialog({ kind: "trash" });
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

  const begin = (cont: boolean) => {
    if (cont) {
      const loaded = loadGame();
      if (loaded) {
        dispatch({ type: "load", state: loaded });
        moveRef.current = {
          from: { x: loaded.x, y: loaded.y },
          to: { x: loaded.x, y: loaded.y },
          t0: performance.now(),
          dur: 100,
        };
      } else {
        dispatch({ type: "restart" });
      }
    } else {
      clearSave();
      dispatch({ type: "restart" });
    }
    setStarted(true);
  };

  const onRestart = () => {
    clearSave();
    dispatch({ type: "restart" });
    moveRef.current = {
      from: { x: START.x, y: START.y },
      to: { x: START.x, y: START.y },
      t0: performance.now(),
      dur: 100,
    };
    setDialog(null);
    setInvOpen(false);
    setHelpOpen(false);
    setProfileOpen(false);
  };

  const markWorkAnim = () => {
    animRef.current.workUntil = performance.now() + 2500;
  };

  const s = state;
  const n = s.char.needs;
  const e = s.char.economy;
  const hour = hourOf(s);

  return (
    <div className="min-h-screen flex flex-col items-center gap-3 px-3 py-4 select-none">
      {/* верхняя панель + HUD */}
      <header className="w-full max-w-[1380px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-wide text-amber-300">🏚️ Бедный квартал</h1>
          <span className="hidden md:inline text-xs text-neutral-500">2D survival RPG</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Pill icon="❤️" v={n.health} danger={30} />
          <Pill icon="🍗" v={n.fullness} />
          <Pill icon="💧" v={n.thirst} />
          <Pill icon="⚡" v={n.energy} />
          <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 tabular-nums text-emerald-300">
            💵 ${e.cash}
          </span>
          <span className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 tabular-nums">
            {WEATHER_ICONS[s.weather]} День {s.day} · {fmtTime(s.minutes)}
          </span>
        </div>
      </header>

      <div className="w-full max-w-[1380px] flex flex-col xl:flex-row gap-3 items-start">
        {/* карта */}
        <div className="relative w-full xl:flex-1">
          <canvas
            ref={canvasRef}
            width={GRID_W * TILE * 2}
            height={GRID_H * TILE * 2}
            className="w-full h-auto rounded-lg border border-neutral-800 shadow-2xl cursor-pointer"
            onClick={(ev) => {
              const p = tileFromEvent(ev);
              if (p) clickAt(p[0], p[1]);
            }}
            onMouseMove={(ev) => {
              hoverRef.current = tileFromEvent(ev);
            }}
            onMouseLeave={() => {
              hoverRef.current = null;
            }}
          />

          <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[75%] flex-col gap-1">
            {s.log.slice(-5).map((l) => (
              <div
                key={l.id}
                className={`rounded bg-black/60 px-2 py-1 text-[11px] leading-tight ${
                  l.tone === "good"
                    ? "text-emerald-300"
                    : l.tone === "bad"
                      ? "text-red-300"
                      : "text-neutral-300"
                }`}
              >
                <span className="tabular-nums text-neutral-500">Д{l.day} {l.time}</span> {l.text}
              </div>
            ))}
          </div>

          <div className="absolute bottom-2 right-2 grid w-36 grid-cols-3 gap-1 xl:hidden">
            <span />
            <DBtn label="▲" onClick={() => tryStep(0, -1, false, false)} />
            <span />
            <DBtn label="◀" onClick={() => tryStep(-1, 0, false, false)} />
            <DBtn label="E" onClick={pressE} />
            <DBtn label="▶" onClick={() => tryStep(1, 0, false, false)} />
            <span />
            <DBtn label="▼" onClick={() => tryStep(0, 1, false, false)} />
            <span />
          </div>
        </div>

        {/* боковая панель */}
        <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-80">
          <div className="grid grid-cols-3 gap-2">
            <button className={ghostBtn} onClick={() => setProfileOpen((v) => !v)}>
              👤 Профиль
            </button>
            <button className={ghostBtn} onClick={() => setInvOpen((v) => !v)}>
              🎒 Рюкзак
            </button>
            <button className={ghostBtn} onClick={() => setHelpOpen((v) => !v)}>
              ❓ Помощь
            </button>
          </div>

          {dialog ? (
            <DialogCard
              dialog={dialog}
              s={s}
              dispatch={dispatch}
              onClose={() => setDialog(null)}
              onWork={markWorkAnim}
              onRest={() => {
                animRef.current.restUntil = performance.now() + 2500;
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/40 p-3 text-xs leading-relaxed text-neutral-400">
              Подойди к двери, лавке, мусорному баку или банкомату и нажми{" "}
              <b className="text-amber-300">E</b>.
              <br />
              Клик по земле — идти; клик по зданию — дойти до входа.
              <br />
              Shift — бег, B — велосипед, C — профиль, I — рюкзак.
            </div>
          )}

          <div className="text-[11px] leading-relaxed text-neutral-500">
            {s.char.riding
              ? "🚲 Ты на велосипеде: E не работает, B — сойти."
              : s.char.statuses.some((x) => x.tone === "bad")
                ? "⚠️ Активные проблемы: " +
                  s.char.statuses.filter((x) => x.tone === "bad").map((x) => x.label).join(", ")
                : "Цель: выжить. Работа → еда → сон. Детали — в профиле (C)."}
          </div>
        </aside>
      </div>

      <footer className="text-[11px] text-neutral-600">
        WASD/стрелки — ходьба · Shift — бег · клик — путь · E — действие · B — велосипед · C — профиль · I — рюкзак · Esc — закрыть
      </footer>

      {profileOpen && <ProfileModal s={s} onClose={() => setProfileOpen(false)} />}
      {invOpen && (
        <InventoryCard s={s} dispatch={dispatch} onClose={() => setInvOpen(false)} />
      )}
      {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}

      {!started && <IntroOverlay saveExists={hasSave()} onStart={begin} />}
      {s.dead && <DeathOverlay s={s} onRestart={onRestart} />}
    </div>
  );
}

/* ---------- маленькие компоненты ---------- */

function Pill({ icon, v, danger = 20 }: { icon: string; v: number; danger?: number }) {
  const val = Math.round(v);
  return (
    <span
      className={`rounded border px-2 py-1 tabular-nums ${
        val <= danger
          ? "animate-pulse border-red-800 bg-red-950/60 text-red-300"
          : "border-neutral-700 bg-neutral-800 text-neutral-200"
      }`}
    >
      {icon} {val}
    </span>
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

function Headline({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-bold text-amber-200">{title}</h2>
      <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 leading-none" aria-label="Закрыть">
        ✕
      </button>
    </div>
  );
}

function JobCard({
  s,
  jobId,
  dispatch,
  onWork,
}: PanelProps & { jobId: keyof typeof JOBS; onWork: () => void }) {
  const job = JOBS[jobId];
  const c = s.char;
  const h = hourOf(s);
  const open = h >= job.open && h < job.close;
  const issue = jobIssue(c, job);
  const cost = jobEnergyCost(c, job);
  const pay = jobPay(c, job);
  const enough = c.needs.energy >= cost;
  const ok = open && !issue && enough;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-neutral-800/70 p-2">
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-neutral-100">🔧 {job.title}</span>
        <span className="tabular-nums text-emerald-300">${pay}/час</span>
      </div>
      <div className="text-[11px] text-neutral-400">{job.desc}</div>
      <div className="tabular-nums text-[11px] text-neutral-400">
        Смена {fmtTime(job.open * 60)}–{fmtTime(job.close * 60)} · −{cost} ⚡ · опыт:{" "}
        {SKILL_NAMES[job.xp.main]}
        {job.xp.secondary ? ` + ${SKILL_NAMES[job.xp.secondary.id]}` : ""}
      </div>
      {issue ? (
        <div className="text-[11px] text-red-300">🔒 {issue}</div>
      ) : !open ? (
        <div className="text-[11px] text-red-300">Сейчас смена не идёт (до {fmtTime(job.close * 60)})</div>
      ) : !enough ? (
        <div className="text-[11px] text-red-300">Не хватает сил: нужно {cost} ⚡</div>
      ) : null}
      <button
        disabled={!ok}
        onClick={() => {
          onWork();
          dispatch({ type: "work", job: jobId });
        }}
        className={actionBtn(ok)}
      >
        {ok
          ? `Работать 1 час (+$${pay})`
          : issue
            ? "Недоступно"
            : !open
              ? "Закрыто"
              : "Нет сил"}
      </button>
    </div>
  );
}

function ShopPanel({ s, dispatch }: PanelProps) {
  const c = s.char;
  const h = hourOf(s);
  const open = h >= SHOP_OPEN && h < SHOP_CLOSE;
  if (!open) {
    return (
      <p className="text-xs text-red-300">
        Закрыто. Режим: {fmtTime(SHOP_OPEN * 60)}–{fmtTime(SHOP_CLOSE * 60)}.
      </p>
    );
  }
  const sellIds = (Object.keys(ITEMS) as ItemId[]).filter((id) => (c.inventory[id] ?? 0) > 0);
  return (
    <div className="flex flex-col gap-2">
      {SHOP_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">{g.title}</div>
          <div className="flex flex-col gap-1">
            {g.items.map((id) => {
              const it = ITEMS[id];
              const afford = c.economy.cash >= it.price;
              const full = invCount(c) >= c.capacity;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md bg-neutral-800/70 px-2 py-1"
                >
                  <div className="text-xs text-neutral-200">
                    {it.icon} {it.name} <span className="text-neutral-500">· {it.desc}</span>
                  </div>
                  <button
                    disabled={!afford || full}
                    onClick={() => dispatch({ type: "buy", item: id })}
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-xs tabular-nums ${
                      afford && !full
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
        </div>
      ))}
      {sellIds.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
            Сдать (торговля)
          </div>
          <div className="flex flex-col gap-1">
            {sellIds.map((id) => {
              const it = ITEMS[id];
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md bg-neutral-800/50 px-2 py-1"
                >
                  <div className="text-xs text-neutral-200">
                    {it.icon} {it.name} ×{c.inventory[id]}
                  </div>
                  <button
                    onClick={() => dispatch({ type: "sell", item: id })}
                    className="shrink-0 rounded-md border border-sky-700 bg-sky-900/50 px-2 py-0.5 text-xs tabular-nums text-sky-200 hover:bg-sky-800/60"
                  >
                    +${sellPrice(c, it)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ShelterPanel({ s, dispatch }: PanelProps) {
  const c = s.char;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400">
        Койки, лоскутные одеяла и чужой храп. С недавних пор — и комната.
      </p>
      <button
        disabled={c.economy.cash < SHELTER_COST}
        onClick={() => dispatch({ type: "sleep", paid: "cot" })}
        className={actionBtn(c.economy.cash >= SHELTER_COST)}
      >
        🛏️ Койка — ${SHELTER_COST} (⚡ → 100)
      </button>
      <button
        disabled={c.economy.cash < ROOM_COST}
        onClick={() => dispatch({ type: "sleep", paid: "room" })}
        className={actionBtn(c.economy.cash >= ROOM_COST)}
      >
        🚪 Комната — ${ROOM_COST} (лучший сон, +гигиена, адрес)
      </button>
      <button onClick={() => dispatch({ type: "sleep", paid: "street" })} className={ghostBtn}>
        😴 Улица — бесплатно (+40 ⚡, грязь, риск простуды, −репутация)
      </button>
    </div>
  );
}

function AtmPanel({ s, dispatch }: PanelProps) {
  const e = s.char.economy;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-300 tabular-nums">
        Счёт: <span className="text-emerald-300">${e.bank}</span> · Наличные: ${e.cash}
        {e.debt > 0 && (
          <span className="text-red-300">
            {" "}
            · Долг: ${e.debt} (по ${e.debtPerDay}/день)
          </span>
        )}
      </p>
      <button
        disabled={e.cash <= 0}
        onClick={() => dispatch({ type: "bank", mode: "deposit", amount: 99999 })}
        className={actionBtn(e.cash > 0)}
      >
        🏦 Положить все наличные (${e.cash})
      </button>
      <button
        disabled={e.bank <= 0}
        onClick={() => dispatch({ type: "bank", mode: "withdraw", amount: 99999 })}
        className={actionBtn(e.bank > 0)}
      >
        💵 Снять всё со счёта (${e.bank})
      </button>
      {e.debt > 0 ? (
        <p className="text-xs text-neutral-400">
          Кредит открыт. Платёж списывается каждое утро; при нехватке — проценты и −репутация.
        </p>
      ) : (
        <button onClick={() => dispatch({ type: "bank", mode: "loan", amount: 0 })} className={ghostBtn}>
          📜 Взять кредит: +${LOAN_SUM}, вернуть ${LOAN_DEBT} по ${LOAN_PER_DAY}/день
        </button>
      )}
    </div>
  );
}

function BuildingPanel({
  b,
  s,
  dispatch,
  onClose,
  onWork,
}: {
  b: Building;
  s: GameState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
  onWork: () => void;
}) {
  const c = s.char;
  return (
    <>
      <Headline title={b.name} onClose={onClose} />
      <p className="text-xs text-neutral-400">{b.desc}</p>
      {b.kind === "shop" && <ShopPanel s={s} dispatch={dispatch} />}
      {b.kind === "shelter" && <ShelterPanel s={s} dispatch={dispatch} />}
      {b.jobs.map((j) => (
        <JobCard key={j} jobId={j} s={s} dispatch={dispatch} onWork={onWork} />
      ))}
      {b.id === "clinic" && (
        <button
          disabled={c.economy.cash < SHOWER_COST}
          onClick={() => dispatch({ type: "shower" })}
          className={actionBtn(c.economy.cash >= SHOWER_COST)}
        >
          🚿 Общественный душ — ${SHOWER_COST} (гигиена → 90)
        </button>
      )}
      {b.id === "internet" && (
        <button
          disabled={c.economy.cash < PC_COST}
          onClick={() => {
            onWork();
            dispatch({ type: "pc" });
          }}
          className={actionBtn(c.economy.cash >= PC_COST)}
        >
          💻 Посидеть за ПК — ${PC_COST} (1 час, опыт «Компьютеры»)
        </button>
      )}
      {b.id === "office" &&
        (c.social.hasDocuments ? (
          <p className="text-xs text-neutral-500">Документы оформлены.</p>
        ) : (
          <button
            disabled={(c.social.tenure.cleaning ?? 0) < 3}
            onClick={() => dispatch({ type: "documents" })}
            className={ghostBtn}
          >
            📄 Оформить документы ({c.social.tenure.cleaning ?? 0}/3 смены уборки)
          </button>
        ))}
      {b.kind === "house" && (
        <p className="text-xs italic text-neutral-500">Дверь заперта. Здесь никто не живёт.</p>
      )}
    </>
  );
}

function DialogCard({
  dialog,
  s,
  dispatch,
  onClose,
  onWork,
  onRest,
}: {
  dialog: NonNullable<Dialog>;
  s: GameState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
  onWork: () => void;
  onRest: () => void;
}) {
  return (
    <div className={`${cardCls} max-h-[60vh] overflow-y-auto flex flex-col gap-2`}>
      {dialog.kind === "building" && (
        <BuildingPanel b={dialog.b} s={s} dispatch={dispatch} onClose={onClose} onWork={onWork} />
      )}
      {dialog.kind === "bench" && (
        <>
          <Headline title="🪑 Парковая лавка" onClose={onClose} />
          <p className="text-xs text-neutral-400">
            Дерево ещё тёплое. Можно посидеть, собраться с мыслями и поболтать с соседом.
          </p>
          <button
            className={actionBtn(true)}
            onClick={() => {
              onRest();
              dispatch({ type: "rest" });
            }}
          >
            💤 Отдохнуть 15 мин (+энергия, −стресс)
          </button>
        </>
      )}
      {dialog.kind === "trash" && (
        <>
          <Headline title="🗑️ Мусорный бак" onClose={onClose} />
          <p className="text-xs text-neutral-400">Пахнет не ахти, но сюда выбрасывают и еду.</p>
          <button className={actionBtn(true)} onClick={() => dispatch({ type: "scavenge" })}>
            🔎 Пошерстить (15 мин, −2 ⚡)
          </button>
        </>
      )}
      {dialog.kind === "atm" && (
        <>
          <Headline title="🏧 Банкомат" onClose={onClose} />
          <AtmPanel s={s} dispatch={dispatch} />
        </>
      )}
    </div>
  );
}

/* ---------- профиль ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-neutral-800/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{k}</div>
      <div className="text-xs text-neutral-200">{v}</div>
    </div>
  );
}

function MiniBar({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  const v = Math.round(value);
  const color = bad
    ? v < 30
      ? "bg-red-500"
      : v < 60
        ? "bg-amber-500"
        : "bg-emerald-500"
    : v < 30
      ? "bg-red-500"
      : v < 60
        ? "bg-amber-500"
        : "bg-lime-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-neutral-300">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-neutral-400">{v}</span>
    </div>
  );
}

function ProfileModal({ s, onClose }: { s: GameState; onClose: () => void }) {
  const c = s.char;
  const statuses = [...c.statuses, ...derivedStatuses(c)];
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-amber-200">👤 {c.name}, {c.age} лет</h1>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <Section title="Статус">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Info k="Статус" v={c.social.address === "Бездомный" ? "Бездомный" : "Арендатор"} />
            <Info k="Профессия" v={c.social.profession ?? "Без работы"} />
            <Info k="Место" v={c.social.address} />
            <Info k="Репутация" v={`${c.social.reputation >= 0 ? "+" : ""}${c.social.reputation}`} />
            <Info k="Образование" v={c.social.education} />
            <Info k="Документы" v={c.social.hasDocuments ? "Есть" : "Нет"} />
            <Info k="Правовой статус" v={c.social.legalStatus} />
            <Info k="Температура" v={`${c.bodyTemp.toFixed(1)}°C`} />
            <Info k="Погода" v={WEATHER_NAMES[s.weather]} />
          </div>
        </Section>

        <Section title="Показатели">
          <div className="flex flex-col gap-1.5">
            <MiniBar label="❤️ Здоровье" value={c.needs.health} />
            <MiniBar label="🍗 Сытость" value={c.needs.fullness} />
            <MiniBar label="💧 Жажда" value={c.needs.thirst} />
            <MiniBar label="⚡ Энергия" value={c.needs.energy} />
            <MiniBar label="🧼 Гигиена" value={c.needs.hygiene} />
            <MiniBar label="🙂 Настроение" value={c.needs.mood} />
            <MiniBar label="😤 Стресс" value={c.needs.stress} bad />
            <MiniBar label="🌡️ Комфорт" value={c.needs.comfort} />
          </div>
        </Section>

        <Section title="Характеристики">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(Object.keys(STAT_NAMES) as (keyof typeof STAT_NAMES)[]).map((st) => (
              <div key={st} className="rounded-md bg-neutral-800/60 px-2 py-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-200">{STAT_NAMES[st]}</span>
                  <span className="tabular-nums text-amber-300">{c.stats[st]}</span>
                </div>
                <div className="text-[10px] text-neutral-500">{STAT_DESC[st]}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Навыки">
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {(Object.keys(SKILL_NAMES) as SkillId[]).map((sk) => {
              const skill = c.skills[sk];
              const need = xpForNext(skill.level);
              return (
                <div key={sk} className="rounded-md bg-neutral-800/60 px-2 py-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-200">{SKILL_NAMES[sk]}</span>
                    <span className="tabular-nums text-amber-300">ур. {skill.level}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-neutral-900">
                    <div
                      className="h-full bg-sky-600"
                      style={{ width: `${Math.min(100, (skill.xp / need) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Состояния">
          {statuses.length === 0 ? (
            <p className="text-xs text-neutral-500">Норма. Редкость для этого города.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {statuses.map((st) => (
                <div key={st.id} className="flex justify-between gap-2 text-xs">
                  <span
                    className={
                      st.tone === "bad"
                        ? "text-red-300"
                        : st.tone === "good"
                          ? "text-emerald-300"
                          : "text-neutral-300"
                    }
                  >
                    {st.label}
                    {st.ticksLeft !== undefined && (
                      <span className="text-neutral-500"> · ~{Math.round((st.ticksLeft * 15) / 60)} ч</span>
                    )}
                  </span>
                  <span className="text-neutral-500">{st.desc}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Одежда">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {SLOTS.map((slot) => {
              const worn = c.equipment[slot];
              const it = worn ? ITEMS[worn.id] : null;
              return (
                <div key={slot} className="rounded-md bg-neutral-800/60 px-2 py-1.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                    {SLOT_NAMES[slot]}
                  </div>
                  {it ? (
                    <>
                      <div className="text-neutral-200">
                        {it.icon} {it.name}
                      </div>
                      <div className="tabular-nums text-neutral-500">
                        износ {100 - Math.round(worn!.wear)}% · тепло +{it.warmth ?? 0}
                      </div>
                    </>
                  ) : (
                    <div className="text-neutral-600">—</div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Финансы">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Info k="Наличные" v={`$${c.economy.cash}`} />
            <Info k="Банк" v={`$${c.economy.bank}`} />
            <Info
              k="Долг"
              v={
                c.economy.debt > 0
                  ? `$${c.economy.debt} (по $${c.economy.debtPerDay}/день)`
                  : "нет"
              }
            />
            <Info k="Последняя смена" v={`$${c.economy.lastShiftPay}`} />
            <Info k="Всего заработано" v={`$${c.economy.totalEarned}`} />
            <Info k="Всего потрачено" v={`$${c.economy.totalSpent}`} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- инвентарь ---------- */

function itemActionLabel(it: Item, s: GameState): string | null {
  if (it.cat === "food") return it.thirst !== undefined && it.fullness === undefined ? "Выпить" : "Съесть";
  if (it.cures || it.hygiene) return "Применить";
  if (it.slot) return "Надеть";
  if (it.id === "phone" && !s.char.flags.phoneCallToday) return "Позвонить";
  if (it.id === "bike") return s.char.riding ? "Сойти" : "Ехать";
  return null;
}

function InventoryCard({
  s,
  dispatch,
  onClose,
}: PanelProps & { onClose: () => void }) {
  const c = s.char;
  const ids = (Object.keys(ITEMS) as ItemId[]).filter((id) => (c.inventory[id] ?? 0) > 0);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-2 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-amber-200">
            🎒 Рюкзак <span className="tabular-nums text-neutral-500">{invCount(c)}/{c.capacity}</span>
          </h2>
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
              const label = itemActionLabel(it, s);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-2 rounded-md bg-neutral-800/70 px-2 py-1.5"
                >
                  <div className="min-w-0 text-xs text-neutral-200">
                    {it.icon} {it.name}{" "}
                    <span className="text-neutral-500">
                      ×{c.inventory[id]} · {it.desc}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {label && (
                      <button
                        onClick={() => {
                          if (it.slot) dispatch({ type: "equip", item: id });
                          else if (it.id === "phone") dispatch({ type: "call" });
                          else if (it.id === "bike")
                            dispatch({ type: "ride", on: !s.char.riding });
                          else if (it.cat === "food") dispatch({ type: "eat", item: id });
                          else dispatch({ type: "use", item: id });
                        }}
                        className="rounded-md border border-sky-700 bg-sky-900/50 px-2 py-1 text-xs text-sky-200 hover:bg-sky-800/60"
                      >
                        {label}
                      </button>
                    )}
                    <button
                      onClick={() => dispatch({ type: "drop", item: id })}
                      className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:text-red-300"
                    >
                      Выбросить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- помощь / интро / смерть ---------- */

function HelpCard({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-2 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-amber-200">❓ Помощь</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <ul className="list-inside list-disc text-xs leading-relaxed text-neutral-300">
          <li>
            <b>WASD / стрелки</b> — ходьба (шаг = 2 игровые минуты), <b>Shift</b> — бег (быстрее,
            но сушит и утомляет).
          </li>
          <li>
            <b>Клик</b> — путь к тайлу; клик по зданию — дойти до входа.
          </li>
          <li>
            <b>E</b> — действие: двери, лавки, баки, банкоматы. <b>B</b> — велосипед (если есть).
          </li>
          <li>
            <b>C</b> — профиль: все показатели, навыки, одежда, финансы. <b>I</b> — рюкзак.{" "}
            <b>Esc</b> — закрыть окна.
          </li>
          <li>Работы открываются через навыки, статы, гигиену и документы.</li>
          <li>Носишь мало: базовая вместимость 6 предметов, рюкзак добавляет ещё 6.</li>
          <li>Одежда греет и изнашивается; в дождь без зонта мокнешь.</li>
          <li>
            При полном голоде/жажде или в стуже падает здоровье. 0 здоровья — конец.
          </li>
          <li>
            Магазин 08:00–21:00. Ночлежка круглосуточно. Прогресс сохраняется автоматически.
          </li>
        </ul>
      </div>
    </div>
  );
}

function IntroOverlay({
  saveExists,
  onStart,
}: {
  saveExists: boolean;
  onStart: (cont: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <h1 className="text-2xl font-black text-amber-300">🏚️ Бедный квартал</h1>
        <p className="text-sm leading-relaxed text-neutral-300">
          Ты — обычный человек. 0 $ в кармане, ни жилья, ни работы, ни транспорта. Вокруг —
          квартал, где выживают те, кто не стоит на месте.
        </p>
        <ul className="list-inside list-disc text-xs leading-relaxed text-neutral-400">
          <li>Работы открываются навыками и гигиеной. Навыки растут от работы.</li>
          <li>Следи за сытостью, жаждой, энергией, гигиеной и погодой (профиль — C).</li>
          <li>Одежда греет, рюкзак扩容, банкомат хранит, кредит выручает (и кусается).</li>
          <li>Голод, жажда и стужа бьют по здоровью. 0 здоровья — конец.</li>
        </ul>
        <div className="flex gap-2">
          {saveExists && (
            <button
              onClick={() => onStart(true)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white hover:bg-emerald-500"
            >
              Продолжить
            </button>
          )}
          <button
            onClick={() => onStart(false)}
            className={`flex-1 rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-neutral-950 hover:bg-amber-400 ${
              saveExists ? "" : ""
            }`}
          >
            Новая игра
          </button>
        </div>
        {saveExists && (
          <p className="text-[11px] text-neutral-500">
            «Новая игра» сотрёт текущее сохранение.
          </p>
        )}
      </div>
    </div>
  );
}

function DeathOverlay({ s, onRestart }: { s: GameState; onRestart: () => void }) {
  const e = s.char.economy;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-red-900/60 bg-neutral-900 p-6 text-center">
        <div className="text-4xl">💀</div>
        <h1 className="text-xl font-black text-red-400">Ты не выжил</h1>
        <p className="text-sm text-neutral-300">
          Здоровье ушло в ноль посреди квартала. Городу, правда, всё равно.
        </p>
        <div className="flex flex-col gap-1 text-xs text-neutral-400">
          <div>
            Дней прожито: <b className="text-neutral-200">{s.day}</b>
          </div>
          <div>
            Всего заработано: <b className="text-emerald-300">${e.totalEarned}</b>
          </div>
          <div>
            Профессия: <b className="text-neutral-200">{s.char.social.profession ?? "не успел"}</b>
          </div>
        </div>
        <button onClick={onRestart} className={actionBtn(true)}>
          Начать заново
        </button>
      </div>
    </div>
  );
}
