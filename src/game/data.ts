import type { JobId } from "./world";

export type ItemId =
  | "bread"
  | "water"
  | "sandwich"
  | "soda"
  | "energy"
  | "soup"
  | "coldMed"
  | "apothecary"
  | "illMed"
  | "soap"
  | "cap"
  | "beanie"
  | "hoodie"
  | "coat"
  | "jeans"
  | "sneakers"
  | "backpack"
  | "multitool"
  | "umbrella"
  | "phone"
  | "bike";

export type ItemCat = "food" | "med" | "cloth" | "tool" | "misc";
export type SlotId = "head" | "top" | "bottom" | "shoes";
export type SkillId =
  | "labor"
  | "trade"
  | "cooking"
  | "driving"
  | "mechanics"
  | "medicine"
  | "social"
  | "computer";
export type StatId = "str" | "end" | "int" | "cha" | "agi";

export const SLOTS: SlotId[] = ["head", "top", "bottom", "shoes"];
export const SLOT_NAMES: Record<SlotId, string> = {
  head: "Голова",
  top: "Верх",
  bottom: "Низ",
  shoes: "Обувь",
};

export const SKILL_NAMES: Record<SkillId, string> = {
  labor: "Физический труд",
  trade: "Торговля",
  cooking: "Кулинария",
  driving: "Вождение",
  mechanics: "Механика",
  medicine: "Медицина",
  social: "Общение",
  computer: "Компьютеры",
};

export const STAT_NAMES: Record<StatId, string> = {
  str: "Сила",
  end: "Выносливость",
  int: "Интеллект",
  cha: "Харизма",
  agi: "Ловкость",
};

export const STAT_DESC: Record<StatId, string> = {
  str: "Оплата физической работы",
  end: "Меньше тратится энергии",
  int: "Быстрее растёт опыт навыков",
  cha: "Торговля, продажа вещей, продавцы",
  agi: "Скорость ходьбы и бега",
};

export interface Item {
  id: ItemId;
  name: string;
  price: number;
  icon: string;
  cat: ItemCat;
  desc: string;
  // эффекты при использовании
  fullness?: number;
  thirst?: number;
  energy?: number;
  hygiene?: number;
  health?: number;
  cures?: ("cold" | "illness" | "injury")[];
  // одежда
  slot?: SlotId;
  warmth?: number;
  quality?: "poor" | "ok" | "good";
  color?: string;
  // прочее
  capacityBonus?: number;
}

