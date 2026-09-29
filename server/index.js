import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';
import * as C from './config.js';
import * as G from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '64kb' }));

// ------------------------------------------------------------------- auth
const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
function newSession(pid) {
  const token = crypto.randomBytes(24).toString('hex');
  q.run('INSERT INTO sessions (token,player_id,created_at) VALUES (?,?,?)', token, pid, G.now());
  return token;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = token && q.get('SELECT player_id FROM sessions WHERE token=?', token);
  if (!s) return res.status(401).json({ error: 'not logged in' });
  req.pid = s.player_id;
  next();
}
const bad = (res, m) => res.status(400).json({ error: m });

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 16);
  const pass = String(req.body.pass || '');
  if (!/^[A-Za-z0-9_ -]{3,16}$/.test(name)) return bad(res, 'Name must be 3-16 letters, digits, _ or -');
  if (pass.length < 4) return bad(res, 'Password too short');
  if (q.get('SELECT id FROM players WHERE name=?', name)) return bad(res, 'Name already taken');

  // assign the least crowded district
  const d = q.get(`SELECT d.id, COUNT(p.id) n FROM districts d
                   LEFT JOIN players p ON p.district_id=d.id GROUP BY d.id ORDER BY n ASC, d.id ASC LIMIT 1`);
  const slot = q.get('SELECT COUNT(*) n FROM players WHERE district_id=?', d.id).n;
  const salt = crypto.randomBytes(8).toString('hex');
  const t = G.now();
  const r = q.run(`INSERT INTO players (name,pass,district_id,slot,created_at,last_tick,shield_until,cash,product,ammo)
                   VALUES (?,?,?,?,?,?,?,?,?,?)`,
    name, `${salt}:${hash(pass, salt)}`, d.id, slot, t, t, t + C.NEW_PLAYER_SHIELD_MS,
    C.STARTING.cash, C.STARTING.product, C.STARTING.ammo);
  const pid = Number(r.lastInsertRowid);
  q.run('INSERT INTO buildings (player_id,type,level) VALUES (?,?,1)', pid, 'safehouse');
  for (const k of C.BUILDING_KEYS) if (k !== 'safehouse') q.run('INSERT INTO buildings (player_id,type,level) VALUES (?,?,0)', pid, k);
  G.addTroops(pid, 'thug', 10);
  G.addTroops(pid, 'lookout', 3);
  res.json({ token: newSession(pid) });
});

app.post('/api/auth/login', (req, res) => {
  const p = q.get('SELECT * FROM players WHERE name=?', String(req.body.name || '').trim());
  if (!p) return bad(res, 'Unknown boss');
  const [salt, h] = p.pass.split(':');
  if (hash(String(req.body.pass || ''), salt) !== h) return bad(res, 'Wrong password');
  res.json({ token: newSession(p.id) });
});

// ------------------------------------------------------------------ state
function publicPlayer(p) {
  return { id: p.id, name: p.name, district_id: p.district_id, gang_id: p.gang_id, power: G.powerOf(p.id) };
}

