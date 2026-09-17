// Игровая логика: единый редьюсер. Все правила — здесь, вне React.

import { START } from "./world";
import type { JobId } from "./world";
import type { Action, GameState, LogEntry, SlotId } from "./types";
import type { ItemId } from "./data";
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
  SHOP_OPEN,
  SHOWER_COST,
} from "./data";
import {
  addSkill,
  clamp,
  hasItem,
  hasStatus,
  initialCharacter,
  invCount,
  jobEnergyCost,
  jobIssue,
  jobPay,
  recapacity,
  rollWeather,
  sellPrice,
  tickChar,
  WEATHER_NAMES,
} from "./character";

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
    facing: "down",
    day: 1,
    minutes: 8 * 60,
    pending: 0,
    weather: rollWeather(),
    char: initialCharacter(),
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

function push(s: GameState, text: string, tone: LogEntry["tone"]): void {
  s.log = [
    ...s.log.slice(-7),
    { id: logSeq++, day: s.day, time: fmtTime(s.minutes), text, tone },
  ];
}

/** Новый игровой день: погода, кредит, сброс флагов. */
function newDay(s: GameState): void {
  s.day += 1;
  s.weather = rollWeather();
  s.char.flags.phoneCallToday = false;
  const e = s.char.economy;
  if (e.debtPerDay > 0) {
    const pay = Math.min(e.debt, e.debtPerDay);
    if (e.cash >= pay) {
      e.cash -= pay;
      e.debt -= pay;
      if (e.debt <= 0) {
        e.debt = 0;
        e.debtPerDay = 0;
        s.char.social.reputation = clamp(s.char.social.reputation + 5, -100, 100);
        push(s, "Кредит полностью погашен. +5 репутации.", "good");
      } else {
        push(s, `Платёж по кредиту: −$${pay}. Осталось $${e.debt}.`, "info");
      }
    } else {
      e.debt = Math.round(e.debt * 1.2);
      s.char.social.reputation = clamp(s.char.social.reputation - 5, -100, 100);
      push(s, `Не хватило денег на платёж. Проценты: долг $${e.debt}. −5 репутации.`, "bad");
    }
  }
  push(s, `День ${s.day}. Погода: ${WEATHER_NAMES[s.weather]}.`, "info");
}

/** Сдвиг времени + пассивные потребности (каждые 15 минут) + проверка смерти. */
function advance(s: GameState, m: number): void {
  const startHour = Math.floor(s.minutes / 60);
  s.minutes += m;
  if (s.minutes >= 1440) {
    s.minutes -= 1440;
    newDay(s);
  }
  s.pending += m;
  while (s.pending >= 15) {
    s.pending -= 15;
    tickChar(s.char, 15, s.weather, startHour);
  }
  if (!s.dead && s.char.needs.health <= 0) {
    s.char.needs.health = 0;
    s.dead = true;
    push(s, "Здоровье упало до нуля. Квартал забрал ещё одного.", "bad");
  }
}