export const ITEMS: Record<ItemId, Item> = {
  bread: { id: "bread", name: "Хлеб", price: 3, icon: "🍞", cat: "food", desc: "+25 сытости", fullness: 25 },
  water: { id: "water", name: "Вода бутилированная", price: 1, icon: "💧", cat: "food", desc: "+30 жажды", thirst: 30 },
  sandwich: { id: "sandwich", name: "Колбасный сэндвич", price: 5, icon: "🥪", cat: "food", desc: "+40 сытости, +10 энергии", fullness: 40, energy: 10 },
  soda: { id: "soda", name: "Газировка", price: 2, icon: "🥤", cat: "food", desc: "+15 жажды, +15 энергии", thirst: 15, energy: 15 },
  energy: { id: "energy", name: "Энергетик «Молния»", price: 7, icon: "⚡", cat: "food", desc: "+50 энергии, +10 жажды", energy: 50, thirst: 10 },
  soup: { id: "soup", name: "Горячий суп", price: 4, icon: "🍲", cat: "food", desc: "+30 сытости, +20 жажды, +5 энергии", fullness: 30, thirst: 20, energy: 5 },
  coldMed: { id: "coldMed", name: "Простудное", price: 6, icon: "🤧", cat: "med", desc: "Лечит простуду", cures: ["cold"] },
  apothecary: { id: "apothecary", name: "Аптечка", price: 8, icon: "🩹", cat: "med", desc: "Лечит травму, +15 здоровья", cures: ["injury"], health: 15 },
  illMed: { id: "illMed", name: "Лекарство", price: 8, icon: "💊", cat: "med", desc: "Лечит болезнь", cures: ["illness"] },
  soap: { id: "soap", name: "Мыло", price: 3, icon: "🧼", cat: "med", desc: "+40 гигиены", hygiene: 40 },
  cap: { id: "cap", name: "Кепка из секонда", price: 3, icon: "🧢", cat: "cloth", desc: "Тепло +1", slot: "head", warmth: 1, quality: "poor", color: "#5a6470" },
  beanie: { id: "beanie", name: "Вязаная шапка", price: 5, icon: "", cat: "cloth", desc: "Тепло +3", slot: "head", warmth: 3, quality: "ok", color: "#8a3b2e" },
  hoodie: { id: "hoodie", name: "Худи", price: 6, icon: "👕", cat: "cloth", desc: "Тепло +3", slot: "top", warmth: 3, quality: "ok", color: "#4a6b8a" },
  coat: { id: "coat", name: "Тёплое пальто", price: 14, icon: "🧥", cat: "cloth", desc: "Тепло +8", slot: "top", warmth: 8, quality: "good", color: "#3c4a3f" },
  jeans: { id: "jeans", name: "Джинсы", price: 5, icon: "👖", cat: "cloth", desc: "Тепло +3", slot: "bottom", warmth: 3, quality: "ok", color: "#3f4a6b" },
  sneakers: { id: "sneakers", name: "Кроссовки", price: 5, icon: "👟", cat: "cloth", desc: "Тепло +2", slot: "shoes", warmth: 2, quality: "ok", color: "#c9ced4" },
  backpack: { id: "backpack", name: "Рюкзак", price: 10, icon: "🎒", cat: "misc", desc: "+6 к вместимости инвентаря", capacityBonus: 6 },
  multitool: { id: "multitool", name: "Мультитул", price: 6, icon: "🔧", cat: "tool", desc: "Пассивно: лучше удача при шуршинге мусора" },
  umbrella: { id: "umbrella", name: "Зонт", price: 5, icon: "☂️", cat: "tool", desc: "Пассивно: не мочит в дождь" },
  phone: { id: "phone", name: "Старый телефон", price: 15, icon: "📱", cat: "misc", desc: "Раз в день: звонок другу (+15 настроения). Даёт опыт «Общение»" },
  bike: { id: "bike", name: "Велосипед", price: 25, icon: "🚲", cat: "misc", desc: "Транспорт: быстрая езда (B), быстрее расход энергии" },
};

export const SHOP_GROUPS: { title: string; items: ItemId[] }[] = [
  { title: "Еда и напитки", items: ["bread", "water", "sandwich", "soda", "energy", "soup"] },
  { title: "Медицина", items: ["coldMed", "apothecary", "illMed"] },
  { title: "Гигиена", items: ["soap"] },
  { title: "Одежда (секонд)", items: ["cap", "beanie", "hoodie", "coat", "jeans", "sneakers"] },
  { title: "Прочее", items: ["backpack", "multitool", "umbrella", "phone", "bike"] },
];

export interface Job {
  id: JobId;
  title: string;
  place: string;
  pay: number;
  energy: number;
  fullness: number; // отрицательное = расход сытости
  thirst: number; // отрицательное = расход жажды
  open: number;
  close: number;
  xp: { main: SkillId; amount: number; secondary?: { id: SkillId; amount: number } };
  req?: {
    skill?: [SkillId, number];
    stat?: [StatId, number];
    hygiene?: number;
    docs?: boolean;
    rep?: number;
  };
  desc: string;
}