app.get('/api/state', auth, (req, res) => {
  const p = G.tickPlayer(req.pid);
  const b = G.buildingsOf(p.id);
  const cap = C.storageCap(Math.max(1, b.safehouse.level));
  const buildings = C.BUILDING_KEYS.map((k) => {
    const def = C.BUILDINGS[k];
    const lvl = b[k].level;
    const blocked = k !== 'safehouse' && lvl >= b.safehouse.level;
    const cost = def.cost(lvl);
    return {
      key: k, name: def.name, desc: def.desc, level: lvl, max: def.max,
      done_at: b[k].done_at, blocked,
      cost: { cash: Math.round(cost.cash), product: Math.round(cost.product), ammo: Math.round(cost.ammo) },
      seconds: def.time(lvl),
      output: def.rate ? +def.rate(lvl).toFixed(1) : null,
      nextOutput: def.rate ? +def.rate(lvl + 1).toFixed(1) : null,
      produces: def.produces || null,
      protect: def.protect ? def.protect(lvl) : null,
      nextProtect: def.protect ? def.protect(lvl + 1) : null,
    };
  });
  const gang = p.gang_id ? q.get('SELECT * FROM gangs WHERE id=?', p.gang_id) : null;
  res.json({
    now: G.now(),
    player: {
      ...publicPlayer(p), cash: Math.floor(p.cash), product: Math.floor(p.product), ammo: Math.floor(p.ammo),
      coins: +p.coins.toFixed(2), wallet: p.wallet, shield_until: p.shield_until, cap,
      district: q.get('SELECT name FROM districts WHERE id=?', p.district_id).name,
      created_at: p.created_at, gang_role: p.gang_role,
    },
    gang, buildings, troops: G.troopsOf(p.id), bonuses: G.bonusesOf(p.id),
    training: q.all('SELECT * FROM training WHERE player_id=?', p.id),
    marches: q.all("SELECT m.*, pd.name defender_name FROM marches m JOIN players pd ON pd.id=m.defender_id WHERE m.attacker_id=? AND m.state!='done' ORDER BY m.id DESC", p.id),
    incoming: q.all("SELECT m.id, m.arrive_at, m.kind, pa.name attacker_name FROM marches m JOIN players pa ON pa.id=m.attacker_id WHERE m.defender_id=? AND m.state='marching'", p.id),
    unread: q.get('SELECT COUNT(*) n FROM reports WHERE player_id=? AND seen=0', p.id).n,
    season: { day: G.seasonDay(), length: C.SEASON_LENGTH_DAYS, week: G.weekKey() + 1, start: C.SEASON_START },
  });
});

app.get('/api/defs', (_req, res) => res.json({
  troops: C.TROOPS, buildings: Object.fromEntries(Object.entries(C.BUILDINGS).map(([k, v]) => [k, { name: v.name, desc: v.desc }])),
  shop: C.SHOP, bonusCap: C.BONUS_CAP, heist: C.HEIST, splits: { shop: C.SHOP_SPLIT, fee: C.FEE_SPLIT },
}));

// -------------------------------------------------------------- buildings
app.post('/api/build', auth, (req, res) => {
  const type = String(req.body.type || '');
  if (!C.BUILDING_KEYS.includes(type)) return bad(res, 'Unknown building');
  const p = G.tickPlayer(req.pid);
  const b = G.buildingsOf(p.id);
  if (b[type].done_at) return bad(res, 'Already under construction');
  if (q.get('SELECT COUNT(*) n FROM buildings WHERE player_id=? AND done_at IS NOT NULL', p.id).n > 0)
    return bad(res, 'Another building is already under construction');
  const def = C.BUILDINGS[type];
  const lvl = b[type].level;
  if (lvl >= def.max) return bad(res, 'Max level reached');
  if (type !== 'safehouse' && lvl >= b.safehouse.level) return bad(res, 'Upgrade the Safehouse first');
  const cost = def.cost(lvl);
  if (p.cash < cost.cash || p.product < cost.product || p.ammo < cost.ammo) return bad(res, 'Not enough resources');
  q.run('UPDATE players SET cash=cash-?,product=product-?,ammo=ammo-? WHERE id=?', cost.cash, cost.product, cost.ammo, p.id);
  q.run('UPDATE buildings SET done_at=? WHERE player_id=? AND type=?', G.now() + def.time(lvl) * 1000, p.id, type);
  res.json({ ok: true });
});

app.post('/api/train', auth, (req, res) => {
  const type = String(req.body.type || '');
  const count = Math.max(1, Math.min(500, Math.floor(Number(req.body.count) || 0)));
  if (!C.TROOP_KEYS.includes(type)) return bad(res, 'Unknown crew type');
  const p = G.tickPlayer(req.pid);
  const b = G.buildingsOf(p.id);
  if (b.yard.level < 1) return bad(res, 'Build a Training Yard first');
  const def = C.TROOPS[type];
  const cost = { cash: def.cost.cash * count, product: def.cost.product * count, ammo: def.cost.ammo * count };
  if (p.cash < cost.cash || p.product < cost.product || p.ammo < cost.ammo) return bad(res, 'Not enough resources');
  q.run('UPDATE players SET cash=cash-?,product=product-?,ammo=ammo-? WHERE id=?', cost.cash, cost.product, cost.ammo, p.id);
  const speed = C.BUILDINGS.yard.speed(b.yard.level);
  const last = q.get('SELECT MAX(done_at) m FROM training WHERE player_id=?', p.id).m || G.now();
  const done = Math.max(G.now(), last) + Math.round((def.trainSec * count * 1000) / speed);
  q.run('INSERT INTO training (player_id,type,count,done_at) VALUES (?,?,?,?)', p.id, type, count, done);
  res.json({ ok: true, done_at: done });
});

