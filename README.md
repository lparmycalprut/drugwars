# Blueprint Wars

A fictional syndicate-war strategy game inspired by classic browser wars games, with its own world, names and art. Mobile-first PWA (installable to the home screen), English UI, **fully server-authoritative** — the browser only renders, it never decides anything.

```bash
npm install
npm start          # http://localhost:3000
```

Node 22+ (uses the built-in `node:sqlite`). Data lives in `data/game.db` (gitignored).

## Core loop
- Register → you get a Safehouse in the least crowded district and **24h new-player protection**.
- Three resources: **Cash, Product, Ammo**, produced every minute by buildings, including while offline (accrual is computed from `last_tick` server-side).
- Buildings: **Safehouse** (HQ, caps every other building's level), **Lab** (Product), **Front Business** (Cash), **Armory** (Ammo), **Stash House** (hides resources from raiders), **Training Yard** (trains crew, faster at higher level). Upgrades cost resources and real time; one build at a time.
- Crew: **Lookout** (scout only), **Street Thug**, **Enforcer**, **Hitman**, **Armored Van** — each with attack, defence, carry capacity and speed.
- Raids: pick a target on the isometric map or from the target list, send crew, wait out travel time (distance × slowest unit). The server resolves the battle; the loser loses troops, the winner hauls loot limited by surviving carry capacity and by the victim's Stash House. Both sides get a war report and the victim gets a short shield.
- **Provably fair combat:** each march gets a random `seed`. Every roll is `sha256(seed | index)` and the report publishes the seed, its hash and the exact rolls, so anybody can recompute the outcome.
- Gangs: create or join (max 20 members), member list and total power. Each district is held weekly by the gang with the most war points there.
- Player and gang leaderboards. The season counts from the app creation date (`SEASON_START` in `server/config.js`).

Signature visual: a code-drawn **isometric city map**, districts tinted with the ruling gang's colour, tappable for details.

## Daily Heist (real-money layer)
- Players deposit **Product** into the current UTC day's Heist (payout wallet required).
- At **00:00 UTC** the pot pays out in SOL pro-rata to depositors. Locked rules in `config.js`: `maxWinners`, `maxPayoutPerRunSol`, `minDeposit`.
- Every payout is recorded with a transaction reference and a Solscan link.
- A day with **no depositors rolls its pot over** to the next day (recorded for transparency).

## Shop (project coin)
Weapons (+atk), vests (+def), vehicles (+carry), building/training speedups (daily limit) and protection shields (weekly limit). All gear bonuses are **hard-capped** (+15% atk / +15% def / +15% carry) so it is never pay-to-win.

Every purchase splits: **10% buys & burns $BLUEPRINT**, remainder 50/50 → half coin burn, half swapped to SOL into the Heist pot.
Coin creator-fee revenue: **10% $BLUEPRINT burn always**, remaining 90% → creator 20%, daily Heist pot 35%, buyback & burn 35% (all editable in `server/config.js` before build).

Payments are verified server-side and each transaction signature is accepted exactly once (`purchases.tx` is UNIQUE); items land in inventory immediately.

## Stats page
Every money stream (Heist pot, payouts, buyback & burn, $BLUEPRINT burn, coin burn, creator, shop revenue) has its own balance, lifetime total and history with Solscan links.

## Art
Buildings, crew, items, icons and the city map are drawn in code as SVG (`public/art.js`) for one consistent style. Only two generated bitmaps exist: `public/img/boss.png` (title screen) and `public/img/icon.png` (app icon). No external service keys required.

## API (server-authoritative)
`/api/auth/*`, `/api/state`, `/api/build`, `/api/train`, `/api/map`, `/api/targets`, `/api/attack`, `/api/reports`, `/api/gangs*`, `/api/leaderboard`, `/api/heist*`, `/api/wallet`, `/api/shop*`, `/api/coins/claim`, `/api/stats`.
Ops endpoints require `x-admin-key` (env `ADMIN_KEY`): `/api/fees/collect` (feeds the treasury split), `/api/admin/tick` (force a world tick).

## Notes on the on-chain layer
The game logic, ledger, splits, deposit accounting and payout schedule are fully implemented. Transaction signatures are recorded per payout/purchase and rendered as Solscan links; wire `/api/fees/collect` to your fee collector and the payout writer to your signing service to go live. No third-party keys are needed to run or play the game itself.

*Fiction only. Gangs, districts, "Product" and the Heist are game mechanics — no real substances, people or places.*