export function reducer(prev: GameState, a: Action): GameState {
  if (a.type === "restart") return initialState();
  if (a.type === "load") return a.state;
  if (prev.dead) return prev;

  const s: GameState = {
    ...prev,
    char: {
      ...prev.char,
      needs: { ...prev.char.needs },
      stats: { ...prev.char.stats },
      skills: { ...prev.char.skills },
      social: { ...prev.char.social, tenure: { ...prev.char.social.tenure } },
      economy: { ...prev.char.economy },
      equipment: { ...prev.char.equipment },
      inventory: { ...prev.char.inventory },
      statuses: [...prev.char.statuses],
      flags: { ...prev.char.flags },
    },
  };

  switch (a.type) {
    case "step": {
      const dx = a.x - prev.x;
      const dy = a.y - prev.y;
      s.x = a.x;
      s.y = a.y;
      s.facing = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
      if (s.char.riding) {
        s.char.needs.energy = clamp(s.char.needs.energy - 0.5);
        s.char.needs.thirst = clamp(s.char.needs.thirst - 0.2);
        if (a.door) {
          s.char.riding = false;
          push(s, "Съехал с велосипеда у двери.", "info");
        }
      } else if (a.run) {
        s.char.needs.energy = clamp(s.char.needs.energy - 0.3);
        s.char.needs.thirst = clamp(s.char.needs.thirst - 0.2);
      }
      advance(s, 2);
      break;
    }

    case "tick": {
      advance(s, a.minutes);
      break;
    }

    case "work": {
      const job = JOBS[a.job];
      const c = s.char;
      const h = Math.floor(s.minutes / 60);
      if (h < job.open || h >= job.close) {
        push(s, `${job.place}: смена не идёт (до ${fmtTime(job.close * 60)}).`, "bad");
        return s;
      }
      const issue = jobIssue(c, job);
      if (issue) {
        push(s, issue + ".", "bad");
        return s;
      }
      const cost = jobEnergyCost(c, job);
      if (c.needs.energy < cost) {
        push(s, `Не хватает сил: нужно ⚡ ${cost}.`, "bad");
        return s;
      }
      const events: string[] = [];
      let pay = jobPay(c, job);
      let note = "";
      if (hasStatus(c, "wellRested")) {
        pay = Math.max(1, Math.round(pay * 1.1));
        c.statuses = c.statuses.filter((x) => x.id !== "wellRested");
        note = " (+10%, хорошо отдохнул)";
      }
      c.needs.energy = clamp(c.needs.energy - cost);
      c.needs.fullness = clamp(c.needs.fullness + job.fullness);
      c.needs.thirst = clamp(c.needs.thirst + job.thirst);
      c.needs.hygiene = clamp(c.needs.hygiene - 2);
      c.needs.stress = clamp(c.needs.stress + 4);
      const intMult = 1 + Math.max(0, c.stats.int - 2) * 0.05;
      addSkill(c, job.xp.main, Math.round(job.xp.amount * intMult), events);
      if (job.xp.secondary)
        addSkill(c, job.xp.secondary.id, Math.round(job.xp.secondary.amount * intMult), events);
      c.economy.cash += pay;
      c.economy.totalEarned += pay;
      c.economy.lastShiftPay = pay;
      c.social.reputation = clamp(c.social.reputation + 1, -100, 100);
      const t = (c.social.tenure[a.job] ?? 0) + 1;
      c.social.tenure[a.job] = t;
      if (t >= 3 && c.social.profession !== job.title) c.social.profession = job.title;
      advance(s, 60);
      push(s, `${job.title}: +$${pay}${note}.`, "good");
      for (const e of events) push(s, e, "good");
      break;
    }

    case "buy": {
      const it = ITEMS[a.item];
      const c = s.char;
      const h = Math.floor(s.minutes / 60);
      if (h < SHOP_OPEN || h >= SHOP_CLOSE) {
        push(s, `Магазин закрыт (${fmtTime(SHOP_OPEN * 60)}–${fmtTime(SHOP_CLOSE * 60)}).`, "bad");
        return s;
      }
      if (c.economy.cash < it.price) {
        push(s, "Не хватает денег.", "bad");
        return s;
      }
      if (invCount(c) + 1 > c.capacity) {
        push(s, "Инвентарь полон. Выбросьте что-нибудь или купите рюкзак.", "bad");
        return s;
      }
      c.economy.cash -= it.price;
      c.economy.totalSpent += it.price;
      c.inventory[a.item] = (c.inventory[a.item] ?? 0) + 1;
      recapacity(c);
      advance(s, 1);
      push(s, `Куплено: ${it.name} (−$${it.price}).`, "info");
      break;
    }

    case "sell": {
      const c = s.char;
      if ((c.inventory[a.item] ?? 0) <= 0) return prev;
      const it = ITEMS[a.item];
      const price = sellPrice(c, it);
      c.inventory[a.item] = (c.inventory[a.item] ?? 1) - 1;
      if ((c.inventory[a.item] ?? 0) <= 0) delete c.inventory[a.item];
      recapacity(c);
      c.economy.cash += price;
      c.economy.totalEarned += price;
      const events: string[] = [];
      addSkill(c, "trade", 4, events);
      addSkill(c, "social", 2, events);
      advance(s, 1);
      push(s, `Сдано: ${it.name} (+$${price}).`, "good");
      for (const e of events) push(s, e, "good");
      break;
    }

    case "eat": {
      const c = s.char;
      if ((c.inventory[a.item] ?? 0) <= 0) return prev;
      const it = ITEMS[a.item];
      c.inventory[a.item] = (c.inventory[a.item] ?? 1) - 1;
      if ((c.inventory[a.item] ?? 0) <= 0) delete c.inventory[a.item];
      if (it.fullness) c.needs.fullness = clamp(c.needs.fullness + it.fullness);
      if (it.thirst) c.needs.thirst = clamp(c.needs.thirst + it.thirst);
      if (it.energy) c.needs.energy = clamp(c.needs.energy + it.energy);
      advance(s, 10);
      push(s, `${it.name}: ${it.desc}.`, "good");
      break;
    }

    case "use": {
      const c = s.char;
      if ((c.inventory[a.item] ?? 0) <= 0) return prev;
      const it = ITEMS[a.item];
      let ok = false;
      if (it.hygiene) {
        c.needs.hygiene = clamp(c.needs.hygiene + it.hygiene);
        ok = true;
      }
      if (it.health) {
        c.needs.health = clamp(c.needs.health + it.health);
        ok = true;
      }
      if (it.cures) {
        for (const cur of it.cures) {
          if (hasStatus(c, cur)) {
            c.statuses = c.statuses.filter((x) => x.id !== cur);
            push(s, `${it.name}: состояние снято.`, "good");
            ok = true;
          }
        }
        if (!ok) {
          push(s, "Нечего лечить этим прямо сейчас.", "info");
          return s;
        }
      }
      if (!ok) return prev;
      c.inventory[a.item] = (c.inventory[a.item] ?? 1) - 1;
      if ((c.inventory[a.item] ?? 0) <= 0) delete c.inventory[a.item];
      recapacity(c);
      advance(s, 5);
      push(s, `${it.name}: ${it.desc}.`, "good");
      break;
    }

    case "equip": {
      const c = s.char;
      const it = ITEMS[a.item];
      if (!it.slot) return prev;
      if ((c.inventory[a.item] ?? 0) <= 0) return prev;
      const old = c.equipment[it.slot];
      const willCount = invCount(c) - 1 + (old ? 1 : 0);
      if (willCount > c.capacity) {
        push(s, "Нет места: сначала выбросите что-нибудь из инвентаря.", "bad");
        return s;
      }
      c.inventory[a.item] = (c.inventory[a.item] ?? 1) - 1;
      if ((c.inventory[a.item] ?? 0) <= 0) delete c.inventory[a.item];
      if (old) c.inventory[old.id] = (c.inventory[old.id] ?? 0) + 1;
      c.equipment[it.slot] = { id: a.item, wear: 100 };
      recapacity(c);
      push(s, `Надето: ${it.name}.`, "info");
      break;
    }

    case "unequip": {
      const c = s.char;
      const worn = c.equipment[a.slot];
      if (!worn) return prev;
      if (invCount(c) >= c.capacity) {
        push(s, "Нет места, чтобы снять вещь.", "bad");
        return s;
      }
      c.inventory[worn.id] = (c.inventory[worn.id] ?? 0) + 1;
      c.equipment[a.slot] = null;
      recapacity(c);
      push(s, `Снято: ${ITEMS[worn.id].name}.`, "info");
      break;
    }

    case "drop": {
      const c = s.char;
      if ((c.inventory[a.item] ?? 0) > 0) {
        c.inventory[a.item] = (c.inventory[a.item] ?? 1) - 1;
        if ((c.inventory[a.item] ?? 0) <= 0) delete c.inventory[a.item];
        recapacity(c);
        push(s, `Выброшено: ${ITEMS[a.item].name}.`, "info");
      } else {
        let done = false;
        for (const slot of Object.keys(c.equipment) as SlotId[]) {
          if (c.equipment[slot]?.id === a.item) {
            c.equipment[slot] = null;
            done = true;
            break;
          }
        }
        if (done) push(s, `Выброшено: ${ITEMS[a.item].name}.`, "info");
        else return prev;
      }
      break;
    }

    case "ride": {
      const c = s.char;
      if (a.on) {
        if (!hasItem(c, "bike")) return prev;
        if (c.riding) return prev;
        c.riding = true;
        push(s, "Запрыгнул на велосипед. B — сойти.", "info");
      } else {
        if (!c.riding) return prev;
        c.riding = false;
        push(s, "Съехал с велосипеда.", "info");
      }
      break;
    }

    case "bank": {
      const e = s.char.economy;
      if (a.mode === "deposit") {
        const amt = Math.min(a.amount, e.cash);
        if (amt <= 0) {
          push(s, "Нечего класть на счёт.", "bad");
          return s;
        }
        e.cash -= amt;
        e.bank += amt;
        push(s, `На счёт: +$${amt}.`, "info");
      } else if (a.mode === "withdraw") {
        const amt = Math.min(a.amount, e.bank);
        if (amt <= 0) {
          push(s, "Со счёта нечего снимать.", "bad");
          return s;
        }
        e.bank -= amt;
        e.cash += amt;
        push(s, `Со счёта: −$${amt}.`, "info");
      } else {
        if (e.debt > 0) {
          push(s, "Есть непогашенный кредит. Сначала закрой его.", "bad");
          return s;
        }
        e.debt = LOAN_DEBT;
        e.debtPerDay = LOAN_PER_DAY;
        e.cash += LOAN_SUM;
        push(
          s,
          `Взял кредит: +$${LOAN_SUM}. Вернуть $${LOAN_DEBT} по $${LOAN_PER_DAY} в день.`,
          "info"
        );
      }
      break;
    }

    case "sleep": {
      const c = s.char;
      if (a.paid === "cot") {
        if (c.economy.cash < SHELTER_COST) {
          push(s, `Не хватает денег на койку ($${SHELTER_COST}).`, "bad");
          return s;
        }
        c.economy.cash -= SHELTER_COST;
        c.economy.totalSpent += SHELTER_COST;
        c.needs.energy = 100;
        c.needs.stress = clamp(c.needs.stress - 40);
        c.needs.hygiene = clamp(c.needs.hygiene + 5);
        c.statuses.push({
          id: "wellRested",
          label: "Хорошо отдохнул",
          desc: "Следующая смена: −50% энергии, +10% оплаты",
          tone: "good",
          ticksLeft: 16,
        });
        push(s, `Ночь на койке (−$${SHELTER_COST}). Полное восстановление.`, "good");
      } else if (a.paid === "room") {
        if (c.economy.cash < ROOM_COST) {
          push(s, `Не хватает денег на комнату ($${ROOM_COST}).`, "bad");
          return s;
        }
        c.economy.cash -= ROOM_COST;
        c.economy.totalSpent += ROOM_COST;
        c.needs.energy = 100;
        c.needs.stress = clamp(c.needs.stress - 30);
        c.needs.hygiene = clamp(c.needs.hygiene + 15);
        c.needs.mood = clamp(c.needs.mood + 10);
        c.statuses.push({
          id: "wellRested",
          label: "Хорошо отдохнул",
          desc: "Следующая смена: −50% энергии, +10% оплаты",
          tone: "good",
          ticksLeft: 16,
        });
        c.social.address = "Комната в ночлежке «Рассвет»";
        push(s, `Тихая ночь в съёмной комнате (−$${ROOM_COST}).`, "good");
      } else {
        c.needs.energy = clamp(c.needs.energy + 40);
        c.needs.hygiene = clamp(c.needs.hygiene - 10);
        c.needs.stress = clamp(c.needs.stress + 5);
        c.needs.mood = clamp(c.needs.mood - 5);
        c.social.reputation = clamp(c.social.reputation - 1, -100, 100);
        const coldRisk = s.weather === "rain" || c.needs.comfort < 40;
        if (coldRisk && !hasStatus(c, "cold") && Math.random() < 0.7) {
          c.statuses.push({
            id: "cold",
            label: "Простуда",
            desc: "−20% оплаты, быстрее устаёшь. Лекарство или 12 часов",
            tone: "bad",
            ticksLeft: 48,
          });
          push(s, "Простудился на улице!", "bad");
        }
        push(s, "Ночь на улице. Спалось плохо, −1 репутации.", "bad");
      }
      if (s.minutes >= 8 * 60) newDay(s);
      s.minutes = 8 * 60;
      break;
    }

    case "rest": {
      const c = s.char;
      const gain = c.needs.fullness <= 0 ? 5 : 15;
      c.needs.energy = clamp(c.needs.energy + gain);
      c.needs.stress = clamp(c.needs.stress - 12);
      const events: string[] = [];
      if (c.needs.mood > 30) addSkill(c, "social", 2, events);
      advance(s, 15);
      push(s, `Лавка в парке: +${gain} энергии, −стресс.`, "good");
      for (const e of events) push(s, e, "good");
      break;
    }

    case "scavenge": {
      const c = s.char;
      if (c.needs.energy < 3) {
        push(s, "Нет сил даже копаться в мусоре.", "bad");
        return s;
      }
      c.needs.energy = clamp(c.needs.energy - 2);
      advance(s, 15);
      const lucky = hasItem(c, "multitool") ? 0.12 : 0;
      const r = Math.random();
      if (r < 0.35) {
        c.inventory.bread = (c.inventory.bread ?? 0) + 1;
        push(s, "В баке нашёлся ещё съедобный хлеб.", "good");
      } else if (r < 0.5 + lucky) {
        c.inventory.soda = (c.inventory.soda ?? 0) + 1;
        push(s, "Нашлась почти полная банка газировки.", "good");
      } else if (r < 0.7 + lucky) {
        const coin = 1 + Math.floor(Math.random() * 3);
        c.economy.cash += coin;
        c.economy.totalEarned += coin;
        push(s, `Выгреб монетки: +$${coin}.`, "good");
      } else {
        push(s, "Только чья-то гнилая бумага.", "info");
      }
      if (!hasStatus(c, "injury") && Math.random() < 0.03) {
        c.statuses.push({
          id: "injury",
          label: "Травма",
          desc: "Травма из мусора: +30% расхода энергии. Аптечка поможет",
          tone: "bad",
          ticksLeft: 48,
        });
        push(s, "Порезался об консервную банку!", "bad");
      }
      break;
    }

    case "shower": {
      const c = s.char;
      if (c.economy.cash < SHOWER_COST) {
        push(s, `Душ стоит $${SHOWER_COST}. Не хватает денег.`, "bad");
        return s;
      }
      c.economy.cash -= SHOWER_COST;
      c.economy.totalSpent += SHOWER_COST;
      c.needs.hygiene = 90;
      c.needs.mood = clamp(c.needs.mood + 5);
      c.needs.stress = clamp(c.needs.stress - 5);
      advance(s, 30);
      push(s, `Горячий душ (−$${SHOWER_COST}). Снова почти человек.`, "good");
      break;
    }

    case "pc": {
      const c = s.char;
      if (c.economy.cash < PC_COST) {
        push(s, `Час за ПК стоит $${PC_COST}. Не хватает денег.`, "bad");
        return s;
      }
      c.economy.cash -= PC_COST;
      c.economy.totalSpent += PC_COST;
      c.needs.stress = clamp(c.needs.stress - 8);
      c.needs.energy = clamp(c.needs.energy - 3);
      const events: string[] = [];
      const intMult = 1 + Math.max(0, c.stats.int - 2) * 0.05;
      addSkill(c, "computer", Math.round(18 * intMult), events);
      advance(s, 60);
      push(s, `Час за компьютером (−$${PC_COST}). Пальцы помнят.`, "info");
      for (const e of events) push(s, e, "good");
      break;
    }

    case "documents": {
      const c = s.char;
      if (c.social.hasDocuments) return prev;
      const done = c.social.tenure.cleaning ?? 0;
      if (done < 3) {
        push(s, `Для документов нужно 3 смены уборки (сейчас ${done}).`, "bad");
        return s;
      }
      c.social.hasDocuments = true;
      c.social.reputation = clamp(c.social.reputation + 10, -100, 100);
      advance(s, 30);
      push(s, "Документы оформлены! Открываются новые работы.", "good");
      break;
    }

    case "call": {
      const c = s.char;
      if (!hasItem(c, "phone")) return prev;
      if (c.flags.phoneCallToday) {
        push(s, "Друг уже отвечал сегодня. Дай человеку жить.", "info");
        return s;
      }
      c.flags.phoneCallToday = true;
      c.needs.mood = clamp(c.needs.mood + 15);
      c.needs.stress = clamp(c.needs.stress - 10);
      const events: string[] = [];
      addSkill(c, "social", 3, events);
      push(s, "Позвонил другу. Чуть легче на душе.", "good");
      for (const e of events) push(s, e, "good");
      break;
    }
  }

  return s;
}
