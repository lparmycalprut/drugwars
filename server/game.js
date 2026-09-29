import crypto from 'node:crypto';
import { q, db } from './db.js';
import * as C from './config.js';

export const now = () => Date.now();
export const dayKey = (t = now()) => new Date(t).toISOString().slice(0, 10);
export const weekKey = (t = now()) => Math.floor((t - C.SEASON_START) / (7 * 86400000));
export const seasonDay = (t = now()) => Math.floor((t - C.SEASON_START) / 86400000) + 1;

// ------------------------------------------------- verifiable randomness
// Every battle publishes: seed (server reveal), hash, and the derived rolls.
// Anyone can recompute sha256(seed|index) and verify the exact same numbers.
export function rollStream(seed) {
  let i = 0;
  return () => {
    const h = crypto.createHash('sha256').update(`${seed}|${i++}`).digest();
    return h.readUInt32BE(0) / 0x100000000;
  };
}
export const hashSeed = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------- accessors
export function buildingsOf(pid) {
  const rows = q.all('SELECT type, level, done_at FROM buildings WHERE player_id=?', pid);
  const map = {};
  for (const k of C.BUILDING_KEYS) map[k] = { level: 0, done_at: null };
  for (const r of rows) map[r.type] = { level: r.level, done_at: r.done_at };
  return map;
}
export function troopsOf(pid) {
  const rows = q.all('SELECT type, count FROM troops WHERE player_id=?', pid);
  const map = {};
  for (const k of C.TROOP_KEYS) map[k] = 0;
  for (const r of rows) map[r.type] = r.count;
  return map;
}
export function addTroops(pid, type, n) {
  q.run(`INSERT INTO troops (player_id,type,count) VALUES (?,?,?)
         ON CONFLICT(player_id,type) DO UPDATE SET count = count + ?`, pid, type, n, n);
}
export function bonusesOf(pid) {
  const rows = q.all('SELECT item, qty, equipped FROM inventory WHERE player_id=? AND equipped=1', pid);
  const b = { atk: 0, def: 0, carry: 0 };
  for (const r of rows) {
    const it = C.SHOP.find((s) => s.id === r.item);
    if (!it || !it.bonus) continue;
    for (const k of Object.keys(it.bonus)) b[k] += it.bonus[k];
  }
  for (const k of Object.keys(b)) b[k] = Math.min(b[k], C.BONUS_CAP[k]); // anti pay-to-win cap
  return b;
}

// -------------------------------------------------------------- production
export function tickPlayer(pid) {
  const p = q.get('SELECT * FROM players WHERE id=?', pid);
  if (!p) return null;
  const t = now();

  // finish buildings / training first so their output counts
  q.run('UPDATE buildings SET done_at=NULL, level=level+1 WHERE player_id=? AND done_at IS NOT NULL AND done_at<=?', pid, t);
  for (const tr of q.all('SELECT * FROM training WHERE player_id=? AND done_at<=?', pid, t)) {
    addTroops(pid, tr.type, tr.count);
    q.run('DELETE FROM training WHERE id=?', tr.id);
  }

  const b = buildingsOf(pid);
  const mins = Math.max(0, (t - p.last_tick) / 60000);
  if (mins > 0) {
    const cap = C.storageCap(Math.max(1, b.safehouse.level));
    const add = (cur, amt) => Math.min(cap, cur + amt);
    const cash = add(p.cash, b.front.level ? C.BUILDINGS.front.rate(b.front.level) * mins : 0);
    const product = add(p.product, b.lab.level ? C.BUILDINGS.lab.rate(b.lab.level) * mins : 0);
    const ammo = add(p.ammo, b.armory.level ? C.BUILDINGS.armory.rate(b.armory.level) * mins : 0);
    q.run('UPDATE players SET cash=?,product=?,ammo=?,last_tick=? WHERE id=?', cash, product, ammo, t, pid);
  }
  return q.get('SELECT * FROM players WHERE id=?', pid);
}

export function powerOf(pid) {
  const tr = troopsOf(pid);
  let p = 0;
  for (const k of C.TROOP_KEYS) p += tr[k] * (C.TROOPS[k].atk + C.TROOPS[k].def);
  const b = buildingsOf(pid);
  for (const k of C.BUILDING_KEYS) p += b[k].level * 25;
  return Math.round(p);
}

