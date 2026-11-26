// Dashboard: KPIs, chart, today's agenda, bookings table, manual bookings.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const STATUS_LABEL = { confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada', falta: 'Falta' };
const eur = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const fmtDate = (d) => { const x = new Date(d + 'T12:00:00Z'); return `${DAYS_SHORT[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  kids.flat().forEach((c) => n.append(c));
  return n;
};
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error(data.error || 'Sessão expirada.'); }
  if (!res.ok) throw new Error(data.error || 'Ocorreu um erro.');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500);
}

let CFG, STATS, chartMode = 'count', lastIds = null, timer;

function showLogin() { clearInterval(timer); $('#appView').hidden = true; $('#loginView').hidden = false; $('#pw').focus(); }
async function showApp() {
  $('#loginView').hidden = true; $('#appView').hidden = false;
  CFG = CFG || await api('/api/config');
  $('#shopName').textContent = CFG.shop.name;
  setupNewForm();
  if (!$('#ffrom').dataset.init) { $('#ffrom').value = CFG.today; $('#ffrom').dataset.init = '1'; }
  await refresh();
  clearInterval(timer);
  timer = setInterval(() => refresh(true), 30000);
}

// ---------- Rendering ----------
function renderKpis(s) {
  const rate = s.monthTotal ? Math.round(((s.monthCancelled + s.monthNoShow) / s.monthTotal) * 100) : 0;
  const k = (label, value, sub) => el('div', { class: 'kpi' }, el('small', {}, label), el('b', {}, value), el('span', {}, sub));
  $('#kpis').replaceChildren(
    k('Hoje', String(s.todayCount), `${eur(s.todayRevenue)} previstos`),
    k('Próximas', String(s.upcoming), 'marcações confirmadas'),
    k('Esta semana', eur(s.weekRevenue), 'faturação (confirmadas + concluídas)'),
    k('Este mês', eur(s.monthRevenue), `${s.monthTotal} marcações`),
    k('Cancel. + faltas', `${rate}%`, `${s.monthCancelled} cancel. · ${s.monthNoShow} faltas (mês)`),
    k('Clientes', String(s.clients), 'telemóveis diferentes'),
  );
}

function renderChart(s) {
  const svg = $('#chart'); svg.replaceChildren();
  const W = svg.clientWidth || 600, H = 300, pad = { l: 34, r: 8, t: 12, b: 34 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const data = s.last14.map((d) => ({ ...d, v: chartMode === 'count' ? d.count : d.revenue }));
  const max = Math.max(1, ...data.map((d) => d.v));
  const nice = chartMode === 'count' ? Math.max(4, Math.ceil(max / 4) * 4) : Math.ceil(max / 40) * 40 || 40;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - (ih * i) / 4;
    svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#2c2c32', 'stroke-dasharray': i ? '3 4' : '' }));
    const t = svgEl('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = chartMode === 'count' ? (nice * i) / 4 : Math.round((nice * i) / 4) + '€'; svg.append(t);
  }
  const bw = iw / data.length;
  const tip = $('#tip');
  data.forEach((d, i) => {
    const h = (d.v / nice) * ih;
    const x = pad.l + i * bw + bw * 0.18;
    const r = svgEl('rect', { class: 'bar' + (d.date === s.today ? ' today' : ''), x, y: pad.t + ih - h, width: bw * 0.64, height: Math.max(h, d.v ? 2 : 0), rx: 4 });
    r.addEventListener('mousemove', (e) => { tip.style.display = 'block'; tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY - 30 + 'px'; tip.textContent = `${fmtDate(d.date)}: ${d.count} marcações · ${eur(d.revenue)}`; });
    r.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    svg.append(r);
    if (data.length <= 14 && (W > 480 || i % 2 === 0)) {
      const x0 = new Date(d.date + 'T12:00:00Z');
      const t = svgEl('text', { x: pad.l + i * bw + bw / 2, y: H - 18, 'text-anchor': 'middle' }); t.textContent = x0.getUTCDate(); svg.append(t);
      const t2 = svgEl('text', { x: pad.l + i * bw + bw / 2, y: H - 5, 'text-anchor': 'middle' }); t2.textContent = DAYS_SHORT[x0.getUTCDay()]; svg.append(t2);
    }
  });
}

function renderBars(target, rows, valueFn) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  $(target).replaceChildren(...(rows.length ? rows.map((r) => el('div', { class: 'row' },
    el('span', {}, r.name), el('span', { class: 'muted' }, valueFn(r)),
    el('div', { class: 'track' }, el('div', { class: 'fill', style: `width:${(r.n / max) * 100}%` }))))
    : [el('p', { class: 'muted' }, 'Ainda sem dados.')]));
}

async function setStatus(b, status) {
  if (status === 'cancelada' && !confirm(`Cancelar a marcação de ${b.name}?`)) return;
  await api(`/api/admin/bookings/${b.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  toast(`Marcação de ${b.name}: ${STATUS_LABEL[status]}`);
  refresh();
}
async function removeBooking(b) {
  if (!confirm(`Apagar definitivamente a marcação de ${b.name}? Esta ação não pode ser desfeita.`)) return;
  await api(`/api/admin/bookings/${b.id}`, { method: 'DELETE' });
  toast('Marcação apagada.');
  refresh();
}
const ICONS = {
  done: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
  noshow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg>',
  cancel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  undo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
  del: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};
function iconBtn(icon, label, fn) {
  const b = el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: () => fn().catch((e) => toast(e.message)) });
  b.innerHTML = ICONS[icon];
  return b;
}
function actionsFor(b) {
  const box = el('div', { class: 'row-actions' });
  if (b.status === 'confirmada') {
    box.append(iconBtn('done', 'Marcar como concluída', () => setStatus(b, 'concluida')), iconBtn('noshow', 'Marcar falta', () => setStatus(b, 'falta')), iconBtn('cancel', 'Cancelar', () => setStatus(b, 'cancelada')));
  } else {
    box.append(iconBtn('undo', 'Repor como confirmada', () => setStatus(b, 'confirmada')));
  }
  box.append(iconBtn('del', 'Apagar', () => removeBooking(b)));
  return box;
}