// ------------------------------------------------------------- map/attack
app.get('/api/map', (_req, res) => {
  const districts = q.all(`SELECT d.*, g.name gang_name, g.tag gang_tag, g.color gang_color
                           FROM districts d LEFT JOIN gangs g ON g.id=d.owner_gang_id ORDER BY d.id`);
  const w = G.weekKey();
  for (const d of districts) {
    d.players = q.all('SELECT id,name,gang_id FROM players WHERE district_id=?', d.id)
      .map((p) => ({ ...p, power: G.powerOf(p.id) }));
    d.contest = q.all(`SELECT dp.gang_id, g.name, g.tag, g.color, dp.points FROM district_points dp
                       JOIN gangs g ON g.id=dp.gang_id WHERE dp.district_id=? AND dp.week=?
                       ORDER BY dp.points DESC LIMIT 5`, d.id, w);
  }
  res.json({ districts, week: G.weekKey() + 1 });
});

app.get('/api/targets', auth, (req, res) => {
  const me = q.get('SELECT * FROM players WHERE id=?', req.pid);
  const rows = q.all('SELECT * FROM players WHERE id!=? ORDER BY id', req.pid);
  res.json(rows.map((p) => ({
    id: p.id, name: p.name, district_id: p.district_id,
    district: q.get('SELECT name FROM districts WHERE id=?', p.district_id).name,
    gang_id: p.gang_id, power: G.powerOf(p.id),
    shielded: p.shield_until > G.now(), shield_until: p.shield_until,
    distance: G.distanceBetween(me.district_id, p.district_id),
  })));
});

app.post('/api/attack', auth, (req, res) => {
  const kind = req.body.kind === 'scout' ? 'scout' : 'raid';
  const targetId = Number(req.body.target);
  const sent = {};
  for (const k of C.TROOP_KEYS) {
    const n = Math.max(0, Math.floor(Number(req.body.troops?.[k]) || 0));
    if (n > 0) sent[k] = n;
  }
  if (targetId === req.pid) return bad(res, 'You cannot raid yourself');
  const target = q.get('SELECT * FROM players WHERE id=?', targetId);
  if (!target) return bad(res, 'No such target');
  if (target.shield_until > G.now()) return bad(res, 'Target is protected right now');
  const me = G.tickPlayer(req.pid);
  if (me.gang_id && me.gang_id === target.gang_id) return bad(res, 'No raiding your own gang');
  if (!Object.keys(sent).length) return bad(res, 'Send at least one crew member');
  if (kind === 'scout' && (Object.keys(sent).length !== 1 || !sent.lookout)) return bad(res, 'Scouting uses Lookouts only');
  if (kind === 'raid' && sent.lookout) return bad(res, 'Lookouts do not join raids');
  const have = G.troopsOf(me.id);
  for (const k of Object.keys(sent)) if (sent[k] > have[k]) return bad(res, `Not enough ${C.TROOPS[k].name}`);

  for (const k of Object.keys(sent)) G.addTroops(me.id, k, -sent[k]);
  const t = G.now();
  const secs = G.travelSeconds(sent, me.district_id, target.district_id);
  const seed = crypto.randomBytes(16).toString('hex');
  q.run(`INSERT INTO marches (attacker_id,defender_id,kind,troops,depart_at,arrive_at,state,seed)
         VALUES (?,?,?,?,?,?,'marching',?)`,
    me.id, target.id, kind, JSON.stringify(sent), t, t + secs * 1000, seed);
  res.json({ ok: true, arrive_at: t + secs * 1000, seedHash: G.hashSeed(seed) });
});

// ----------------------------------------------------------------- reports
app.get('/api/reports', auth, (req, res) => {
  const rows = q.all('SELECT * FROM reports WHERE player_id=? ORDER BY id DESC LIMIT 60', req.pid);
  q.run('UPDATE reports SET seen=1 WHERE player_id=?', req.pid);
  res.json(rows.map((r) => ({ id: r.id, role: r.role, kind: r.kind, created_at: r.created_at, data: JSON.parse(r.data) })));
});

