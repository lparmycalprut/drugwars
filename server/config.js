// Blueprint Wars — server-authoritative game configuration.
// All numbers here are the single source of truth. The browser only renders.

export const SEASON_START = Date.parse('2026-09-29T00:00:00Z'); // app creation date
export const SEASON_LENGTH_DAYS = 90;

export const NEW_PLAYER_SHIELD_MS = 24 * 3600 * 1000; // 24h protection
export const VICTIM_SHIELD_MS = 30 * 60 * 1000; // short shield after being raided
export const TICK_MS = 60 * 1000; // production tick = 1 minute

export const STARTING = { cash: 2000, product: 500, ammo: 500 };

export const DISTRICTS = [
  'Ashport Docks', 'Kiln Row', 'Verdigris Park', 'Old Cannery',
  'Saltmarket', 'Neon Mile', 'Dustline', 'Copper Heights',
  'Grey Terminal', 'Hollow Bridge', 'Ember Flats', 'Tin Quarter',
];

// ---------------------------------------------------------------- buildings
// production = base * level (per minute). cap = storage.
export const BUILDINGS = {
  safehouse: {
    name: 'Safehouse', max: 20, desc: 'Your HQ. Caps the level of every other building.',
    cost: (l) => ({ cash: 400 * Math.pow(1.6, l), product: 200 * Math.pow(1.6, l), ammo: 100 * Math.pow(1.6, l) }),
    time: (l) => Math.round(120 * Math.pow(1.45, l)),
  },
  lab: {
    name: 'Lab', max: 20, desc: 'Cooks Product every minute, online or offline.',
    produces: 'product', rate: (l) => 6 * l + l * l * 0.6,
    cost: (l) => ({ cash: 220 * Math.pow(1.5, l), product: 60 * Math.pow(1.5, l), ammo: 0 }),
    time: (l) => Math.round(70 * Math.pow(1.4, l)),
  },
  front: {
    name: 'Front Business', max: 20, desc: 'Launders Cash every minute.',
    produces: 'cash', rate: (l) => 8 * l + l * l * 0.7,
    cost: (l) => ({ cash: 180 * Math.pow(1.5, l), product: 90 * Math.pow(1.5, l), ammo: 0 }),
    time: (l) => Math.round(70 * Math.pow(1.4, l)),
  },
  armory: {
    name: 'Armory', max: 20, desc: 'Manufactures Ammo every minute.',
    produces: 'ammo', rate: (l) => 5 * l + l * l * 0.5,
    cost: (l) => ({ cash: 200 * Math.pow(1.5, l), product: 40 * Math.pow(1.5, l), ammo: 40 * Math.pow(1.5, l) }),
    time: (l) => Math.round(70 * Math.pow(1.4, l)),
  },
  stash: {
    name: 'Stash House', max: 20, desc: 'Hides resources from raiders. Hidden goods can never be stolen.',
    protect: (l) => Math.round(600 * Math.pow(1.45, l)),
    cost: (l) => ({ cash: 260 * Math.pow(1.55, l), product: 120 * Math.pow(1.55, l), ammo: 60 * Math.pow(1.55, l) }),
    time: (l) => Math.round(90 * Math.pow(1.42, l)),
  },
  yard: {
    name: 'Training Yard', max: 20, desc: 'Trains crew. Higher level = faster training.',
    speed: (l) => 1 + 0.12 * l,
    cost: (l) => ({ cash: 240 * Math.pow(1.55, l), product: 80 * Math.pow(1.55, l), ammo: 80 * Math.pow(1.55, l) }),
    time: (l) => Math.round(90 * Math.pow(1.42, l)),
  },
};
export const BUILDING_KEYS = Object.keys(BUILDINGS);

export const STORAGE_BASE = 5000;
export const storageCap = (safehouseLvl) => Math.round(STORAGE_BASE * Math.pow(1.5, safehouseLvl - 1));

