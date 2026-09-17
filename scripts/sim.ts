// Проверка основных игровых сценариев через чистый редьюсер (без DOM).
// Запуск: npx tsx scripts/sim.ts

import { initialState, reducer } from "../src/game/reducer";
import { BUILDINGS, buildGrid, canWalk, bfs } from "../src/game/world";
import { JOBS } from "../src/game/data";
import type { Action, GameState } from "../src/game/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log("  FAIL " + name);
  }
}

const grid = buildGrid();
let s: GameState = initialState();
const d = (a: Action) => {
  s = reducer(s, a);
};
const stepTo = (tx: number, ty: number) => {
  const path = bfs(grid, s.x, s.y, tx, ty);
  if (!path) throw new Error("no path to " + tx + "," + ty);
  for (const [nx, ny] of path) {
    d({ type: "step", x: nx, y: ny, run: false, door: grid[ny][nx].kind === "door" });
  }
};

console.log("1. Старт");
check("0 наличных", s.char.economy.cash === 0);
check("здоровье 100", s.char.needs.health === 100);
check("старт проходим", canWalk(grid, s.x, s.y));
check("весь инвентарь = 1 (хлеб)", Object.values(s.char.inventory).reduce((a, b) => a + (b ?? 0), 0) === 1);

console.log("2. Перемещение к магазину (BFS + коллизии)");
const shop = BUILDINGS.find((b) => b.id === "shop")!;
stepTo(shop.doorX, shop.doorY);
check("у двери магазина", s.x === shop.doorX && s.y === shop.doorY);
check("время прошло", s.minutes > 8 * 60);
check("жажда начала снижаться", s.char.needs.thirst < 60);

console.log("3. Работа: 3 смены уборки → документы");
const office = BUILDINGS.find((b) => b.id === "office")!;
stepTo(office.doorX, office.doorY);
const cashBefore = s.char.economy.cash;
for (let i = 0; i < 3; i++) d({ type: "work", job: "cleaning" });
check("заработал на работе", s.char.economy.cash > cashBefore);
check("навык «Физ. труд» рос", s.char.skills.labor.xp > 0 || s.char.skills.labor.level > 0);
check("стаж уборки = 3", (s.char.social.tenure.cleaning ?? 0) === 3);
check("профессия присвоена", s.char.social.profession === JOBS.cleaning.title);
check("гигиена упала после смен", s.char.needs.hygiene < 50);
d({ type: "documents" });
check("документы оформлены", s.char.social.hasDocuments === true);
check("репутация выросла", s.char.social.reputation > 0);

console.log("4. Магазин: покупки, еда, закрытие на ночь");
const cash1 = s.char.economy.cash;
d({ type: "buy", item: "bread" });
check("хлеб куплен", (s.char.inventory.bread ?? 0) === 2);
check("деньги списаны", s.char.economy.cash === cash1 - 3);
const fullness1 = s.char.needs.fullness;
d({ type: "eat", item: "bread" });
check("еда подняла сытость", s.char.needs.fullness > fullness1);
check("хлеб потрачен", (s.char.inventory.bread ?? 0) === 1);
s = { ...s, minutes: 21 * 60 + 30 };
const cash2 = s.char.economy.cash;
d({ type: "buy", item: "water" });
check("магазин закрыт в 21:30", s.char.economy.cash === cash2 && (s.char.inventory.water ?? 0) === 0);

console.log("5. Одежда и инвентарь");
s = { ...s, minutes: 9 * 60 };
d({ type: "buy", item: "hoodie" });
check("худи куплено", (s.char.inventory.hoodie ?? 0) === 1);
d({ type: "equip", item: "hoodie" });
check("худи надето", s.char.equipment.top?.id === "hoodie");
check("худи не в инвентаре", (s.char.inventory.hoodie ?? 0) === 0);
const wornBefore = s.char.equipment.top?.wear ?? 0;
for (let i = 0; i < 4; i++) d({ type: "tick", minutes: 15 });
check("одежда изнашивается", (s.char.equipment.top?.wear ?? 1) < wornBefore);
d({ type: "unequip", slot: "top" });
check("худи снято обратно", (s.char.inventory.hoodie ?? 0) === 1);
d({ type: "drop", item: "hoodie" });
check("худи выброшено", (s.char.inventory.hoodie ?? 0) === 0);
d({ type: "buy", item: "backpack" });
check("рюкзак куплен", (s.char.inventory.backpack ?? 0) === 1);
check("вместимость выросла до 12", s.char.capacity === 12);

console.log("6. Банк и кредит");
const bank0 = s.char.economy.bank;
const cash3 = s.char.economy.cash;
d({ type: "bank", mode: "deposit", amount: 99999 });
check("вклад: всё на счёт", s.char.economy.cash === 0 && s.char.economy.bank === bank0 + cash3);
const bank1 = s.char.economy.bank;
d({ type: "bank", mode: "withdraw", amount: 1 });
check("снятие $1", s.char.economy.cash === 1 && s.char.economy.bank === bank1 - 1);
d({ type: "bank", mode: "loan", amount: 0 });
check("кредит взят: долг $60", s.char.economy.debt === 60 && s.char.economy.debtPerDay === 12);
check("кредит на руках +$50", s.char.economy.cash === 51);

console.log("7. Сон: койка, новый день, платёж по кредиту");
d({ type: "bank", mode: "withdraw", amount: 99999 });
const day0 = s.day;
const cash4 = s.char.economy.cash;
d({ type: "sleep", paid: "cot" });
check("новый день", s.day === day0 + 1);
check("08:00", s.minutes === 480);
check("энергия 100", s.char.needs.energy === 100);
check("статус «Хорошо отдохнул»", s.char.statuses.some((x) => x.id === "wellRested"));
check("койка и платёж списаны", s.char.economy.cash === cash4 - 4 - 12);

console.log("8. Потребности за игровые сутки");
const f0 = s.char.needs.fullness;
const t0 = s.char.needs.thirst;
for (let i = 0; i < 24; i++) d({ type: "tick", minutes: 15 });
check("сытость упала", s.char.needs.fullness < f0);
check("жажда упала быстрее", s.char.needs.thirst < t0);
check("жив после 6 часов", !s.dead);

console.log("9. Здоровье и смерть");
s.char.needs.fullness = 0;
s.char.needs.thirst = 0;
s.char.needs.health = 2;
d({ type: "tick", minutes: 15 });
check("смерть при 0 здоровья", s.dead === true);
const deadLog = s.log[s.log.length - 1];
check("лог смерти", deadLog.tone === "bad");
const minBefore = s.minutes;
s = reducer(s, { type: "step", x: s.x, y: s.y, run: false, door: false });
check("мёртвый не ходит (время не идёт)", s.minutes === minBefore);

console.log("10. Рестарт и кругосветка сохранений");
s = reducer(s, { type: "restart" });
check("рестарт: день 1", s.day === 1);
check("рестарт: 0 $", s.char.economy.cash === 0);
const json = JSON.stringify(s);
const back = JSON.parse(json) as GameState;
check(
  "save/load round-trip",
  back.day === s.day &&
    back.char.economy.cash === s.char.economy.cash &&
    back.char.needs.health === s.char.needs.health &&
    back.char.statuses.length === s.char.statuses.length
);

console.log(`\nИтог: ${pass} ok, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