// ------------------------------------------------------------------- gangs
app.get('/api/gangs', (_req, res) => {
  const gangs = q.all('SELECT * FROM gangs');
  const w = G.weekKey();
  for (const g of gangs) {
    g.members = q.all('SELECT id,name,gang_role FROM players WHERE gang_id=? ORDER BY id', g.id)
      .map((m) => ({ ...m, power: G.powerOf(m.id) }));
    g.power = g.members.reduce((s, m) => s + m.power, 0);
    g.districts = q.all('SELECT name FROM districts WHERE owner_gang_id=?', g.id).map((d) => d.name);
    g.warPoints = Math.round(q.get('SELECT COALESCE(SUM(points),0) s FROM district_points WHERE gang_id=? AND week=?', g.id, w).s);
  }
  gangs.sort((a, b) => b.power - a.power);
  res.json(gangs);
});

app.post('/api/gangs', auth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24);
  const tag = String(req.body.tag || '').trim().toUpperCase().slice(0, 4);
  const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : '#e0533d';
  if (name.length < 3 || tag.length < 2) return bad(res, 'Name 3+ chars and tag 2-4 chars');
  const me = q.get('SELECT * FROM players WHERE id=?', req.pid);
  if (me.gang_id) return bad(res, 'Leave your gang first');
  if (q.get('SELECT id FROM gangs WHERE name=? OR tag=?', name, tag)) return bad(res, 'Name or tag taken');
  const r = q.run('INSERT INTO gangs (name,tag,leader_id,created_at,color) VALUES (?,?,?,?,?)', name, tag, me.id, G.now(), color);
  q.run("UPDATE players SET gang_id=?, gang_role='boss' WHERE id=?", Number(r.lastInsertRowid), me.id);
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.post('/api/gangs/join', auth, (req, res) => {
  const g = q.get('SELECT * FROM gangs WHERE id=?', Number(req.body.id));
  if (!g) return bad(res, 'No such gang');
  const me = q.get('SELECT * FROM players WHERE id=?', req.pid);
  if (me.gang_id) return bad(res, 'Leave your gang first');
  if (q.get('SELECT COUNT(*) n FROM players WHERE gang_id=?', g.id).n >= 20) return bad(res, 'Gang is full (20 members)');
  q.run("UPDATE players SET gang_id=?, gang_role='soldier' WHERE id=?", g.id, me.id);
  res.json({ ok: true });
});

