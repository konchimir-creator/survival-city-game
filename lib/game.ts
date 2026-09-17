export type ItemId = "bread" | "coffee" | "sandwich" | "medkit" | "bicycle" | "toolbox";

export interface Item {
  id: ItemId;
  name: string;
  price: number;
  energy?: number;
  hunger?: number;
  health?: number;
  desc: string;
  consumable: boolean;
}

export const ITEMS: Record<ItemId, Item> = {
  bread: { id: "bread", name: "Хлеб", price: 8, hunger: 25, desc: "Дешёвая еда.", consumable: true },
  coffee: { id: "coffee", name: "Кофе", price: 12, energy: 20, hunger: -5, desc: "Бодрит.", consumable: true },
  sandwich: { id: "sandwich", name: "Сэндвич", price: 20, hunger: 45, energy: 5, desc: "Сытно.", consumable: true },
  medkit: { id: "medkit", name: "Аптечка", price: 45, health: 40, desc: "Лечит раны.", consumable: true },
  bicycle: { id: "bicycle", name: "Велосипед", price: 180, desc: "Перемещение без затрат энергии.", consumable: false },
  toolbox: { id: "toolbox", name: "Ящик с инструментом", price: 140, desc: "Открывает работу мастера.", consumable: false },
};

export type LocationId = "square" | "market" | "warehouse" | "cafe" | "shelter" | "site" | "shop" | "flat";

export interface Location {
  id: LocationId;
  name: string;
  x: number;
  y: number;
  color: string;
  desc: string;
}

export const LOCATIONS: Location[] = [
  { id: "square", name: "Площадь", x: 50, y: 52, color: "#4b5563", desc: "Центр квартала. Тут можно просто посидеть." },
  { id: "market", name: "Рынок", x: 18, y: 22, color: "#b45309", desc: "Разгрузка ящиков, грязная но честная подработка." },
  { id: "warehouse", name: "Склад", x: 80, y: 20, color: "#334155", desc: "Тяжёлая работа, платят прилично." },
  { id: "cafe", name: "Кафе «Уголёк»", x: 20, y: 78, color: "#7c2d12", desc: "Мойка посуды и запах кофе." },
  { id: "site", name: "Стройка", x: 78, y: 76, color: "#a16207", desc: "Опасно, но денежно." },
  { id: "shop", name: "Магазин", x: 50, y: 15, color: "#15803d", desc: "Еда и снаряжение." },
  { id: "shelter", name: "Ночлежка", x: 14, y: 50, color: "#1e3a8a", desc: "Койка за 15₽ или бесплатно под мостом." },
  { id: "flat", name: "Съёмная комната", x: 86, y: 50, color: "#6d28d9", desc: "Аренда 400₽ в неделю. Спится хорошо." },
];

export interface Job {
  id: string;
  location: LocationId;
  name: string;
  pay: number;
  energy: number;
  hunger: number;
  hours: number;
  requires?: ItemId;
  risk?: number;
}

export const JOBS: Job[] = [
  { id: "boxes", location: "market", name: "Таскать ящики", pay: 45, energy: 22, hunger: 14, hours: 2 },
  { id: "sweep", location: "market", name: "Подмести ряды", pay: 20, energy: 10, hunger: 6, hours: 1 },
  { id: "loader", location: "warehouse", name: "Грузчик", pay: 90, energy: 38, hunger: 22, hours: 4 },
  { id: "dishes", location: "cafe", name: "Мыть посуду", pay: 55, energy: 24, hunger: 12, hours: 3 },
  { id: "concrete", location: "site", name: "Бетонные работы", pay: 150, energy: 45, hunger: 28, hours: 5, risk: 0.25 },
  { id: "repair", location: "site", name: "Мелкий ремонт", pay: 220, energy: 35, hunger: 20, hours: 5, requires: "toolbox" },
];

export interface GameState {
  money: number;
  energy: number;
  hunger: number;
  health: number;
  day: number;
  hour: number;
  at: LocationId;
  inventory: Partial<Record<ItemId, number>>;
  housingDaysLeft: number;
  log: string[];
}

export const INITIAL: GameState = {
  money: 0,
  energy: 70,
  hunger: 40,
  health: 100,
  day: 1,
  hour: 8,
  at: "square",
  inventory: {},
  housingDaysLeft: 0,
  log: ["Ты просыпаешься на скамейке. Ни денег, ни дома, ни работы."],
};

export const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function dist(a: Location, b: Location) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function travelCost(from: LocationId, to: LocationId, hasBike: boolean) {
  const A = LOCATIONS.find((l) => l.id === from)!;
  const B = LOCATIONS.find((l) => l.id === to)!;
  const d = dist(A, B);
  const energy = hasBike ? 0 : Math.round(d / 12);
  const hours = hasBike ? 0 : Math.max(0, Math.round(d / 40));
  return { energy, hours };
}

export function advance(s: GameState, hours: number): GameState {
  let { day, hour } = s;
  hour += hours;
  while (hour >= 24) {
    hour -= 24;
    day += 1;
  }
  return { ...s, day, hour };
}