export function distanceBetween(d1, d2) {
  const a = q.get('SELECT x,y FROM districts WHERE id=?', d1);
  const b = q.get('SELECT x,y FROM districts WHERE id=?', d2);
  if (!a || !b) return 3;
  return Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 2 + 1));
}

export function travelSeconds(troops, from, to) {
  const dist = distanceBetween(from, to);
  let slowest = 10;
  for (const k of Object.keys(troops)) if (troops[k] > 0) slowest = Math.max(slowest, C.TROOPS[k].speed);
  return Math.max(30, Math.round(slowest * dist));
}

// ------------------------------------------------------------------ combat
export function resolveMarch(m) {
  const t = now();
  const troops = JSON.parse(m.troops);
  const attacker = tickPlayer(m.attacker_id);
  const defender = tickPlayer(m.defender_id);
  if (!attacker || !defender) { q.run('UPDATE marches SET state=? WHERE id=?', 'cancelled', m.id); return; }

  const seed = m.seed;
  const rnd = rollStream(seed);

  if (m.kind === 'scout') {
    const db_ = buildingsOf(defender.id);
    const dt = troopsOf(defender.id);
    const accuracy = Math.min(1, 0.55 + 0.1 * (troops.lookout || 0));
    const fuzz = (v) => Math.round(v * (1 - (1 - accuracy) * (rnd() * 2 - 1)));
    const data = {
      kind: 'scout', seed, seedHash: hashSeed(seed), accuracy,
      target: { name: defender.name, district: defender.district_id },
      resources: { cash: fuzz(defender.cash), product: fuzz(defender.product), ammo: fuzz(defender.ammo) },
      troops: Object.fromEntries(Object.entries(dt).map(([k, v]) => [k, fuzz(v)])),
      buildings: Object.fromEntries(Object.entries(db_).map(([k, v]) => [k, v.level])),
      protectedResources: db_.stash.level ? C.BUILDINGS.stash.protect(db_.stash.level) : 0,
    };
    report(attacker.id, 'attacker', 'scout', data);
    report(defender.id, 'defender', 'scouted', { kind: 'scouted', seed, by: attacker.name, at: t });
    q.run('UPDATE marches SET state=?, return_at=? WHERE id=?', 'returning',
      t + (m.arrive_at - m.depart_at), m.id);
    return;
  }

  // power calculation
  const ab = bonusesOf(attacker.id);
  const db2 = bonusesOf(defender.id);
  let atk = 0, carry = 0;
  for (const k of Object.keys(troops)) {
    atk += troops[k] * C.TROOPS[k].atk;
    carry += troops[k] * C.TROOPS[k].carry;
  }
  atk *= 1 + ab.atk;
  carry = Math.round(carry * (1 + ab.carry));

  const dTroops = troopsOf(defender.id);
  const dBuild = buildingsOf(defender.id);
  let def = 0;
  for (const k of C.TROOP_KEYS) def += dTroops[k] * C.TROOPS[k].def;
  def *= 1 + db2.def;
  def += dBuild.safehouse.level * 40; // home ground bonus

  const aRoll = 0.85 + rnd() * 0.3;
  const dRoll = 0.85 + rnd() * 0.3;
  const aPower = atk * aRoll;
  const dPower = def * dRoll + 25;
  const win = aPower > dPower;
  const ratio = aPower / (aPower + dPower);

  // casualties
  const aLossRate = Math.min(0.95, Math.max(C.ATTACKER_LOSS_FLOOR, 1 - ratio) * (win ? 0.75 : 1.15));
  const dLossRate = Math.min(0.95, Math.max(0.05, ratio) * (win ? 1.1 : 0.7));
  const aLost = {}, dLost = {};
  const survivors = {};
  for (const k of Object.keys(troops)) {
    const lost = Math.min(troops[k], Math.round(troops[k] * aLossRate));
    aLost[k] = lost; survivors[k] = troops[k] - lost;
  }
  for (const k of C.TROOP_KEYS) {
    const lost = Math.min(dTroops[k], Math.round(dTroops[k] * dLossRate));
    if (lost > 0) { dLost[k] = lost; addTroops(defender.id, k, -lost); }
  }

  // loot (only unprotected resources, limited by surviving carry capacity)
  const loot = { cash: 0, product: 0, ammo: 0 };
  if (win) {
    let cap = 0;
    for (const k of Object.keys(survivors)) cap += survivors[k] * C.TROOPS[k].carry;
    cap = Math.round(cap * (1 + ab.carry));
    const shield = dBuild.stash.level ? C.BUILDINGS.stash.protect(dBuild.stash.level) : 0;
    const pool = {
      cash: Math.max(0, defender.cash - shield),
      product: Math.max(0, defender.product - shield),
      ammo: Math.max(0, defender.ammo - shield),
    };
    const stealable = ['cash', 'product', 'ammo'].map((k) => [k, pool[k] * C.LOOT_RATIO]);
    const total = stealable.reduce((s, [, v]) => s + v, 0);
    if (total > 0) {
      const take = Math.min(cap, total);
      for (const [k, v] of stealable) loot[k] = Math.floor(take * (v / total));
      q.run('UPDATE players SET cash=cash-?, product=product-?, ammo=ammo-? WHERE id=?',
        loot.cash, loot.product, loot.ammo, defender.id);
    }
    // victim shield
    q.run('UPDATE players SET shield_until=MAX(shield_until,?) WHERE id=?', t + C.VICTIM_SHIELD_MS, defender.id);
  }

  // war points for district control
  const gained = Math.round((win ? aPower : aPower * 0.3) * C.WAR_POINTS_PER_POWER);
  awardWarPoints(attacker.gang_id, defender.district_id, gained);
  if (!win) awardWarPoints(defender.gang_id, defender.district_id, Math.round(dPower * C.WAR_POINTS_PER_POWER));

  const data = {
    kind: 'battle', at: t, win, seed, seedHash: hashSeed(seed),
    rolls: { attackerRoll: +aRoll.toFixed(4), defenderRoll: +dRoll.toFixed(4) },
    attacker: { name: attacker.name, power: Math.round(atk), effective: Math.round(aPower), sent: troops, lost: aLost },
    defender: { name: defender.name, power: Math.round(def), effective: Math.round(dPower), army: dTroops, lost: dLost },
    loot, warPoints: gained, district: defender.district_id,
  };
  report(attacker.id, 'attacker', 'battle', data);
  report(defender.id, 'defender', 'battle', data);

  const back = m.arrive_at - m.depart_at;
  const anySurvivor = Object.values(survivors).some((v) => v > 0);
  if (anySurvivor) {
    q.run('UPDATE marches SET state=?, loot=?, troops=?, return_at=? WHERE id=?',
      'returning', JSON.stringify(loot), JSON.stringify(survivors), t + back, m.id);
  } else {
    q.run('UPDATE marches SET state=?, loot=?, troops=? WHERE id=?', 'done', JSON.stringify(loot), JSON.stringify(survivors), m.id);
  }
}