// ------------------------------------------------------------------ troops
// speed = seconds of travel per 1 map-distance unit (lower = faster)
export const TROOPS = {
  lookout:  { name: 'Lookout',     atk: 2,  def: 4,   carry: 0,   speed: 12, scout: true,
              cost: { cash: 60,  product: 20, ammo: 10 },  trainSec: 20,
              desc: 'Scouts a target and reveals resources, crew and buildings. Never joins the fight.' },
  thug:     { name: 'Street Thug', atk: 14, def: 10,  carry: 40,  speed: 22,
              cost: { cash: 90,  product: 30, ammo: 40 },  trainSec: 30,
              desc: 'Cheap muscle. Numbers win alleys.' },
  enforcer: { name: 'Enforcer',    atk: 26, def: 34,  carry: 25,  speed: 28,
              cost: { cash: 220, product: 70, ammo: 110 }, trainSec: 70,
              desc: 'Heavy defender, slow but very hard to break.' },
  hitman:   { name: 'Hitman',      atk: 55, def: 18,  carry: 15,  speed: 16,
              cost: { cash: 400, product: 160, ammo: 220 }, trainSec: 120,
              desc: 'Glass cannon. Fast, lethal, fragile.' },
  van:      { name: 'Armored Van', atk: 4,  def: 40,  carry: 600, speed: 34,
              cost: { cash: 600, product: 240, ammo: 90 },  trainSec: 160,
              desc: 'Rolling vault. Hauls the loot home.' },
};
export const TROOP_KEYS = Object.keys(TROOPS);

// ------------------------------------------------------------------ combat
export const LOOT_RATIO = 0.5;       // max share of unprotected resources taken
export const ATTACKER_LOSS_FLOOR = 0.05;
export const WAR_POINTS_PER_POWER = 0.01;

// -------------------------------------------------------------------- shop
// Priced in project coin ($BLUEPRINT-denominated in-game coin ledger).
export const SHOP = [
  { id: 'pistol',   name: 'Chrome Pistol',    kind: 'weapon',  bonus: { atk: 0.05 }, price: 120,  daily: null, weekly: null },
  { id: 'smg',      name: 'Alley Sweeper',    kind: 'weapon',  bonus: { atk: 0.10 }, price: 320,  daily: null, weekly: null },
  { id: 'rifle',    name: 'Rooftop Rifle',    kind: 'weapon',  bonus: { atk: 0.15 }, price: 700,  daily: null, weekly: null },
  { id: 'kevlar',   name: 'Kevlar Vest',      kind: 'armor',   bonus: { def: 0.05 }, price: 120,  daily: null, weekly: null },
  { id: 'plate',    name: 'Plate Carrier',    kind: 'armor',   bonus: { def: 0.10 }, price: 320,  daily: null, weekly: null },
  { id: 'riot',     name: 'Riot Harness',     kind: 'armor',   bonus: { def: 0.15 }, price: 700,  daily: null, weekly: null },
  { id: 'trunk',    name: 'False Trunk',      kind: 'vehicle', bonus: { carry: 0.08 }, price: 150, daily: null, weekly: null },
  { id: 'truck',    name: 'Box Truck',        kind: 'vehicle', bonus: { carry: 0.15 }, price: 420, daily: null, weekly: null },
  { id: 'speed_b',  name: 'Bribe the Inspector', kind: 'speedup', target: 'building', seconds: 900, price: 90, daily: 3, weekly: null },
  { id: 'speed_t',  name: 'Overtime Pay',     kind: 'speedup', target: 'training', seconds: 900, price: 90, daily: 3, weekly: null },
  { id: 'shield_8', name: 'Payoff Shield 8h', kind: 'shield',  hours: 8,  price: 500, daily: null, weekly: 2 },
  { id: 'shield_24',name: 'Payoff Shield 24h',kind: 'shield',  hours: 24, price: 1200, daily: null, weekly: 1 },
];
// hard caps so gear can never dominate skill/activity
export const BONUS_CAP = { atk: 0.15, def: 0.15, carry: 0.15 };

// --------------------------------------------------------------- economy
// Every shop purchase: 10% buys & burns $BLUEPRINT, remainder split 50/50.
export const SHOP_SPLIT = { blueprintBurn: 0.10, coinBurn: 0.45, heistPot: 0.45 };
// Coin creator-fee revenue: 10% burn always, remaining 90% split as below.
export const FEE_SPLIT = { blueprintBurn: 0.10, creator: 0.20 * 0.9, heistPot: 0.35 * 0.9, buybackBurn: 0.35 * 0.9 };

export const HEIST = {
  maxWinners: 50,          // locked: top N depositors get paid
  maxPayoutPerRunSol: 25,  // locked hard cap per daily run
  minDeposit: 50,          // minimum Product per deposit
};

export const COIN_PER_SOL = 100000; // ledger conversion used for stats display