function renderAgenda(list, today) {
  $('#todayLabel').textContent = fmtDate(today);
  const items = list.filter((b) => b.date === today && b.status !== 'cancelada');
  $('#agenda').replaceChildren(...(items.length ? items.map((b) => el('div', { class: 'agenda-item ' + b.status },
    el('time', {}, b.time),
    el('div', {}, el('strong', {}, b.name), el('small', {}, `${b.service} · ${b.barber} · ${b.phone}`)),
    actionsFor(b)))
    : [el('p', { class: 'muted' }, 'Sem marcações para hoje.')]));
}

function renderTable(list) {
  $('#countLabel').textContent = `${list.length} resultado${list.length === 1 ? '' : 's'}`;
  $('#rows').replaceChildren(...(list.length ? list.map((b) => el('tr', {},
    el('td', {}, el('strong', {}, fmtDate(b.date)), el('small', {}, `${b.time}–${b.end}`)),
    el('td', {}, el('strong', {}, b.name), el('small', {}, `${b.phone} · #${b.code}${b.source === 'balcao' ? ' · balcão' : ''}`), b.notes ? el('small', {}, '“' + b.notes + '”') : ''),
    el('td', {}, b.service),
    el('td', {}, b.barber),
    el('td', {}, eur(b.price)),
    el('td', {}, el('span', { class: 'badge ' + b.status }, STATUS_LABEL[b.status])),
    el('td', {}, actionsFor(b))))
    : [el('tr', {}, el('td', { colspan: '7', class: 'muted', style: 'text-align:center;padding:30px' }, 'Nenhuma marcação encontrada.'))]));
}

