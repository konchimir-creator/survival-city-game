import type { JobId } from "./world";

export type ItemId = "bread" | "water" | "sandwich" | "soda" | "energy";

export interface Item {
  id: ItemId;
  name: string;
  price: number;
  icon: string;
  desc: string;
  energy: number;
  hunger: number;
}

export const ITEMS: Record<ItemId, Item> = {
  bread: {
    id: "bread",
    name: "Хлеб",
    price: 3,
    icon: "🍞",
    desc: "−25 голода",
    energy: 0,
    hunger: -25,
  },
  water: {
    id: "water",
    name: "Вода бутилированная",
    price: 1,
    icon: "💧",
    desc: "+10 энергии",
    energy: 10,
    hunger: 0,
  },
  sandwich: {
    id: "sandwich",
    name: "Колбасный сэндвич",
    price: 5,
    icon: "🥪",
    desc: "−40 голода, +10 энергии",
    energy: 10,
    hunger: -40,
  },
  soda: {
    id: "soda",
    name: "Газировка",
    price: 2,
    icon: "🥤",
    desc: "+20 энергии",
    energy: 20,
    hunger: 0,
  },
  energy: {
    id: "energy",
    name: "Энергетик «Молния»",
    price: 7,
    icon: "⚡",
    desc: "+50 энергии",
    energy: 50,
    hunger: 0,
  },
};

export const SHOP_ITEMS: ItemId[] = ["bread", "water", "sandwich", "soda", "energy"];

export interface Job {
  id: JobId;
  title: string;
  place: string;
  pay: number;
  energy: number;
  hunger: number;
  open: number;
  close: number;
  desc: string;
}

export const JOBS: Record<JobId, Job> = {
  loading: {
    id: "loading",
    title: "Разгрузчик",
    place: "Склад №7",
    pay: 10,
    energy: 20,
    hunger: 12,
    open: 7,
    close: 20,
    desc: "Ящики, паллеты, спина. Платят наличными.",
  },
  kitchen: {
    id: "kitchen",
    title: "Помощник на кухне",
    place: "Кафе «Гусяк»",
    pay: 14,
    energy: 25,
    hunger: 12,
    open: 10,
    close: 23,
    desc: "Вечерняя смена — тяжелее, но платят больше.",
  },
  cleaning: {
    id: "cleaning",
    title: "Уборка улиц",
    place: "Участок «Южный»",
    pay: 7,
    energy: 15,
    hunger: 8,
    open: 6,
    close: 18,
    desc: "Мелко, но стабильно. Единственная дневная работа в квартале.",
  },
};

export const SHELTER_COST = 4;
export const SHOP_OPEN = 8;
export const SHOP_CLOSE = 21;