export function report(pid, role, kind, data) {
  q.run('INSERT INTO reports (player_id,role,kind,created_at,data) VALUES (?,?,?,?,?)',
    pid, role, kind, now(), JSON.stringify(data));
}

export function awardWarPoints(gangId, districtId, points) {
  if (!gangId || points <= 0) return;
  const w = weekKey();
  q.run(`INSERT INTO district_points (district_id,gang_id,week,points) VALUES (?,?,?,?)
         ON CONFLICT(district_id,gang_id,week) DO UPDATE SET points = points + ?`,
    districtId, gangId, w, points, points);
}

export function refreshDistrictOwners() {
  const w = weekKey();
  for (const d of q.all('SELECT id FROM districts')) {
    const top = q.get(
      'SELECT gang_id, points FROM district_points WHERE district_id=? AND week=? ORDER BY points DESC LIMIT 1', d.id, w);
    q.run('UPDATE districts SET owner_gang_id=? WHERE id=?', top ? top.gang_id : null, d.id);
  }
}

// -------------------------------------------------------------- world tick
export function worldTick() {
  const t = now();
  for (const m of q.all("SELECT * FROM marches WHERE state='marching' AND arrive_at<=?", t)) resolveMarch(m);
  for (const m of q.all("SELECT * FROM marches WHERE state='returning' AND return_at<=?", t)) {
    const troops = JSON.parse(m.troops);
    for (const k of Object.keys(troops)) if (troops[k] > 0) addTroops(m.attacker_id, k, troops[k]);
    const loot = m.loot ? JSON.parse(m.loot) : { cash: 0, product: 0, ammo: 0 };
    tickPlayer(m.attacker_id);
    const p = q.get('SELECT * FROM players WHERE id=?', m.attacker_id);
    const b = buildingsOf(m.attacker_id);
    const cap = C.storageCap(Math.max(1, b.safehouse.level));
    q.run('UPDATE players SET cash=?,product=?,ammo=? WHERE id=?',
      Math.min(cap, p.cash + loot.cash), Math.min(cap, p.product + loot.product),
      Math.min(cap, p.ammo + loot.ammo), m.attacker_id);
    q.run("UPDATE marches SET state='done' WHERE id=?", m.id);
  }
  for (const p of q.all('SELECT id FROM players')) tickPlayer(p.id);
  refreshDistrictOwners();
  settleHeistIfDue();
}

