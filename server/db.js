import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { DISTRICTS } from './config.js';

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
export const db = new DatabaseSync(new URL('../data/game.db', import.meta.url).pathname);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  pass TEXT NOT NULL,
  district_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_tick INTEGER NOT NULL,
  shield_until INTEGER NOT NULL,
  cash REAL NOT NULL, product REAL NOT NULL, ammo REAL NOT NULL,
  coins REAL NOT NULL DEFAULT 0,
  wallet TEXT,
  gang_id INTEGER,
  gang_role TEXT
);
CREATE TABLE IF NOT EXISTS buildings (
  player_id INTEGER NOT NULL, type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  PRIMARY KEY (player_id, type)
);
CREATE TABLE IF NOT EXISTS troops (
  player_id INTEGER NOT NULL, type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (player_id, type)
);
CREATE TABLE IF NOT EXISTS training (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER, type TEXT,
  count INTEGER, done_at INTEGER
);
CREATE TABLE IF NOT EXISTS marches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker_id INTEGER, defender_id INTEGER, kind TEXT,
  troops TEXT, depart_at INTEGER, arrive_at INTEGER, state TEXT,
  loot TEXT, return_at INTEGER, seed TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER, role TEXT,
  kind TEXT, created_at INTEGER, data TEXT, seen INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gangs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, tag TEXT UNIQUE,
  leader_id INTEGER, created_at INTEGER, color TEXT
);
CREATE TABLE IF NOT EXISTS district_points (
  district_id INTEGER, gang_id INTEGER, week INTEGER, points REAL,
  PRIMARY KEY (district_id, gang_id, week)
);
CREATE TABLE IF NOT EXISTS heist_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, player_id INTEGER,
  amount REAL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS heist_runs (
  day TEXT PRIMARY KEY, pot_sol REAL, settled_at INTEGER,
  winners INTEGER, rolled_over INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT, player_id INTEGER,
  wallet TEXT, amount_sol REAL, share REAL, tx TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER, item TEXT,
  price REAL, tx TEXT UNIQUE, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS inventory (
  player_id INTEGER, item TEXT, qty INTEGER DEFAULT 0, equipped INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, item)
);
CREATE TABLE IF NOT EXISTS item_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER, item TEXT, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, stream TEXT, amount REAL, unit TEXT,
  note TEXT, tx TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY, name TEXT, x INTEGER, y INTEGER, owner_gang_id INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, player_id INTEGER, created_at INTEGER
);
`);

// seed districts on a 4x3 isometric grid
const count = db.prepare('SELECT COUNT(*) c FROM districts').get().c;
if (count === 0) {
  const ins = db.prepare('INSERT INTO districts (id,name,x,y,owner_gang_id) VALUES (?,?,?,?,NULL)');
  DISTRICTS.forEach((name, i) => ins.run(i + 1, name, i % 4, Math.floor(i / 4)));
}

export const q = {
  get: (sql, ...a) => db.prepare(sql).get(...a),
  all: (sql, ...a) => db.prepare(sql).all(...a),
  run: (sql, ...a) => db.prepare(sql).run(...a),
};
