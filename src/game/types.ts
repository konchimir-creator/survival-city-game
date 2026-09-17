import type { ItemId, SlotId, SkillId, StatId } from "./data";
import type { JobId } from "./world";

// единая точка входа для типизации контента
export type { ItemId, SlotId, SkillId, StatId, Item, Job } from "./data";
export type { Building, JobId } from "./world";

/** Базовые потребности персонажа (0–100). */
export type NeedId =
  | "health"
  | "fullness"
  | "thirst"
  | "energy"
  | "hygiene"
  | "mood"
  | "stress"
  | "comfort";
export type Needs = Record<NeedId, number>;

export type Stats = Record<StatId, number>;

export interface Skill {
  level: number;
  xp: number;
}
export type Skills = Record<SkillId, Skill>;

export interface WornItem {
  id: ItemId;
  wear: number; // 0..100
}
export type Equipment = Record<SlotId, WornItem | null>;

/** Временный эффект: и производный (пересчитывается), и персистентный (ticksLeft). */
export interface ActiveStatus {
  id: string;
  label: string;
  desc: string;
  tone: "bad" | "good" | "neutral";
  ticksLeft?: number;
}

export interface SocialProfile {
  reputation: number; // -100..100
  education: string;
  profession: string | null;
  tenure: Partial<Record<JobId, number>>; // смен отработано по каждой работе
  legalStatus: string;
  hasDocuments: boolean;
  address: string; // "Бездомный" или адрес
}

export interface Economy {
  cash: number;
  bank: number;
  debt: number;
  debtPerDay: number;
  lastShiftPay: number;
  totalEarned: number;
  totalSpent: number;
}

export interface CharacterState {
  name: string;
  age: number;
  needs: Needs;
  bodyTemp: number;
  stats: Stats;
  skills: Skills;
  social: SocialProfile;
  economy: Economy;
  equipment: Equipment;
  inventory: Partial<Record<ItemId, number>>;
  capacity: number;
  statuses: ActiveStatus[];
  riding: boolean;
  flags: {
    phoneCallToday: boolean;
  };
}

export type Weather = "clear" | "overcast" | "rain";

export interface LogEntry {
  id: number;
  day: number;
  time: string;
  text: string;
  tone: "good" | "bad" | "info";
}

export type Facing = "up" | "down" | "left" | "right";

export interface GameState {
  x: number;
  y: number;
  facing: Facing;
  day: number;
  minutes: number; // минут с полуночи (0..1439)
  pending: number; // накопленные минуты до следующего 15-минутного тика
  weather: Weather;
  char: CharacterState;
  log: LogEntry[];
  dead: boolean;
}

export type Action =
  | { type: "step"; x: number; y: number; run: boolean; door: boolean }
  | { type: "tick"; minutes: number }
  | { type: "work"; job: JobId }
  | { type: "buy"; item: ItemId }
  | { type: "sell"; item: ItemId }
  | { type: "eat"; item: ItemId }
  | { type: "use"; item: ItemId }
  | { type: "equip"; item: ItemId }
  | { type: "unequip"; slot: SlotId }
  | { type: "drop"; item: ItemId }
  | { type: "ride"; on: boolean }
  | { type: "bank"; mode: "deposit" | "withdraw" | "loan"; amount: number }
  | { type: "sleep"; paid: "street" | "cot" | "room" }
  | { type: "rest" }
  | { type: "scavenge" }
  | { type: "shower" }
  | { type: "pc" }
  | { type: "documents" }
  | { type: "call" }
  | { type: "load"; state: GameState }
  | { type: "restart" };