// ------------------------------------------------------------- daily heist
export function heistPotSol() {
  const row = q.get("SELECT COALESCE(SUM(amount),0) s FROM ledger WHERE stream='heist_pot' AND unit='SOL'");
  const paid = q.get('SELECT COALESCE(SUM(amount_sol),0) s FROM payouts').s;
  return Math.max(0, row.s - paid);
}

function fakeTx(label) {
  return crypto.createHash('sha256').update(label + now() + Math.random()).digest('hex').slice(0, 64);
}

export function settleHeistIfDue() {
  // settles any UTC day that has already ended and is not yet settled
  const today = dayKey();
  const days = q.all('SELECT DISTINCT day FROM heist_deposits WHERE day < ?', today);
  for (const { day } of days) {
    if (q.get('SELECT day FROM heist_runs WHERE day=?', day)) continue;
    settleDay(day);
  }
  // a day with no depositors rolls the pot forward (recorded for transparency)
  const yesterday = dayKey(now() - 86400000);
  if (!q.get('SELECT day FROM heist_runs WHERE day=?', yesterday)
      && !q.get('SELECT 1 x FROM heist_deposits WHERE day=? LIMIT 1', yesterday)) {
    q.run('INSERT INTO heist_runs (day,pot_sol,settled_at,winners,rolled_over) VALUES (?,?,?,?,1)',
      yesterday, heistPotSol(), now(), 0);
  }
}

export function settleDay(day) {
  const deposits = q.all(
    'SELECT player_id, SUM(amount) amt FROM heist_deposits WHERE day=? GROUP BY player_id ORDER BY amt DESC LIMIT ?',
    day, C.HEIST.maxWinners);
  const pot = Math.min(heistPotSol(), C.HEIST.maxPayoutPerRunSol);
  if (!deposits.length || pot <= 0) {
    q.run('INSERT OR REPLACE INTO heist_runs (day,pot_sol,settled_at,winners,rolled_over) VALUES (?,?,?,?,1)',
      day, heistPotSol(), now(), 0);
    return;
  }
  const total = deposits.reduce((s, d) => s + d.amt, 0);
  for (const d of deposits) {
    const share = d.amt / total;
    const amount = +(pot * share).toFixed(6);
    const pl = q.get('SELECT wallet FROM players WHERE id=?', d.player_id);
    q.run('INSERT INTO payouts (day,player_id,wallet,amount_sol,share,tx,created_at) VALUES (?,?,?,?,?,?,?)',
      day, d.player_id, pl?.wallet || null, amount, share, fakeTx('payout' + day + d.player_id), now());
  }
  q.run('INSERT OR REPLACE INTO heist_runs (day,pot_sol,settled_at,winners,rolled_over) VALUES (?,?,?,?,0)',
    day, pot, now(), deposits.length);
}

export function ledgerAdd(stream, amount, unit, note, tx) {
  q.run('INSERT INTO ledger (stream,amount,unit,note,tx,created_at) VALUES (?,?,?,?,?,?)',
    stream, amount, unit, note, tx || fakeTx(stream), now());
}
export { fakeTx };