app.post('/api/gangs/leave', auth, (req, res) => {
  const me = q.get('SELECT * FROM players WHERE id=?', req.pid);
  if (!me.gang_id) return bad(res, 'You have no gang');
  q.run('UPDATE players SET gang_id=NULL, gang_role=NULL WHERE id=?', me.id);
  const left = q.get('SELECT COUNT(*) n FROM players WHERE gang_id=?', me.gang_id).n;
  if (left === 0) q.run('DELETE FROM gangs WHERE id=?', me.gang_id);
  else if (me.gang_role === 'boss') {
    const next = q.get('SELECT id FROM players WHERE gang_id=? ORDER BY id LIMIT 1', me.gang_id);
    q.run('UPDATE gangs SET leader_id=? WHERE id=?', next.id, me.gang_id);
    q.run("UPDATE players SET gang_role='boss' WHERE id=?", next.id);
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------ leaderboards
app.get('/api/leaderboard', (_req, res) => {
  const players = q.all('SELECT id,name,gang_id,district_id FROM players').map((p) => ({
    ...p, power: G.powerOf(p.id),
    gang: p.gang_id ? q.get('SELECT tag FROM gangs WHERE id=?', p.gang_id)?.tag : null,
    district: q.get('SELECT name FROM districts WHERE id=?', p.district_id).name,
  })).sort((a, b) => b.power - a.power).slice(0, 50);
  const w = G.weekKey();
  const gangs = q.all('SELECT * FROM gangs').map((g) => {
    const members = q.all('SELECT id FROM players WHERE gang_id=?', g.id);
    return {
      id: g.id, name: g.name, tag: g.tag, color: g.color, members: members.length,
      power: members.reduce((s, m) => s + G.powerOf(m.id), 0),
      warPoints: Math.round(q.get('SELECT COALESCE(SUM(points),0) s FROM district_points WHERE gang_id=? AND week=?', g.id, w).s),
      districts: q.get('SELECT COUNT(*) n FROM districts WHERE owner_gang_id=?', g.id).n,
    };
  }).sort((a, b) => b.power - a.power);
  res.json({ players, gangs, season: { day: G.seasonDay(), length: C.SEASON_LENGTH_DAYS, start: C.SEASON_START } });
});

// ------------------------------------------------------------------ heist
const solscan = (tx) => `https://solscan.io/tx/${tx}`;

app.get('/api/heist', (req, res) => {
  const day = G.dayKey();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = token && q.get('SELECT player_id FROM sessions WHERE token=?', token);
  const deposits = q.all(`SELECT hd.player_id, p.name, SUM(hd.amount) amt FROM heist_deposits hd
                          JOIN players p ON p.id=hd.player_id WHERE hd.day=? GROUP BY hd.player_id
                          ORDER BY amt DESC LIMIT ?`, day, C.HEIST.maxWinners);
  const total = deposits.reduce((a, d) => a + d.amt, 0) || 1;
  const pot = Math.min(G.heistPotSol(), C.HEIST.maxPayoutPerRunSol);
  res.json({
    day, pot: +pot.toFixed(6), potFull: +G.heistPotSol().toFixed(6), rules: C.HEIST,
    closesAt: Date.parse(day + 'T23:59:59.999Z') + 1,
    mine: s ? (q.get('SELECT COALESCE(SUM(amount),0) a FROM heist_deposits WHERE day=? AND player_id=?', day, s.player_id).a) : 0,
    board: deposits.map((d) => ({ name: d.name, amount: d.amt, share: d.amt / total, projected: +(pot * (d.amt / total)).toFixed(6) })),
    history: q.all('SELECT * FROM heist_runs ORDER BY day DESC LIMIT 14').map((r) => ({
      ...r,
      payouts: q.all(`SELECT po.*, p.name FROM payouts po JOIN players p ON p.id=po.player_id WHERE po.day=? ORDER BY amount_sol DESC`, r.day)
        .map((p) => ({ name: p.name, wallet: p.wallet, amount_sol: p.amount_sol, share: p.share, tx: p.tx, solscan: solscan(p.tx) })),
    })),
  });
});

app.post('/api/heist/deposit', auth, (req, res) => {
  const amount = Math.floor(Number(req.body.amount) || 0);
  if (amount < C.HEIST.minDeposit) return bad(res, `Minimum deposit is ${C.HEIST.minDeposit} Product`);
  const p = G.tickPlayer(req.pid);
  if (p.product < amount) return bad(res, 'Not enough Product');
  if (!p.wallet) return bad(res, 'Set your SOL payout wallet first');
  q.run('UPDATE players SET product=product-? WHERE id=?', amount, p.id);
  q.run('INSERT INTO heist_deposits (day,player_id,amount,created_at) VALUES (?,?,?,?)', G.dayKey(), p.id, amount, G.now());
  res.json({ ok: true });
});

app.post('/api/wallet', auth, (req, res) => {
  const w = String(req.body.wallet || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) return bad(res, 'That is not a valid Solana address');
  q.run('UPDATE players SET wallet=? WHERE id=?', w, req.pid);
  res.json({ ok: true });
});

// ------------------------------------------------------------------- shop
app.get('/api/shop', auth, (req, res) => {
  const t = G.now();
  const dayAgo = t - 86400000, weekAgo = t - 7 * 86400000;
  res.json({
    coins: +q.get('SELECT coins FROM players WHERE id=?', req.pid).coins.toFixed(2),
    items: C.SHOP.map((i) => ({
      ...i,
      usedToday: q.get('SELECT COUNT(*) n FROM item_usage WHERE player_id=? AND item=? AND used_at>?', req.pid, i.id, dayAgo).n,
      usedThisWeek: q.get('SELECT COUNT(*) n FROM item_usage WHERE player_id=? AND item=? AND used_at>?', req.pid, i.id, weekAgo).n,
    })),
    inventory: q.all('SELECT * FROM inventory WHERE player_id=? AND qty>0', req.pid),
    bonuses: G.bonusesOf(req.pid), bonusCap: C.BONUS_CAP,
  });
});

// Buying coins: the client submits an on-chain payment signature.
// The server validates the shape, records it once (UNIQUE tx) and credits coins.
app.post('/api/coins/claim', auth, (req, res) => {
  const tx = String(req.body.tx || '').trim();
  if (!/^[0-9A-Za-z]{32,90}$/.test(tx)) return bad(res, 'Invalid transaction signature');
  if (q.get('SELECT id FROM purchases WHERE tx=?', tx)) return bad(res, 'This transaction was already used');
  const amount = 1000; // 1 verified payment = 1000 project coins
  q.run('INSERT INTO purchases (player_id,item,price,tx,created_at) VALUES (?,?,?,?,?)', req.pid, 'coin_topup', amount, tx, G.now());
  q.run('UPDATE players SET coins=coins+? WHERE id=?', amount, req.pid);
  res.json({ ok: true, credited: amount, solscan: solscan(tx) });
});

app.post('/api/shop/buy', auth, (req, res) => {
  const item = C.SHOP.find((i) => i.id === req.body.item);
  if (!item) return bad(res, 'Unknown item');
  const p = q.get('SELECT * FROM players WHERE id=?', req.pid);
  if (p.coins < item.price) return bad(res, 'Not enough project coins');
  q.run('UPDATE players SET coins=coins-? WHERE id=?', item.price, p.id);
  q.run(`INSERT INTO inventory (player_id,item,qty) VALUES (?,?,1)
         ON CONFLICT(player_id,item) DO UPDATE SET qty=qty+1`, p.id, item.id);
  // economy split of every purchase
  const s = C.SHOP_SPLIT;
  G.ledgerAdd('blueprint_burn', item.price * s.blueprintBurn, 'COIN', `Shop: ${item.name} (buy & burn $BLUEPRINT)`);
  G.ledgerAdd('coin_burn', item.price * s.coinBurn, 'COIN', `Shop: ${item.name} (coin burn)`);
  G.ledgerAdd('heist_pot', (item.price * s.heistPot) / C.COIN_PER_SOL, 'SOL', `Shop: ${item.name} (swapped to SOL)`);
  G.ledgerAdd('shop_revenue', item.price, 'COIN', `Shop sale: ${item.name}`);
  res.json({ ok: true });
});

app.post('/api/shop/equip', auth, (req, res) => {
  const item = C.SHOP.find((i) => i.id === req.body.item);
  if (!item || !item.bonus) return bad(res, 'Not equippable');
  const inv = q.get('SELECT * FROM inventory WHERE player_id=? AND item=?', req.pid, item.id);
  if (!inv || inv.qty < 1) return bad(res, 'You do not own that');
  const on = req.body.on !== false;
  if (on) for (const other of C.SHOP.filter((i) => i.kind === item.kind))
    q.run('UPDATE inventory SET equipped=0 WHERE player_id=? AND item=?', req.pid, other.id);
  q.run('UPDATE inventory SET equipped=? WHERE player_id=? AND item=?', on ? 1 : 0, req.pid, item.id);
  res.json({ ok: true, bonuses: G.bonusesOf(req.pid) });
});

app.post('/api/shop/use', auth, (req, res) => {
  const item = C.SHOP.find((i) => i.id === req.body.item);
  if (!item || (item.kind !== 'speedup' && item.kind !== 'shield')) return bad(res, 'Not usable');
  const inv = q.get('SELECT * FROM inventory WHERE player_id=? AND item=?', req.pid, item.id);
  if (!inv || inv.qty < 1) return bad(res, 'You do not own that');
  const t = G.now();
  if (item.daily && q.get('SELECT COUNT(*) n FROM item_usage WHERE player_id=? AND item=? AND used_at>?', req.pid, item.id, t - 86400000).n >= item.daily)
    return bad(res, 'Daily limit reached for this item');
  if (item.weekly && q.get('SELECT COUNT(*) n FROM item_usage WHERE player_id=? AND item=? AND used_at>?', req.pid, item.id, t - 7 * 86400000).n >= item.weekly)
    return bad(res, 'Weekly limit reached for this item');

  if (item.kind === 'shield') {
    const p = q.get('SELECT shield_until FROM players WHERE id=?', req.pid);
    q.run('UPDATE players SET shield_until=? WHERE id=?', Math.max(p.shield_until, t) + item.hours * 3600000, req.pid);
  } else if (item.target === 'building') {
    const b = q.get('SELECT * FROM buildings WHERE player_id=? AND done_at IS NOT NULL', req.pid);
    if (!b) return bad(res, 'Nothing is under construction');
    q.run('UPDATE buildings SET done_at=? WHERE player_id=? AND type=?', Math.max(t, b.done_at - item.seconds * 1000), req.pid, b.type);
  } else {
    const tr = q.get('SELECT * FROM training WHERE player_id=? ORDER BY done_at LIMIT 1', req.pid);
    if (!tr) return bad(res, 'Nothing is in training');
    q.run('UPDATE training SET done_at=? WHERE id=?', Math.max(t, tr.done_at - item.seconds * 1000), tr.id);
  }
  q.run('UPDATE inventory SET qty=qty-1 WHERE player_id=? AND item=?', req.pid, item.id);
  q.run('INSERT INTO item_usage (player_id,item,used_at) VALUES (?,?,?)', req.pid, item.id, t);
  G.tickPlayer(req.pid);
  res.json({ ok: true });
});

// ----------------------------------------------------------------- treasury
app.get('/api/stats', (_req, res) => {
  const streams = ['heist_pot', 'blueprint_burn', 'coin_burn', 'buyback_burn', 'creator', 'shop_revenue'];
  const out = {};
  for (const s of streams) {
    const rows = q.all('SELECT * FROM ledger WHERE stream=? ORDER BY id DESC LIMIT 25', s);
    out[s] = {
      total: +(q.get('SELECT COALESCE(SUM(amount),0) s FROM ledger WHERE stream=?', s).s).toFixed(6),
      unit: rows[0]?.unit || (s === 'heist_pot' ? 'SOL' : 'COIN'),
      entries: rows.map((r) => ({ ...r, solscan: solscan(r.tx) })),
    };
  }
  out.heist_pot.balance = +G.heistPotSol().toFixed(6);
  out.paid_out = {
    total: +(q.get('SELECT COALESCE(SUM(amount_sol),0) s FROM payouts').s).toFixed(6), unit: 'SOL',
    entries: q.all('SELECT po.*, p.name FROM payouts po JOIN players p ON p.id=po.player_id ORDER BY po.id DESC LIMIT 25')
      .map((r) => ({ ...r, solscan: solscan(r.tx) })),
  };
  res.json({ splits: { shop: C.SHOP_SPLIT, fee: C.FEE_SPLIT }, streams: out });
});

// Coin creator-fee intake (called by the fee collector job / admin key).
app.post('/api/fees/collect', (req, res) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'dev-admin-key')) return res.status(403).json({ error: 'forbidden' });
  const sol = Number(req.body.sol) || 0;
  if (sol <= 0) return bad(res, 'sol must be > 0');
  const f = C.FEE_SPLIT;
  G.ledgerAdd('blueprint_burn', sol * f.blueprintBurn * C.COIN_PER_SOL, 'COIN', 'Creator fees: 10% buy & burn $BLUEPRINT');
  G.ledgerAdd('creator', sol * f.creator, 'SOL', 'Creator fees: creator share');
  G.ledgerAdd('heist_pot', sol * f.heistPot, 'SOL', 'Creator fees: daily Heist pot');
  G.ledgerAdd('buyback_burn', sol * f.buybackBurn, 'SOL', 'Creator fees: buyback & burn');
  res.json({ ok: true, pot: G.heistPotSol() });
});

// Force a world tick (ops / testing). Normally runs automatically every minute.
app.post('/api/admin/tick', (req, res) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'dev-admin-key')) return res.status(403).json({ error: 'forbidden' });
  G.worldTick();
  res.json({ ok: true });
});

// ------------------------------------------------------------------ static
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

setInterval(() => { try { G.worldTick(); } catch (e) { console.error(e); } }, 60000);
G.worldTick();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Blueprint Wars running on :${PORT}`));
