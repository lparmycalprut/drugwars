import { BuildingArt, TroopArt, ItemArt, Icon, cityMap, esc } from './art.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app'), nav = $('#nav');
let S = { token: localStorage.getItem('bw_token') || null, state: null, defs: null, tab: 'base', map: null, sel: null };

// ------------------------------------------------------------------ helpers
async function api(path, body, method) {
  const res = await fetch('/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const n = (v) => Math.floor(v).toLocaleString('en-US');
function dur(ms) {
  if (ms <= 0) return 'ready';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${ss}s`;
  return `${ss}s`;
}
function sheet(html) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="sheet"><div class="grabber"></div>${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
  return el;
}
const closeSheets = () => document.querySelectorAll('.modal').forEach((m) => m.remove());

// --------------------------------------------------------------------- auth
function authView(mode = 'login') {
  nav.classList.add('hidden');
  app.innerHTML = `
  <div class="view">
    <div class="hero"><img src="/img/boss.png" alt="Syndicate boss">
      <div class="cap"><h1>BLUEPRINT WARS</h1>
        <div class="dim small">Fictional syndicate strategy. Claim a district, build your operation, raid rivals, rule the city.</div>
      </div></div>
    <div class="card">
      <div class="row" style="gap:6px;margin-bottom:6px">
        <button class="btn sm grow ${mode === 'login' ? 'primary' : ''}" data-m="login">Log in</button>
        <button class="btn sm grow ${mode === 'register' ? 'primary' : ''}" data-m="register">New boss</button>
      </div>
      <label>Boss name</label><input id="u" maxlength="16" autocomplete="username">
      <label>Password</label><input id="p" type="password" autocomplete="current-password">
      <button class="btn primary" id="go" style="width:100%;margin-top:12px">${mode === 'login' ? 'Enter the city' : 'Start your syndicate'}</button>
      <div class="small dim" style="margin-top:10px">New bosses get a free Safehouse, starting resources and <b>24 hours of protection</b> from raids.</div>
    </div>
    <div class="card small dim">All fictional. No real substances, people or places. Everything is simulated economy inside the game.</div>
  </div>`;
  app.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => authView(b.dataset.m));
  $('#go').onclick = async () => {
    try {
      const r = await api('/auth/' + mode, { name: $('#u').value, pass: $('#p').value });
      S.token = r.token; localStorage.setItem('bw_token', r.token);
      await boot();
    } catch (e) { toast(e.message, true); }
  };
}

// --------------------------------------------------------------------- boot
async function boot() {
  try {
    S.defs = await api('/defs');
    S.state = await api('/state');
  } catch (e) {
    S.token = null; localStorage.removeItem('bw_token');
    return authView('login');
  }
  nav.classList.remove('hidden');
  renderNav();
  render();
}

const TABS = [
  ['base', 'Base', '🏚'], ['map', 'City', '🗺'], ['war', 'War', '⚔'],
  ['gang', 'Gang', '👥'], ['heist', 'Heist', '💰'], ['shop', 'Shop', '🛒'], ['stats', 'Stats', '📊'],
];
function renderNav() {
  nav.innerHTML = TABS.map(([id, label, g]) =>
    `<button data-t="${id}" class="${S.tab === id ? 'on' : ''}"><span class="glyph">${g}</span>${label}${
      id === 'war' && S.state?.unread ? `<span class="badge">${S.state.unread}</span>` : ''}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.onclick = () => { S.tab = b.dataset.t; closeSheets(); render(); });
}

function topbar() {
  const p = S.state.player;
  const shield = p.shield_until > Date.now();
  return `<div class="top">
    <div class="res">
      <div class="r">${Icon.cash()}<span>${n(p.cash)}</span></div>
      <div class="r">${Icon.product()}<span>${n(p.product)}</span></div>
      <div class="r">${Icon.ammo()}<span>${n(p.ammo)}</span></div>
      <div class="r">${Icon.coin()}<span>${n(p.coins)}</span></div>
    </div>
    <div class="whoami">
      <div>${esc(p.name)} · ${esc(p.district)} · Power ${n(p.power)}</div>
      <div>${shield ? `<span class="shield">🛡 ${dur(p.shield_until - Date.now())}</span>` : 'Season day ' + S.state.season.day}</div>
    </div>
  </div>`;
}

async function refresh(silent) {
  try { S.state = await api('/state'); if (!silent) render(); renderNav(); } catch (e) { /* ignore */ }
}

function render() {
  const views = { base: baseView, map: mapView, war: warView, gang: gangView, heist: heistView, shop: shopView, stats: statsView };
  app.innerHTML = topbar() + `<div class="view" id="v">Loading…</div>`;
  renderNav();
  views[S.tab]();
}

// --------------------------------------------------------------------- base
function baseView() {
  const st = S.state;
  const bq = st.buildings.find((b) => b.done_at);
  $('#v').innerHTML = `
  ${bq ? `<div class="card tight row"><div class="grow"><b>Building ${esc(bq.name)} → L${bq.level + 1}</b>
      <div class="small dim" data-cd="${bq.done_at}">${dur(bq.done_at - Date.now())} left</div></div>
      <button class="btn sm" id="rush">Rush</button></div>` : ''}
  ${st.training.length ? `<div class="card tight"><b>Training</b>${st.training.map((t) =>
      `<div class="row spread small"><span>${t.count}× ${S.defs.troops[t.type].name}</span>
       <span class="dim" data-cd="${t.done_at}">${dur(t.done_at - Date.now())}</span></div>`).join('')}</div>` : ''}
  ${st.incoming.length ? `<div class="card tight" style="border-color:var(--red)"><b class="lose">Incoming!</b>${st.incoming.map((m) =>
      `<div class="row spread small"><span>${esc(m.attacker_name)} (${m.kind})</span><span data-cd="${m.arrive_at}">${dur(m.arrive_at - Date.now())}</span></div>`).join('')}</div>` : ''}

  <div class="card"><div class="row spread"><h2>Your compound</h2>
    <span class="tag">Storage cap ${n(st.player.cap)}</span></div>
    <div class="list">${st.buildings.map(buildingRow).join('')}</div></div>

  <div class="card"><h2>Crew</h2>
    <div class="list">${Object.keys(S.defs.troops).map(troopRow).join('')}</div></div>`;

  $('#v').querySelectorAll('[data-build]').forEach((b) => b.onclick = async () => {
    try { await api('/build', { type: b.dataset.build }); toast('Construction started'); await refresh(); }
    catch (e) { toast(e.message, true); }
  });
  $('#v').querySelectorAll('[data-train]').forEach((b) => b.onclick = () => trainSheet(b.dataset.train));
  const rush = $('#rush'); if (rush) rush.onclick = () => useItem('speed_b');
  startClocks();
}

function buildingRow(b) {
  const art = BuildingArt[b.key](b.level);
  const info = b.produces ? `${b.output}/min → <b class="win">${b.nextOutput}/min</b>`
    : b.protect !== null ? `protects ${n(b.protect)} → <b class="win">${n(b.nextProtect)}</b>`
    : b.key === 'yard' ? 'training speed'
    : 'caps every other building';
  return `<div class="row">
    <div class="thumb">${art}</div>
    <div class="grow">
      <div class="row spread"><b>${esc(b.name)} <span class="dim">L${b.level}</span></b>
        <span class="small dim">${dur(b.seconds * 1000)}</span></div>
      <div class="small dim">${info}</div>
      <div class="small">${Icon.cash()}${n(b.cost.cash)} ${Icon.product()}${n(b.cost.product)} ${Icon.ammo()}${n(b.cost.ammo)}</div>
    </div>
    <button class="btn sm ${b.blocked || b.done_at ? '' : 'primary'}" data-build="${b.key}"
      ${b.done_at || b.blocked || b.level >= b.max ? 'disabled' : ''}>${
        b.level >= b.max ? 'MAX' : b.blocked ? 'Locked' : b.done_at ? '…' : 'Up'}</button>
  </div>`;
}

function troopRow(k) {
  const t = S.defs.troops[k];
  return `<div class="row">
    <div class="thumb sm">${TroopArt[k]()}</div>
    <div class="grow"><div class="row spread"><b>${esc(t.name)}</b><span class="tag">${n(S.state.troops[k] || 0)} ready</span></div>
      <div class="small dim">${esc(t.desc)}</div>
      <div class="small dim">atk ${t.atk} · def ${t.def} · carry ${t.carry} · ${t.speed}s/hex</div></div>
    <button class="btn sm" data-train="${k}">Train</button></div>`;
}

function trainSheet(k) {
  const t = S.defs.troops[k];
  const el = sheet(`<div class="row"><div class="thumb">${TroopArt[k]()}</div>
    <div class="grow"><h2>${esc(t.name)}</h2><div class="small dim">${esc(t.desc)}</div></div></div>
    <label>How many?</label><input id="cnt" type="number" value="10" min="1" max="500">
    <div class="small dim" id="cost" style="margin-top:8px"></div>
    <button class="btn primary" id="do" style="width:100%;margin-top:12px">Start training</button>`);
  const upd = () => {
    const c = Math.max(1, Math.min(500, +$('#cnt', el).value || 1));
    $('#cost', el).innerHTML = `Cost: ${Icon.cash()}${n(t.cost.cash * c)} ${Icon.product()}${n(t.cost.product * c)} ${Icon.ammo()}${n(t.cost.ammo * c)}`;
  };
  $('#cnt', el).oninput = upd; upd();
  $('#do', el).onclick = async () => {
    try { await api('/train', { type: k, count: +$('#cnt', el).value }); el.remove(); toast('Training queued'); await refresh(); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------------------------------------------------------------------- map
async function mapView() {
  S.map = await api('/map');
  $('#v').innerHTML = `<div class="card tight"><div class="row spread"><h2>City of Ashport</h2>
      <span class="tag">Week ${S.map.week}</span></div>
      <div class="small dim">Each district is held by the gang with the most war points this week. Tap a district.</div></div>
    <div class="mapwrap">${cityMap(S.map.districts, S.sel)}</div>
    <div id="dinfo"></div>`;
  $('#v').querySelectorAll('.tile').forEach((t) => t.onclick = () => { S.sel = +t.dataset.id; mapView(); });
  if (S.sel) {
    const d = S.map.districts.find((x) => x.id === S.sel);
    $('#dinfo').innerHTML = `<div class="card"><div class="row spread"><h2>${esc(d.name)}</h2>
      <span class="tag" style="color:${d.gang_color || 'inherit'}">${d.gang_name ? esc(d.gang_name) : 'Unclaimed'}</span></div>
      <h3 style="margin-top:8px">War points this week</h3>
      ${d.contest.length ? d.contest.map((c) => `<div class="row spread small"><span style="color:${c.color}">[${esc(c.tag)}] ${esc(c.name)}</span><b>${n(c.points)}</b></div>`).join('')
        : '<div class="small dim">No raids here yet this week.</div>'}
      <h3 style="margin-top:10px">Bosses here</h3>
      ${d.players.map((p) => `<div class="row spread small"><span>${esc(p.name)}</span>
        <span class="dim">power ${n(p.power)} ${p.id !== S.state.player.id ? `<button class="btn sm" data-atk="${p.id}">Raid</button>` : ''}</span></div>`).join('')}</div>`;
    $('#dinfo').querySelectorAll('[data-atk]').forEach((b) => b.onclick = () => attackSheet(+b.dataset.atk));
  }
}

// --------------------------------------------------------------------- war
async function warView() {
  const [targets, reports] = await Promise.all([api('/targets'), api('/reports')]);
  $('#v').innerHTML = `
    ${S.state.marches.length ? `<div class="card tight"><h3>Crews on the move</h3>${S.state.marches.map((m) => {
      const t = m.state === 'marching' ? m.arrive_at : m.return_at;
      return `<div class="row spread small"><span>${m.state === 'marching' ? '→' : '←'} ${esc(m.defender_name)} <span class="tag">${m.kind}</span></span>
        <span class="dim" data-cd="${t}">${dur(t - Date.now())}</span></div>`; }).join('')}</div>` : ''}
    <div class="card"><h2>Targets</h2>
      <div class="list">${targets.map((t) => `<div class="row spread">
        <div class="grow"><b>${esc(t.name)}</b> ${t.shielded ? '<span class="tag shield">🛡 shielded</span>' : ''}
          <div class="small dim">${esc(t.district)} · power ${n(t.power)} · distance ${t.distance}</div></div>
        <button class="btn sm" data-atk="${t.id}" ${t.shielded ? 'disabled' : ''}>Send</button></div>`).join('')
        || '<div class="dim small">No rivals yet — invite a friend.</div>'}</div>
    <div class="card"><h2>War reports</h2>
      <div class="list">${reports.map(reportRow).join('') || '<div class="dim small">No reports yet.</div>'}</div></div>`;
  $('#v').querySelectorAll('[data-atk]').forEach((b) => b.onclick = () => attackSheet(+b.dataset.atk));
  $('#v').querySelectorAll('[data-rep]').forEach((b) => b.onclick = () => reportSheet(JSON.parse(b.dataset.rep)));
  S.state.unread = 0; renderNav(); startClocks();
}

function reportRow(r) {
  const d = r.data;
  let title = '', sub = '';
  if (r.kind === 'battle') {
    const won = r.role === 'attacker' ? d.win : !d.win;
    title = `<b class="${won ? 'win' : 'lose'}">${won ? 'Victory' : 'Defeat'}</b> — ${r.role === 'attacker' ? 'raid on ' + esc(d.defender.name) : 'raided by ' + esc(d.attacker.name)}`;
    sub = `loot ${n(d.loot.cash)}💵 ${n(d.loot.product)}📦 ${n(d.loot.ammo)}🔫 · war pts ${d.warPoints}`;
  } else if (r.kind === 'scout') {
    title = `<b>Scout report</b> — ${esc(d.target.name)}`;
    sub = `accuracy ${(d.accuracy * 100) | 0}%`;
  } else {
    title = `<b>You were scouted</b> by ${esc(d.by)}`;
  }
  return `<div class="row spread" data-rep='${JSON.stringify(r).replace(/'/g, '&#39;')}'>
    <div class="grow">${title}<div class="small dim">${sub} · ${new Date(r.created_at).toLocaleString()}</div></div>
    <span class="dim">›</span></div>`;
}

function reportSheet(r) {
  const d = r.data;
  let body = '';
  if (r.kind === 'battle') {
    const side = (s, lost) => `<table><tr><th>Unit</th><th>Sent</th><th>Lost</th></tr>${
      Object.keys(s).filter((k) => s[k]).map((k) => `<tr><td>${S.defs.troops[k].name}</td><td>${n(s[k])}</td><td class="lose">${n(lost[k] || 0)}</td></tr>`).join('')}</table>`;
    body = `<h2 class="${d.win ? 'win' : 'lose'}">${d.win ? 'Attacker won' : 'Defender held'}</h2>
      <div class="grid2"><div class="card tight"><b>${esc(d.attacker.name)}</b><div class="small dim">power ${n(d.attacker.power)} → roll ${d.rolls.attackerRoll} → ${n(d.attacker.effective)}</div>${side(d.attacker.sent, d.attacker.lost)}</div>
      <div class="card tight"><b>${esc(d.defender.name)}</b><div class="small dim">power ${n(d.defender.power)} → roll ${d.rolls.defenderRoll} → ${n(d.defender.effective)}</div>${side(d.defender.army, d.defender.lost)}</div></div>
      <div class="card tight"><b>Loot hauled</b><div>${Icon.cash()}${n(d.loot.cash)} ${Icon.product()}${n(d.loot.product)} ${Icon.ammo()}${n(d.loot.ammo)}</div></div>
      <div class="card tight"><b>Provably fair</b><div class="small dim">Rolls come from sha256(seed | index). Anyone can recompute them.</div>
        <div class="mono">seed: ${d.seed}</div><div class="mono">sha256(seed): ${d.seedHash}</div></div>`;
  } else if (r.kind === 'scout') {
    body = `<h2>Scout report — ${esc(d.target.name)}</h2>
      <div class="card tight"><b>Resources (±)</b><div>${Icon.cash()}${n(d.resources.cash)} ${Icon.product()}${n(d.resources.product)} ${Icon.ammo()}${n(d.resources.ammo)}</div>
        <div class="small dim">Stash House hides ${n(d.protectedResources)} of each.</div></div>
      <div class="card tight"><b>Crew</b><table>${Object.keys(d.troops).map((k) => `<tr><td>${S.defs.troops[k].name}</td><td>${n(d.troops[k])}</td></tr>`).join('')}</table></div>
      <div class="card tight"><b>Buildings</b><table>${Object.keys(d.buildings).map((k) => `<tr><td>${S.defs.buildings[k].name}</td><td>L${d.buildings[k]}</td></tr>`).join('')}</table></div>
      <div class="mono">seed: ${d.seed}</div>`;
  } else {
    body = `<h2>You were scouted</h2><div class="small dim">${esc(d.by)} sent Lookouts over your turf.</div>`;
  }
  sheet(body);
}

function attackSheet(targetId) {
  const troops = S.state.troops;
  const el = sheet(`<h2>Send crew</h2>
    <div class="row" style="gap:6px;margin:8px 0">
      <button class="btn sm grow primary" data-kind="raid">Raid</button>
      <button class="btn sm grow" data-kind="scout">Scout</button></div>
    <div id="units" class="list"></div>
    <div class="small dim" id="sum" style="margin-top:8px"></div>
    <button class="btn primary" id="send" style="width:100%;margin-top:10px">Move out</button>`);
  let kind = 'raid';
  const draw = () => {
    el.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('primary', b.dataset.kind === kind));
    const keys = kind === 'scout' ? ['lookout'] : Object.keys(S.defs.troops).filter((k) => k !== 'lookout');
    $('#units', el).innerHTML = keys.map((k) => `<div class="row">
      <div class="thumb sm">${TroopArt[k]()}</div>
      <div class="grow"><b>${S.defs.troops[k].name}</b><div class="small dim">have ${n(troops[k] || 0)} · atk ${S.defs.troops[k].atk} · carry ${S.defs.troops[k].carry}</div></div>
      <input style="width:84px" type="number" min="0" max="${troops[k] || 0}" value="0" data-u="${k}"></div>`).join('');
    $('#units', el).querySelectorAll('input').forEach((i) => i.oninput = sum);
    sum();
  };
  function sum() {
    let atk = 0, carry = 0;
    $('#units', el).querySelectorAll('input').forEach((i) => {
      const t = S.defs.troops[i.dataset.u], v = +i.value || 0;
      atk += t.atk * v; carry += t.carry * v;
    });
    $('#sum', el).textContent = `Attack ${n(atk)} · carry capacity ${n(carry)} (gear bonus +${Math.round(S.state.bonuses.atk * 100)}% atk / +${Math.round(S.state.bonuses.carry * 100)}% carry)`;
  }
  el.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { kind = b.dataset.kind; draw(); });
  draw();
  $('#send', el).onclick = async () => {
    const t = {};
    $('#units', el).querySelectorAll('input').forEach((i) => { if (+i.value > 0) t[i.dataset.u] = +i.value; });
    try {
      const r = await api('/attack', { target: targetId, kind, troops: t });
      el.remove(); toast(`Crew moving out — arrives in ${dur(r.arrive_at - Date.now())}`); await refresh();
    } catch (e) { toast(e.message, true); }
  };
}

// -------------------------------------------------------------------- gang
async function gangView() {
  const gangs = await api('/gangs');
  const mine = S.state.gang;
  $('#v').innerHTML = `
    ${mine ? `<div class="card"><div class="row spread"><h2 style="color:${mine.color}">[${esc(mine.tag)}] ${esc(mine.name)}</h2>
        <button class="btn sm danger" id="leave">Leave</button></div>
      ${(() => { const g = gangs.find((x) => x.id === mine.id); return `
        <div class="row wrap small dim"><span class="tag">${g.members.length}/20 members</span>
        <span class="tag">power ${n(g.power)}</span><span class="tag">war pts ${n(g.warPoints)}</span>
        <span class="tag">districts ${g.districts.length}</span></div>
        <table><tr><th>Member</th><th>Role</th><th>Power</th></tr>${g.members.map((m) =>
          `<tr><td>${esc(m.name)}</td><td class="dim">${m.gang_role}</td><td>${n(m.power)}</td></tr>`).join('')}</table>`; })()}
      </div>`
    : `<div class="card"><h2>Start a gang</h2>
        <label>Name</label><input id="gn" maxlength="24"><label>Tag (2-4)</label><input id="gt" maxlength="4">
        <label>Colour on the map</label><input id="gc" type="color" value="#e0533d" style="height:44px">
        <button class="btn primary" id="create" style="width:100%;margin-top:10px">Found gang</button></div>`}
    <div class="card"><h2>All gangs</h2><div class="list">${gangs.map((g) => `<div class="row spread">
      <div class="grow"><b style="color:${g.color}">[${esc(g.tag)}] ${esc(g.name)}</b>
        <div class="small dim">${g.members.length}/20 · power ${n(g.power)} · war pts ${n(g.warPoints)} · ${g.districts.length} districts</div></div>
      ${!mine && g.members.length < 20 ? `<button class="btn sm" data-join="${g.id}">Join</button>` : ''}</div>`).join('')
      || '<div class="dim small">No gangs yet. Found the first one.</div>'}</div>
    <div class="card"><h2>Leaderboards</h2><div id="lb" class="dim small">Loading…</div></div>`;

  const c = $('#create'); if (c) c.onclick = async () => {
    try { await api('/gangs', { name: $('#gn').value, tag: $('#gt').value, color: $('#gc').value }); await refresh(true); gangView(); }
    catch (e) { toast(e.message, true); }
  };
  const l = $('#leave'); if (l) l.onclick = async () => { await api('/gangs/leave', {}); await refresh(true); gangView(); };
  $('#v').querySelectorAll('[data-join]').forEach((b) => b.onclick = async () => {
    try { await api('/gangs/join', { id: +b.dataset.join }); await refresh(true); gangView(); } catch (e) { toast(e.message, true); }
  });
  const lb = await api('/leaderboard');
  $('#lb').innerHTML = `<h3>Bosses</h3><table><tr><th>#</th><th>Boss</th><th>District</th><th>Power</th></tr>
    ${lb.players.map((p, i) => `<tr><td>${i + 1}</td><td>${p.gang ? `<span class="dim">[${esc(p.gang)}]</span> ` : ''}${esc(p.name)}</td><td class="dim">${esc(p.district)}</td><td>${n(p.power)}</td></tr>`).join('')}</table>
    <h3 style="margin-top:10px">Gangs</h3><table><tr><th>#</th><th>Gang</th><th>Members</th><th>War pts</th><th>Power</th></tr>
    ${lb.gangs.map((g, i) => `<tr><td>${i + 1}</td><td style="color:${g.color}">[${esc(g.tag)}] ${esc(g.name)}</td><td>${g.members}</td><td>${n(g.warPoints)}</td><td>${n(g.power)}</td></tr>`).join('')}</table>
    <div class="small dim" style="margin-top:8px">Season day ${lb.season.day} of ${lb.season.length} · started ${new Date(lb.season.start).toDateString()}</div>`;
}

// -------------------------------------------------------------------- heist
async function heistView() {
  const h = await api('/heist');
  $('#v').innerHTML = `
    <div class="card"><div class="row spread"><h2>Daily Heist</h2><span class="tag">${h.day} UTC</span></div>
      <div class="row spread" style="margin-top:6px"><div><div class="small dim">Pot paid at midnight UTC</div>
        <b style="font-size:24px">${h.pot.toFixed(4)} SOL</b></div>
        <div class="small dim" style="text-align:right">closes in<br><b data-cd="${h.closesAt}">${dur(h.closesAt - Date.now())}</b></div></div>
      <div class="small dim" style="margin-top:8px">Deposit Product into today's run. At 00:00 UTC the pot is split by deposit share across the top ${h.rules.maxWinners} depositors (hard cap ${h.rules.maxPayoutPerRunSol} SOL per run). A day with no depositors rolls its pot into tomorrow.</div>
    </div>
    <div class="card"><h3>Your payout wallet</h3>
      <input id="w" placeholder="Solana address" value="${S.state.player.wallet || ''}">
      <button class="btn sm" id="savew" style="margin-top:8px">Save wallet</button></div>
    <div class="card"><h3>Deposit Product</h3>
      <div class="small dim">You hold ${n(S.state.player.product)} · already deposited today ${n(h.mine)}</div>
      <input id="amt" type="number" min="${h.rules.minDeposit}" value="${h.rules.minDeposit}" style="margin-top:8px">
      <button class="btn primary" id="dep" style="width:100%;margin-top:8px">Deposit into the Heist</button></div>
    <div class="card"><h3>Today's board</h3><table><tr><th>Boss</th><th>Product</th><th>Share</th><th>Projected</th></tr>
      ${h.board.map((b) => `<tr><td>${esc(b.name)}</td><td>${n(b.amount)}</td><td>${(b.share * 100).toFixed(1)}%</td><td>${b.projected.toFixed(4)} ◎</td></tr>`).join('')
      || '<tr><td colspan="4" class="dim">No deposits yet today.</td></tr>'}</table></div>
    <div class="card"><h3>Past runs</h3>${h.history.map((r) => `<div class="card tight">
      <div class="row spread"><b>${r.day}</b><span class="tag">${r.rolled_over ? 'rolled over' : r.pot_sol.toFixed(4) + ' SOL · ' + r.winners + ' winners'}</span></div>
      ${r.payouts.map((p) => `<div class="row spread small"><span>${esc(p.name)} · ${(p.share * 100).toFixed(1)}%</span>
        <span>${p.amount_sol.toFixed(4)} ◎ <a href="${p.solscan}" target="_blank" rel="noopener">Solscan</a></span></div>`).join('')}
      </div>`).join('') || '<div class="dim small">No settled runs yet.</div>'}</div>`;
  $('#savew').onclick = async () => {
    try { await api('/wallet', { wallet: $('#w').value }); toast('Wallet saved'); await refresh(true); } catch (e) { toast(e.message, true); }
  };
  $('#dep').onclick = async () => {
    try { await api('/heist/deposit', { amount: +$('#amt').value }); toast('Deposited'); await refresh(true); heistView(); }
    catch (e) { toast(e.message, true); }
  };
  startClocks();
}

// --------------------------------------------------------------------- shop
async function shopView() {
  const s = await api('/shop');
  const cap = s.bonusCap;
  $('#v').innerHTML = `
    <div class="card"><div class="row spread"><h2>Black Market</h2><span class="tag">${Icon.coin()} ${n(s.coins)} coins</span></div>
      <div class="small dim">Priced in project coin. Every purchase: 10% buys &amp; burns $BLUEPRINT, the rest splits 50/50 between coin burn and SOL into the daily Heist pot.</div>
      <div class="small dim" style="margin-top:6px">Gear bonuses are hard-capped at +${cap.atk * 100}% attack, +${cap.def * 100}% defence, +${cap.carry * 100}% carry — gear helps, it never decides.</div>
      <button class="btn sm" id="topup" style="margin-top:8px">Top up coins with a payment</button></div>
    <div class="card"><h3>Active bonuses</h3><div class="small">atk +${(s.bonuses.atk * 100).toFixed(0)}% · def +${(s.bonuses.def * 100).toFixed(0)}% · carry +${(s.bonuses.carry * 100).toFixed(0)}%</div></div>
    <div class="card"><h3>Items</h3><div class="list">${s.items.map((i) => {
      const inv = s.inventory.find((x) => x.item === i.id);
      const limit = i.daily ? `${i.usedToday}/${i.daily} used today` : i.weekly ? `${i.usedThisWeek}/${i.weekly} used this week` : '';
      const eff = i.bonus ? Object.entries(i.bonus).map(([k, v]) => `+${v * 100}% ${k}`).join(', ')
        : i.kind === 'speedup' ? `-${i.seconds / 60} min ${i.target}` : `${i.hours}h protection`;
      return `<div class="row"><div class="thumb sm">${ItemArt[i.kind]()}</div>
        <div class="grow"><div class="row spread"><b>${esc(i.name)}</b><span class="tag">${Icon.coin()} ${n(i.price)}</span></div>
          <div class="small dim">${eff}${limit ? ' · ' + limit : ''}${inv ? ` · owned ${inv.qty}` : ''}</div></div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn sm" data-buy="${i.id}">Buy</button>
          ${i.bonus && inv ? `<button class="btn sm ${inv.equipped ? 'primary' : ''}" data-eq="${i.id}" data-on="${inv.equipped ? 0 : 1}">${inv.equipped ? 'Worn' : 'Equip'}</button>` : ''}
          ${!i.bonus && inv ? `<button class="btn sm primary" data-use="${i.id}">Use</button>` : ''}
        </div></div>`;
    }).join('')}</div></div>`;
  $('#v').querySelectorAll('[data-buy]').forEach((b) => b.onclick = async () => {
    try { await api('/shop/buy', { item: b.dataset.buy }); toast('Purchased'); await refresh(true); shopView(); } catch (e) { toast(e.message, true); }
  });
  $('#v').querySelectorAll('[data-eq]').forEach((b) => b.onclick = async () => {
    try { await api('/shop/equip', { item: b.dataset.eq, on: b.dataset.on === '1' }); await refresh(true); shopView(); } catch (e) { toast(e.message, true); }
  });
  $('#v').querySelectorAll('[data-use]').forEach((b) => b.onclick = () => useItem(b.dataset.use));
  $('#topup').onclick = () => {
    const el = sheet(`<h2>Top up coins</h2>
      <div class="small dim">Send your coin payment on-chain, then paste the transaction signature. The server verifies it and accepts each signature exactly once.</div>
      <label>Transaction signature</label><input id="tx" placeholder="5xk...">
      <button class="btn primary" id="claim" style="width:100%;margin-top:10px">Claim 1,000 coins</button>`);
    $('#claim', el).onclick = async () => {
      try { const r = await api('/coins/claim', { tx: $('#tx', el).value }); el.remove(); toast(`Credited ${r.credited} coins`); await refresh(true); shopView(); }
      catch (e) { toast(e.message, true); }
    };
  };
}

async function useItem(id) {
  try { await api('/shop/use', { item: id }); toast('Used'); await refresh(); } catch (e) { toast(e.message, true); }
}

// -------------------------------------------------------------------- stats
async function statsView() {
  const st = await api('/stats');
  const S_ = st.streams;
  const block = (key, title, note) => {
    const s = S_[key];
    return `<div class="card"><div class="row spread"><h3>${title}</h3>
      <b>${(s.balance ?? s.total).toFixed ? (s.balance ?? s.total).toFixed(4) : s.total} ${s.unit}</b></div>
      <div class="small dim">${note} · lifetime total ${(+s.total).toFixed(4)} ${s.unit}</div>
      ${s.entries.map((e) => `<div class="row spread small" style="margin-top:6px">
        <span class="grow">${esc(e.note || e.name || '')}</span>
        <span>${(+(e.amount ?? e.amount_sol)).toFixed(4)} ${e.unit || 'SOL'} · <a href="${e.solscan}" target="_blank" rel="noopener">Solscan</a></span></div>`).join('')
        || '<div class="small dim">No entries yet.</div>'}</div>`;
  };
  $('#v').innerHTML = `
    <div class="card"><h2>Treasury &amp; transparency</h2>
      <div class="small dim">Shop split: 10% $BLUEPRINT buy &amp; burn, ${(st.splits.shop.coinBurn * 100).toFixed(0)}% coin burn, ${(st.splits.shop.heistPot * 100).toFixed(0)}% swapped to SOL into the Heist pot.</div>
      <div class="small dim" style="margin-top:4px">Coin fee split: 10% $BLUEPRINT burn always, remaining 90% → creator 20%, daily Heist pot 35%, buyback &amp; burn 35%.</div></div>
    ${block('heist_pot', 'Daily Heist pot', 'balance waiting for the next midnight UTC run')}
    ${block('paid_out', 'Paid out to players', 'every payout has a Solscan proof')}
    ${block('buyback_burn', 'Buyback &amp; burn', 'coins bought back from the market and burned')}
    ${block('blueprint_burn', '$BLUEPRINT burn', 'always 10% of every flow')}
    ${block('coin_burn', 'Project coin burn', 'burned straight from shop sales')}
    ${block('creator', 'Creator share', 'development and operations')}
    ${block('shop_revenue', 'Shop revenue', 'gross coin spent in the Black Market')}
    <div class="card small dim">Blueprint Wars is a work of fiction. Gangs, districts, products and the "Heist" are game mechanics only.</div>`;
}

// ------------------------------------------------------------------ clocks
let clockTimer = null;
function startClocks() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    let due = false;
    document.querySelectorAll('[data-cd]').forEach((el) => {
      const left = +el.dataset.cd - Date.now();
      el.textContent = el.textContent.includes('left') ? dur(left) + ' left' : dur(left);
      if (left <= 0) due = true;
    });
    if (due) refresh();
  }, 1000);
}
setInterval(() => refresh(true), 30000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
S.token ? boot() : authView('login');
