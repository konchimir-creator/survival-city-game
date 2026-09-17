// Ядро системы персонажа: старт, пассивный износ, температура, навыки, работа, торговля.

import type { ActiveStatus, CharacterState, NeedId, Weather } from "./types";
import type { Item, ItemId, Job, SkillId, SlotId, StatId } from "./data";
import { ITEMS, SLOTS, SKILL_NAMES, STAT_NAMES } from "./data";
import type { JobId } from "./world";

export const BASE_CAPACITY = 6;

export const WEATHER_NAMES: Record<Weather, string> = {
  clear: "ясно",
  overcast: "пасмурно",
  rain: "дождь",
};

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function rollWeather(): Weather {
  const r = Math.random();
  if (r < 0.5) return "clear";
  if (r < 0.8) return "overcast";
  return "rain";
}

export function initialCharacter(): CharacterState {
  return {
    name: "Безымянный",
    age: 24,
    needs: {
      health: 100,
      fullness: 60,
      thirst: 60,
      energy: 80,
      hygiene: 50,
      mood: 50,
      stress: 30,
      comfort: 100,
    },
    bodyTemp: 36.7,
    stats: { str: 2, end: 2, int: 2, cha: 1, agi: 2 },
    skills: {
      labor: { level: 0, xp: 0 },
      trade: { level: 0, xp: 0 },
      cooking: { level: 0, xp: 0 },
      driving: { level: 0, xp: 0 },
      mechanics: { level: 0, xp: 0 },
      medicine: { level: 0, xp: 0 },
      social: { level: 0, xp: 0 },
      computer: { level: 0, xp: 0 },
    },
    social: {
      reputation: 0,
      education: "9 классов",
      profession: null,
      tenure: {},
      legalStatus: "Судимостей нет",
      hasDocuments: false,
      address: "Бездомный",
    },
    economy: {
      cash: 0,
      bank: 0,
      debt: 0,
      debtPerDay: 0,
      lastShiftPay: 0,
      totalEarned: 0,
      totalSpent: 0,
    },
    equipment: { head: null, top: null, bottom: null, shoes: null },
    inventory: { bread: 1 },
    capacity: BASE_CAPACITY,
    statuses: [],
    riding: false,
    flags: { phoneCallToday: false },
  };
}

export function hasItem(c: CharacterState, id: keyof typeof ITEMS): boolean {
  return (c.inventory[id] ?? 0) > 0;
}

export function hasStatus(c: CharacterState, id: string): boolean {
  return c.statuses.some((s) => s.id === id);
}

export function invCount(c: CharacterState): number {
  return Object.values(c.inventory).reduce((a, b) => a + (b ?? 0), 0);
}

export function recapacity(c: CharacterState): void {
  c.capacity = BASE_CAPACITY + ((c.inventory.backpack ?? 0) > 0 ? 6 : 0);
}

/* ---------- навыки ---------- */

export function xpForNext(level: number): number {
  return 40 + level * 30;
}

const SKILL_STAT: Record<SkillId, StatId> = {
  labor: "str",
  trade: "cha",
  cooking: "str",
  driving: "agi",
  mechanics: "str",
  medicine: "int",
  social: "cha",
  computer: "int",
};

/** Добавляет опыт; возвращает сообщения об апгрейдах (для журнала). */
export function addSkill(
  c: CharacterState,
  id: SkillId,
  amount: number,
  events: string[]
): void {
  if (amount <= 0) return;
  const sk = c.skills[id];
  sk.xp += amount;
  while (sk.xp >= xpForNext(sk.level) && sk.level < 10) {
    sk.xp -= xpForNext(sk.level);
    sk.level += 1;
    const stat: StatId =
      id === "labor" ? (sk.level % 2 === 0 ? "end" : "str") : SKILL_STAT[id];
    c.stats[stat] += 1;
    events.push(`Навык «${SKILL_NAMES[id]}» → ур. ${sk.level} (+1 ${STAT_NAMES[stat]})`);
  }
}