async function refresh(silent) {
  try {
    const qs = new URLSearchParams();
    if ($('#fq').value.trim()) qs.set('q', $('#fq').value.trim());
    if ($('#ffrom').value) qs.set('from', $('#ffrom').value);
    if ($('#fto').value) qs.set('to', $('#fto').value);
    if ($('#fstatus').value) qs.set('status', $('#fstatus').value);
    const [stats, filtered, today] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/bookings?' + qs),
      api(`/api/admin/bookings?from=${CFG.today}&to=${CFG.today}`),
    ]);
    STATS = stats;
    const todays = today.bookings.filter((b) => b.date === stats.today);
    renderKpis(stats);
    renderChart(stats);
    renderAgenda(todays, stats.today);
    renderBars('#topServices', stats.topServices, (r) => `${r.n} · ${eur(r.v)}`);
    renderBars('#byBarber', stats.byBarber, (r) => `${r.n} · ${eur(r.v)}`);
    renderTable(filtered.bookings);
    // Notify about new bookings since last refresh
    const ids = new Set(filtered.bookings.map((b) => b.id));
    if (silent && lastIds) {
      const fresh = filtered.bookings.filter((b) => !lastIds.has(b.id));
      if (fresh.length) toast(`🔔 ${fresh.length} nova${fresh.length > 1 ? 's' : ''} marcação${fresh.length > 1 ? 'ões' : ''}: ${fresh[0].name} · ${fmtDate(fresh[0].date)} ${fresh[0].time}`);
    }
    lastIds = ids;
    $('#liveLabel').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { if (!silent) toast(e.message); }
}

// ---------- Manual booking ----------
let formReady = false;
function setupNewForm() {
  if (formReady) return; formReady = true;
  $('#nService').append(...CFG.services.map((s) => el('option', { value: s.id }, `${s.name} · ${s.minutes} min · ${eur(s.price)}`)));
  $('#nBarber').append(el('option', { value: 'any' }, 'Qualquer'), ...CFG.barbers.map((b) => el('option', { value: b.id }, b.name)));
  $('#nDate').value = CFG.today; $('#nDate').min = CFG.today;
  const loadTimes = async () => {
    const sel = $('#nTime');
    sel.replaceChildren(el('option', { value: '' }, 'A carregar…'));
    const { slots } = await api(`/api/availability?service=${$('#nService').value}&barber=${$('#nBarber').value}&date=${$('#nDate').value}`);
    sel.replaceChildren(...(slots.length ? slots.map((s) => el('option', { value: s.time }, s.time)) : [el('option', { value: '' }, 'Sem horários livres')]));
  };
  ['#nService', '#nBarber', '#nDate'].forEach((id) => $(id).addEventListener('change', () => loadTimes().catch((e) => toast(e.message))));
  $('#newBtn').addEventListener('click', () => { $('#newError').classList.remove('show'); $('#newDialog').showModal(); loadTimes().catch((e) => toast(e.message)); });
  $('#newForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/bookings', { method: 'POST', body: JSON.stringify({
        serviceId: $('#nService').value, barberId: $('#nBarber').value, date: $('#nDate').value, time: $('#nTime').value,
        name: $('#nName').value, phone: $('#nPhone').value, notes: $('#nNotes').value,
      }) });
      $('#newDialog').close(); e.target.reset(); $('#nDate').value = CFG.today;
      toast('Marcação guardada.');
      refresh();
    } catch (err) { $('#newError').textContent = err.message; $('#newError').classList.add('show'); }
  });
}

// ---------- Init ----------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').classList.remove('show');
  try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) }); $('#pw').value = ''; showApp(); }
  catch (err) { $('#loginError').textContent = err.message; $('#loginError').classList.add('show'); }
});
$('#logoutBtn').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); });
$$('#chartTabs button').forEach((b) => b.addEventListener('click', () => {
  chartMode = b.dataset.mode;
  $$('#chartTabs button').forEach((x) => x.classList.toggle('on', x === b));
  if (STATS) renderChart(STATS);
}));
let debounce;
$('#fq').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => refresh(), 250); });
['#ffrom', '#fto', '#fstatus'].forEach((id) => $(id).addEventListener('change', () => refresh()));
$('#fclear').addEventListener('click', () => { ['#fq', '#ffrom', '#fto', '#fstatus'].forEach((id) => ($(id).value = '')); refresh(); });
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  if (e.target.tagName === 'DIALOG') e.target.close();
});
window.addEventListener('resize', () => STATS && renderChart(STATS));

fetch('/api/admin/me').then((r) => (r.ok ? showApp() : showLogin())).catch(showLogin);