export const JOBS: Record<JobId, Job> = {
  loading: {
    id: "loading",
    title: "Разгрузчик",
    place: "Склад №7",
    pay: 10,
    energy: 20,
    fullness: -12,
    thirst: -6,
    open: 7,
    close: 20,
    xp: { main: "labor", amount: 12 },
    desc: "Ящики, паллеты, спина. Платят наличными.",
  },
  courier: {
    id: "courier",
    title: "Курьер на велосипеде",
    place: "Склад №7",
    pay: 11,
    energy: 16,
    fullness: -10,
    thirst: -8,
    open: 8,
    close: 22,
    req: { stat: ["agi", 2] },
    xp: { main: "driving", amount: 12, secondary: { id: "social", amount: 4 } },
    desc: "Маршруты по кварталу на фирменном велосипеде.",
  },
  driver: {
    id: "driver",
    title: "Водитель-курьер",
    place: "Склад №7",
    pay: 15,
    energy: 18,
    fullness: -10,
    thirst: -8,
    open: 9,
    close: 21,
    req: { skill: ["driving", 2], docs: true },
    xp: { main: "driving", amount: 12 },
    desc: "Своя маршрутка. Нужны документы и навык «Вождение».",
  },
  kitchen: {
    id: "kitchen",
    title: "Помощник на кухне",
    place: "Кафе «Гусяк»",
    pay: 14,
    energy: 25,
    fullness: -12,
    thirst: -8,
    open: 10,
    close: 23,
    req: { hygiene: 40 },
    xp: { main: "cooking", amount: 12, secondary: { id: "labor", amount: 4 } },
    desc: "Вечерняя смена — тяжелее, но платят больше.",
  },
  cleaning: {
    id: "cleaning",
    title: "Уборка улиц",
    place: "Участок «Южный»",
    pay: 7,
    energy: 15,
    fullness: -8,
    thirst: -4,
    open: 6,
    close: 18,
    xp: { main: "labor", amount: 8 },
    desc: "Мелко, но стабильно. Единственная работа без требований.",
  },
  mechanic1: {
    id: "mechanic1",
    title: "Подсобник сервиса",
    place: "Автосервис «Гараж»",
    pay: 9,
    energy: 18,
    fullness: -10,
    thirst: -5,
    open: 8,
    close: 18,
    req: { skill: ["labor", 2] },
    xp: { main: "mechanics", amount: 12, secondary: { id: "labor", amount: 4 } },
    desc: "Масло, ветошь, вопросы к мастеру. Так начинают механики.",
  },
  mechanic2: {
    id: "mechanic2",
    title: "Механик",
    place: "Автосервис «Гараж»",
    pay: 16,
    energy: 20,
    fullness: -10,
    thirst: -6,
    open: 8,
    close: 18,
    req: { skill: ["mechanics", 3], stat: ["int", 2] },
    xp: { main: "mechanics", amount: 12 },
    desc: "Свои руки, своя ответственность, свои деньги.",
  },
  med1: {
    id: "med1",
    title: "Принят медпункта",
    place: "Медпункт",
    pay: 8,
    energy: 12,
    fullness: -8,
    thirst: -4,
    open: 8,
    close: 20,
    req: { hygiene: 50 },
    xp: { main: "medicine", amount: 12, secondary: { id: "social", amount: 4 } },
    desc: "Раздавать справки и не пускать всех подряд. Чистоту требуют.",
  },
  nurse: {
    id: "nurse",
    title: "Фельдшер",
    place: "Медпункт",
    pay: 13,
    energy: 14,
    fullness: -8,
    thirst: -4,
    open: 9,
    close: 19,
    req: { skill: ["medicine", 2], stat: ["int", 2] },
    xp: { main: "medicine", amount: 12 },
    desc: "Повязки, уколы, чужие проблемы.",
  },
  seller: {
    id: "seller",
    title: "Продавец-кассир",
    place: "Продукты «Скидка»",
    pay: 8,
    energy: 10,
    fullness: -6,
    thirst: -4,
    open: 8,
    close: 21,
    req: { skill: ["trade", 1], stat: ["cha", 2] },
    xp: { main: "trade", amount: 12, secondary: { id: "social", amount: 6 } },
    desc: "Касса, полки, соседки у витрины. Нужна харизма.",
  },
  computer: {
    id: "computer",
    title: "Оператор (удалёнка)",
    place: "Интернет-кафе «Вайфай»",
    pay: 10,
    energy: 8,
    fullness: -6,
    thirst: -4,
    open: 10,
    close: 23,
    req: { skill: ["computer", 2], stat: ["int", 2] },
    xp: { main: "computer", amount: 12 },
    desc: "Ввод данных для фирмы из другого города. На их компьютере.",
  },
};

export const SHELTER_COST = 4;
export const ROOM_COST = 6;
export const SHOWER_COST = 2;
export const PC_COST = 2;
export const LOAN_SUM = 50;
export const LOAN_DEBT = 60;
export const LOAN_PER_DAY = 12;
export const SHOP_OPEN = 8;
export const SHOP_CLOSE = 21;