/* ---------- температура и комфорт ---------- */

export function ambientTemp(weather: Weather, hour: number): number {
  let base = 12;
  if (hour >= 21 || hour < 6) base = 8;
  else if (hour < 11) base = 11;
  else if (hour < 16) base = 17;
  else base = 12;
  base += weather === "clear" ? 2 : weather === "overcast" ? -1 : -4;
  return base;
}

export function insulation(c: CharacterState): number {
  let w = 0;
  for (const s of SLOTS) {
    const e = c.equipment[s];
    if (e) w += (ITEMS[e.id].warmth ?? 0) * (e.wear > 20 ? 1 : 0.5);
  }
  return w;
}

export function comfortOf(ambient: number, ins: number): number {
  const eff = ambient + ins * 0.7;
  return clamp(Math.round(100 - Math.max(0, 12 - eff) * 7.5 - Math.max(0, eff - 28) * 5), 0, 100);
}

/* ---------- пассивный тик (15 игровых минут) ---------- */

export function tickChar(
  c: CharacterState,
  minutes: number,
  weather: Weather,
  hour: number
): void {
  const chunks = Math.floor(minutes / 15);
  for (let i = 0; i < chunks; i++) {
    const n = c.needs;
    n.fullness -= 1;
    n.thirst -= 1.25;
    n.energy -= 0.7 * (1 - Math.max(0, c.stats.end - 2) * 0.04);

    let hyg = 0.25;
    if (weather === "rain" && !hasItem(c, "umbrella")) hyg += 0.35;
    n.hygiene -= hyg;

    n.stress += 0.15;

    let moodD = (50 - n.mood) * 0.02;
    if (n.fullness <= 20) moodD -= 0.5;
    if (n.thirst <= 20) moodD -= 0.4;
    if (n.fullness >= 80) moodD += 0.2;
    if (n.energy >= 85 && n.thirst >= 50) moodD += 0.1;
    if (n.stress >= 80) moodD -= 0.4;
    n.mood += moodD;

    const amb = ambientTemp(weather, hour);
    n.comfort = comfortOf(amb, insulation(c));
    c.bodyTemp = Math.round((36.7 - Math.max(0, 60 - n.comfort) * 0.015 + 0.05) * 10) / 10;

    let drain = 0;
    if (n.fullness <= 0) drain += 1;
    if (n.thirst <= 0) drain += 1.25;
    if (n.comfort < 45) drain += n.comfort < 20 ? 1 : 0.3;
    if (n.stress >= 100) drain += 0.5;
    if (hasStatus(c, "injury")) drain += 0.2;
    if (hasStatus(c, "illness")) drain += 0.5;
    n.health -= drain;
    if (
      drain === 0 &&
      !hasStatus(c, "illness") &&
      n.fullness > 30 &&
      n.thirst > 30 &&
      n.stress < 70
    ) {
      n.health = Math.min(100, n.health + 0.5);
    }

    for (const slot of SLOTS) {
      const w = c.equipment[slot];
      if (w) w.wear = Math.max(0, w.wear - 0.2);
    }

    c.statuses = c.statuses.filter((st) => {
      if (st.ticksLeft === undefined) return true;
      st.ticksLeft -= 1;
      return st.ticksLeft > 0;
    });

    if (
      !hasStatus(c, "illness") &&
      n.hygiene <= 10 &&
      n.stress >= 70 &&
      Math.random() < 0.02
    ) {
      c.statuses.push({
        id: "illness",
        label: "Болезнь",
        desc: "Иммунитет подводит. Нужно лекарство из магазина",
        tone: "bad",
        ticksLeft: 64,
      });
    }

    for (const k of Object.keys(n) as NeedId[]) n[k] = clamp(n[k], 0, 100);
  }
}

/* ---------- производные состояния ---------- */

