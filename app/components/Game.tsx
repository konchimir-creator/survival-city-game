"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GameState, INITIAL, ITEMS, ItemId, JOBS, LOCATIONS, LocationId,
  advance, clamp, travelCost,
} from "../../lib/game";

const SAVE_KEY = "survival-city-save-v1";

export default function Game() {
  const [s, setS] = useState<GameState>(INITIAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) setS({ ...INITIAL, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }, [s, loaded]);

  const here = LOCATIONS.find((l) => l.id === s.at)!;
  const hasBike = (s.inventory.bicycle ?? 0) > 0;
  const jobs = useMemo(() => JOBS.filter((j) => j.location === s.at), [s.at]);
  const dead = s.health <= 0;

  const push = (st: GameState, msg: string): GameState => ({
    ...st, log: [`[Д${st.day} ${String(st.hour).padStart(2, "0")}:00] ${msg}`, ...st.log].slice(0, 60),
  });

  function tick(st: GameState, hours: number): GameState {
    let n = advance(st, hours);
    n = { ...n, hunger: clamp(n.hunger + hours * 3), energy: clamp(n.energy - hours * 1.5) };
    if (n.hunger >= 95) n = push({ ...n, health: clamp(n.health - hours * 4) }, "Голод разъедает тебя изнутри.");
    if (n.energy <= 3) n = push({ ...n, health: clamp(n.health - hours * 2) }, "Ты еле держишься на ногах.");
    if (n.day > st.day && n.housingDaysLeft > 0) n.housingDaysLeft -= n.day - st.day;
    if (n.health <= 0) n = push({ ...n, health: 0 }, "Ты потерял сознание на улице. Конец.");
    return n;
  }

  function travel(to: LocationId) {
    if (to === s.at || dead) return;
    const c = travelCost(s.at, to, hasBike);
    if (s.energy < c.energy) { setS(push(s, "Нет сил идти туда.")); return; }
    const dest = LOCATIONS.find((l) => l.id === to)!;
    let n: GameState = { ...s, at: to, energy: clamp(s.energy - c.energy) };
    n = tick(n, c.hours);
    setS(push(n, `Ты добрался до «${dest.name}»${hasBike ? " на велосипеде" : ""}.`));
  }

  function work(jobId: string) {
    const j = JOBS.find((x) => x.id === jobId)!;
    if (j.requires && !(s.inventory[j.requires] ?? 0)) { setS(push(s, `Нужен предмет: ${ITEMS[j.requires].name}.`)); return; }
    if (s.energy < j.energy) { setS(push(s, "Слишком мало энергии для этой смены.")); return; }
    let n: GameState = { ...s, money: s.money + j.pay, energy: clamp(s.energy - j.energy), hunger: clamp(s.hunger + j.hunger) };
    n = tick(n, j.hours);
    n = push(n, `Смена «${j.name}» окончена. +${j.pay}₽`);
    if (j.risk && Math.random() < j.risk) {
      const dmg = 10 + Math.floor(Math.random() * 20);
      n = push({ ...n, health: clamp(n.health - dmg) }, `Травма на работе: -${dmg} здоровья.`);
    }
    setS(n);
  }

  function buy(id: ItemId) {
    const it = ITEMS[id];
    if (s.money < it.price) { setS(push(s, "Не хватает денег.")); return; }
    const inv = { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 };
    setS(push({ ...s, money: s.money - it.price, inventory: inv }, `Куплено: ${it.name} за ${it.price}₽.`));
  }

  function use(id: ItemId) {
    const it = ITEMS[id];
    if (!it.consumable || !(s.inventory[id] ?? 0)) return;
    const inv = { ...s.inventory, [id]: (s.inventory[id] ?? 0) - 1 };
    let n: GameState = {
      ...s, inventory: inv,
      energy: clamp(s.energy + (it.energy ?? 0)),
      hunger: clamp(s.hunger - (it.hunger ?? 0)),
      health: clamp(s.health + (it.health ?? 0)),
    };
    setS(push(n, `Использовано: ${it.name}.`));
  }

  function sleep(kind: "street" | "bunk" | "flat") {
    let n = { ...s };
    let restore = 0, msg = "";
    if (kind === "street") { restore = 35; msg = "Ты спал на картоне под мостом. Спина болит."; n.health = clamp(n.health - 5); }
    if (kind === "bunk") {
      if (s.money < 15) { setS(push(s, "Койка стоит 15₽, а у тебя их нет.")); return; }
      n.money -= 15; restore = 60; msg = "Ночь в ночлежке. Храп соседей, но тепло.";
    }
    if (kind === "flat") {
      if (s.housingDaysLeft <= 0) { setS(push(s, "Аренда не оплачена.")); return; }
      restore = 95; msg = "Ты выспался в своей комнате."; n.health = clamp(n.health + 8);
    }
    n = tick(n, 8);
    n.energy = clamp(n.energy + restore);
    setS(push(n, msg));
  }

  function rentFlat() {
    if (s.money < 400) { setS(push(s, "Аренда стоит 400₽ за неделю.")); return; }
    setS(push({ ...s, money: s.money - 400, housingDaysLeft: s.housingDaysLeft + 7 }, "Ты снял комнату на 7 дней."));
  }

  function reset() { setS(INITIAL); }

  if (!loaded) return <div className="panel">Загрузка...</div>;

  if (dead) {
    return (
      <div className="panel gameover">
        <h2>Игра окончена</h2>
        <p className="muted">Ты продержался {s.day} дн. и заработал {s.money}₽.</p>
        <button onClick={reset}>Начать заново</button>
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="stack">
        <div className="panel">
          <h2>Квартал · День {s.day}, {String(s.hour).padStart(2, "0")}:00</h2>
          <div className="map">
            {LOCATIONS.map((l) => (
              <button
                key={l.id}
                className={`node ${l.id === s.at ? "here" : ""}`}
                style={{ left: `${l.x}%`, top: `${l.y}%`, background: l.color }}
                onClick={() => travel(l.id)}
                title={l.desc}
              >
                {l.name}
              </button>
            ))}
            <div className="player" style={{ left: `${here.x}%`, top: `${here.y + 9}%` }} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Ты здесь: <b>{here.name}</b> — {here.desc}
            {!hasBike && " · Перемещение тратит энергию и время."}
          </p>
        </div>

        <div className="panel">
          <h2>Действия — {here.name}</h2>
          {jobs.map((j) => (
            <div className="action" key={j.id}>
              <span>
                {j.name} <span className="muted">+{j.pay}₽ · {j.hours}ч · −{j.energy} энергии
                  {j.requires ? ` · нужен ${ITEMS[j.requires].name}` : ""}{j.risk ? " · риск травмы" : ""}</span>
              </span>
              <button onClick={() => work(j.id)} disabled={s.energy < j.energy}>Работать</button>
            </div>
          ))}

          {s.at === "shop" && Object.values(ITEMS).map((it) => (
            <div className="action" key={it.id}>
              <span>{it.name} <span className="muted">{it.price}₽ — {it.desc}</span></span>
              <button onClick={() => buy(it.id)} disabled={s.money < it.price}>Купить</button>
            </div>
          ))}

          {s.at === "shelter" && (
            <>
              <div className="action"><span>Койка в ночлежке <span className="muted">15₽ · +60 энергии</span></span>
                <button onClick={() => sleep("bunk")} disabled={s.money < 15}>Спать</button></div>
              <div className="action"><span>Под мостом <span className="muted">бесплатно · +35 энергии, −5 здоровья</span></span>
                <button onClick={() => sleep("street")}>Спать</button></div>
            </>
          )}

          {s.at === "flat" && (
            <>
              <div className="action"><span>Оплатить аренду <span className="muted">400₽ за 7 дней</span></span>
                <button onClick={rentFlat} disabled={s.money < 400}>Снять</button></div>
              <div className="action"><span>Лечь спать <span className="muted">
                {s.housingDaysLeft > 0 ? `осталось дней: ${s.housingDaysLeft}` : "аренда не оплачена"}</span></span>
                <button onClick={() => sleep("flat")} disabled={s.housingDaysLeft <= 0}>Спать</button></div>
            </>
          )}

          {s.at === "square" && (
            <div className="action"><span>Отдохнуть на скамейке <span className="muted">1ч · +8 энергии</span></span>
              <button onClick={() => setS(push(tick({ ...s, energy: clamp(s.energy + 8) }, 1), "Ты посидел на скамейке."))}>Отдых</button></div>
          )}

          {jobs.length === 0 && !["shop", "shelter", "flat", "square"].includes(s.at) && (
            <p className="muted">Здесь пока нечего делать.</p>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="panel">
          <h2>Персонаж</h2>
          <div className="stats">
            <Stat label="Деньги" value={`${s.money}₽`} />
            <Stat label="Здоровье" value={Math.round(s.health)} pct={s.health} color="#ef4444" />
            <Stat label="Энергия" value={Math.round(s.energy)} pct={s.energy} color="#38bdf8" />
            <Stat label="Голод" value={Math.round(s.hunger)} pct={s.hunger} color="#f59e0b" />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Жильё: {s.housingDaysLeft > 0 ? `комната (${s.housingDaysLeft} дн.)` : "нет"} ·
            Транспорт: {hasBike ? "велосипед" : "пешком"}
          </p>
        </div>

        <div className="panel">
          <h2>Инвентарь</h2>
          {Object.entries(s.inventory).filter(([, q]) => (q ?? 0) > 0).length === 0 && <p className="muted">Пусто.</p>}
          {Object.entries(s.inventory).map(([id, q]) =>
            (q ?? 0) > 0 ? (
              <div className="action" key={id}>
                <span>{ITEMS[id as ItemId].name} <span className="muted">×{q}</span></span>
                {ITEMS[id as ItemId].consumable && <button onClick={() => use(id as ItemId)}>Использовать</button>}
              </div>
            ) : null
          )}
        </div>

        <div className="panel">
          <h2>Журнал</h2>
          <div className="log">{s.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={reset}>Новая игра</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, pct, color }: { label: string; value: string | number; pct?: number; color?: string }) {
  return (
    <div className="stat">
      <div className="label"><span>{label}</span><b>{value}</b></div>
      {pct !== undefined && <div className="bar"><i style={{ width: `${clamp(pct)}%`, background: color }} /></div>}
    </div>
  );
}
