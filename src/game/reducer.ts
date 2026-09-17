import type { JobId } from "./world";
import { START } from "./world";
import type { ItemId } from "./data";
import { ITEMS, JOBS, SHELTER_COST, SHOP_CLOSE, SHOP_OPEN } from "./data";

export interface LogEntry {
  id: number;
  day: number;
  time: string;
  text: string;
  tone: "good" | "bad" | "info";
}

export interface GameState {
  x: number;
  y: number;
  money: number;
  energy: number;
  hunger: number; // 0 — сыт, 100 — смерть
  day: number;
  minutes: number; // минут с полуночи (0..1439)
  earned: number; // всего заработано за игру
  inv: Partial<Record<ItemId, number>>;
  log: LogEntry[];
  dead: boolean;
}

export type Action =
  | { type: "step"; x: number; y: number }
  | { type: "tick"; minutes: number }
  | { type: "work"; job: JobId }
  | { type: "buy"; item: ItemId }
  | { type: "eat"; item: ItemId }
  | { type: "sleep"; paid: boolean }
  | { type: "rest" }
  | { type: "scavenge" }
  | { type: "restart" };

let logSeq = 1;

export function fmtTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function initialState(): GameState {
  return {
    x: START.x,
    y: START.y,
    money: 0,
    energy: 100,
    hunger: 20,
    day: 1,
    minutes: 8 * 60,
    earned: 0,
    inv: {},
    log: [
      {
        id: 0,
        day: 1,
        time: "08:00",
        text: "Ты в квартале. 0 $, ни жилья, ни работы. Выживай.",
        tone: "info",
      },
    ],
    dead: false,
  };
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function push(s: GameState, text: string, tone: LogEntry["tone"]): void {
  s.log = [
    ...s.log.slice(-7),
    { id: logSeq++, day: s.day, time: fmtTime(s.minutes), text, tone },
  ];
}

/** Сдвиг игрового времени + пассивный износ: голод растёт, энергия тает. */
function advance(s: GameState, m: number): void {
  s.minutes += m;
  while (s.minutes >= 1440) {
    s.minutes -= 1440;
    s.day += 1;
  }
  const ticks = Math.floor(m / 15);
  for (let i = 0; i < ticks; i++) {
    s.hunger = clamp(s.hunger + 2);
    let drain = 1;
    if (s.hunger >= 80) drain = 3;
    if (s.hunger >= 100) drain = 5;
    s.energy = clamp(s.energy - drain);
  }
  if (!s.dead && s.energy <= 0 && s.hunger >= 100) {
    s.dead = true;
    push(s, "Силы оставили тебя. Квартал забрал ещё одного.", "bad");
  }
}

export function reducer(prev: GameState, a: Action): GameState {
  if (a.type === "restart") return initialState();
  if (prev.dead) return prev;

  const s: GameState = { ...prev, inv: { ...prev.inv } };

  switch (a.type) {
    case "step": {
      s.x = a.x;
      s.y = a.y;
      advance(s, 2); // шаг = 2 игровые минуты
      break;
    }

    case "tick": {
      advance(s, a.minutes);
      break;
    }

    case "work": {
      const job = JOBS[a.job];
      const h = Math.floor(s.minutes / 60);
      if (h < job.open || h >= job.close) {
        push(s, `${job.place}: сейчас смена не идёт (до ${fmtTime(job.close * 60)}).`, "bad");
        return s;
      }
      if (s.energy < job.energy) {
        push(s, "Не хватает сил на смену.", "bad");
        return s;
      }
      s.money += job.pay;
      s.earned += job.pay;
      s.energy = clamp(s.energy - job.energy);
      s.hunger = clamp(s.hunger + job.hunger);
      advance(s, 60);
      push(s, `${job.title}: +$${job.pay}.`, "good");
      break;
    }

    case "buy": {
      const it = ITEMS[a.item];
      const h = Math.floor(s.minutes / 60);
      if (h < SHOP_OPEN || h >= SHOP_CLOSE) {
        push(s, `Магазин закрыт (${fmtTime(SHOP_OPEN * 60)}–${fmtTime(SHOP_CLOSE * 60)}).`, "bad");
        return s;
      }
      if (s.money < it.price) {
        push(s, "Не хватает денег.", "bad");
        return s;
      }
      s.money -= it.price;
      s.inv[a.item] = (s.inv[a.item] ?? 0) + 1;
      advance(s, 1);
      push(s, `Куплено: ${it.name} (−$${it.price}).`, "info");
      break;
    }

    case "eat": {
      if (!((s.inv[a.item] ?? 0) > 0)) return prev;
      const it = ITEMS[a.item];
      s.inv[a.item] = (s.inv[a.item] ?? 1) - 1;
      if ((s.inv[a.item] ?? 0) <= 0) delete s.inv[a.item];
      s.energy = clamp(s.energy + it.energy);
      s.hunger = clamp(s.hunger + it.hunger);
      advance(s, 10);
      push(s, `${it.name}: ${it.desc}.`, "good");
      break;
    }

    case "sleep": {
      if (a.paid) {
        if (s.money < SHELTER_COST) {
          push(s, "Не хватает денег на койку.", "bad");
          return s;
        }
        s.money -= SHELTER_COST;
        s.energy = 100;
        push(s, `Ночь на койке (−$${SHELTER_COST}). Проснулся полным сил.`, "good");
      } else {
        s.energy = clamp(s.energy + 40);
        s.hunger = clamp(s.hunger + 10);
        push(s, "Ночь на улице: спалось плохо, простыл.", "bad");
      }
      if (s.minutes >= 8 * 60) s.day += 1;
      s.minutes = 8 * 60;
      break;
    }

    case "rest": {
      const gain = s.hunger >= 100 ? 0 : s.hunger >= 90 ? 5 : 15;
      s.energy = clamp(s.energy + gain);
      advance(s, 15);
      push(
        s,
        gain > 0 ? `Лавка в парке: +${gain} энергии.` : "Слабость. Лавка не поможет — нужна еда.",
        gain > 0 ? "good" : "bad"
      );
      break;
    }

    case "scavenge": {
      if (s.energy < 3) {
        push(s, "Нет сил даже копаться в мусоре.", "bad");
        return s;
      }
      s.energy = clamp(s.energy - 2);
      advance(s, 15);
      const r = Math.random();
      if (r < 0.35) {
        s.inv.bread = (s.inv.bread ?? 0) + 1;
        push(s, "В баке нашёлся ещё съедобный хлеб.", "good");
      } else if (r < 0.5) {
        s.inv.soda = (s.inv.soda ?? 0) + 1;
        push(s, "Нашлась почти полная банка газировки.", "good");
      } else if (r < 0.7) {
        const c = 1 + Math.floor(Math.random() * 3);
        s.money += c;
        s.earned += c;
        push(s, `Выгреб монетки: +$${c}.`, "good");
      } else {
        push(s, "Только чья-то гнилая бумага.", "info");
      }
      break;
    }
  }

  return s;
}