export function derivedStatuses(c: CharacterState): ActiveStatus[] {
  const n = c.needs;
  const list: ActiveStatus[] = [];
  if (n.fullness <= 20)
    list.push({ id: "hungry", label: "Голод", desc: "Энергия и настроение падают быстрее", tone: "bad" });
  if (n.thirst <= 20)
    list.push({ id: "dehydrated", label: "Обезвоживание", desc: "Энергия уходит, здоровью угроза", tone: "bad" });
  if (n.energy <= 25)
    list.push({ id: "tired", label: "Усталость", desc: "−10% к оплате смен", tone: "bad" });
  if (n.hygiene <= 25)
    list.push({ id: "dirty", label: "Грязный", desc: "Кухня и медпункт не пустят", tone: "bad" });
  if (n.comfort < 45)
    list.push({ id: "frozen", label: "Замёрз", desc: "Падает здоровье. Одевайся теплее", tone: "bad" });
  if (n.mood <= 20)
    list.push({ id: "gloomy", label: "Уныние", desc: "−10% к оплате смен", tone: "bad" });
  if (n.fullness >= 80)
    list.push({ id: "full", label: "Сыт", desc: "Настроение держится", tone: "good" });
  if (n.energy >= 85 && n.thirst >= 50)
    list.push({ id: "peppy", label: "Бодрость", desc: "Смены тратят на 25% меньше энергии", tone: "good" });
  return list;
}

/* ---------- работа ---------- */

const PHYSICAL_JOBS = new Set<JobId>(["loading", "cleaning", "mechanic1", "mechanic2", "kitchen"]);

export function jobIssue(c: CharacterState, job: Job): string | null {
  const r = job.req;
  if (!r) return null;
  if (r.skill && c.skills[r.skill[0]].level < r.skill[1])
    return `Нужен навык «${SKILL_NAMES[r.skill[0]]}» ур. ${r.skill[1]}`;
  if (r.stat && c.stats[r.stat[0]] < r.stat[1])
    return `Нужно ${STAT_NAMES[r.stat[0]]} ${r.stat[1]}`;
  if (r.hygiene && c.needs.hygiene < r.hygiene)
    return `Слишком грязно: нужна гигиена ≥ ${r.hygiene}`;
  if (r.docs && !c.social.hasDocuments) return "Нужны документы";
  if (r.rep && c.social.reputation < r.rep) return `Нужна репутация ≥ ${r.rep}`;
  return null;
}

export function jobPay(c: CharacterState, job: Job): number {
  let pay = job.pay;
  if (PHYSICAL_JOBS.has(job.id)) pay *= 1 + Math.max(0, c.stats.str - 2) * 0.04;
  if (job.id === "seller") pay *= 1 + Math.max(0, c.stats.cha - 2) * 0.05;
  pay *= c.social.reputation >= 20 ? 1.05 : c.social.reputation <= -20 ? 0.95 : 1;
  if (c.needs.mood <= 20) pay *= 0.9;
  if (c.needs.energy <= 25) pay *= 0.9;
  if (hasStatus(c, "cold")) pay *= 0.8;
  if (hasStatus(c, "illness")) pay *= 0.7;
  return Math.max(1, Math.round(pay));
}

export function jobEnergyCost(c: CharacterState, job: Job): number {
  let cost = job.energy * (1 - Math.max(0, c.stats.end - 2) * 0.05);
  if (c.needs.energy >= 85 && c.needs.thirst >= 50) cost *= 0.75;
  if (hasStatus(c, "injury")) cost *= 1.3;
  if (hasStatus(c, "wellRested")) cost *= 0.5;
  return Math.max(1, Math.round(cost));
}

/* ---------- торговля ---------- */

export function sellPrice(c: CharacterState, item: Item): number {
  const mult =
    0.4 + Math.max(0, c.stats.cha - 1) * 0.03 + c.skills.trade.level * 0.04;
  return Math.max(1, Math.round(item.price * mult));
}

/* ---------- инвентарь ---------- */

export function equippedIn(c: CharacterState, id: ItemId): SlotId | null {
  for (const s of SLOTS) if (c.equipment[s]?.id === id) return s;
  return null;
}
