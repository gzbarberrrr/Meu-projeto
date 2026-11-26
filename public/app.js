// Public site: services, booking wizard, lookup/cancel.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const eur = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const wd = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const fmtDate = (d) => { const x = new Date(d + 'T12:00:00Z'); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (n.className = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  kids.flat().forEach((c) => n.append(c));
  return n;
};

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocorreu um erro.');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

let CFG;
const state = { step: 0, service: null, barber: 'any', date: null, time: null };

// ---------- Static content ----------
function renderShop() {
  const s = CFG.shop;
  $$('[data-shop]').forEach((n) => { if (s[n.dataset.shop]) n.textContent = s[n.dataset.shop]; });
  document.title = `${s.name} | Marcações online`;
  $('#phoneLink').href = `tel:${s.phone.replace(/\s/g, '')}`;
  $('#emailLink').href = `mailto:${s.email}`;
  $('#privacyEmail').href = `mailto:${s.email}`;
  $('#mapsLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  $('#waFloat').href = `https://wa.me/${s.whatsapp}`;
  if (!s.whatsapp) $('#waFloat').remove();
  $('#year').textContent = new Date().getFullYear();

  const todayWd = wd(CFG.today);
  const hourRows = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const r = CFG.hours[d] || [];
    return el('li', { class: d === todayWd ? 'today' : '' }, el('span', {}, DAYS[d]), el('span', {}, r.length ? r.map((x) => x.join('–')).join(' · ') : 'Fechado'));
  });
  $('#heroHours').append(...hourRows);
  $('#infoHours').append(...hourRows.map((n) => n.cloneNode(true)));

  // Open now?
  const now = new Date();
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: s.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const [h, m] = local.split(':').map(Number);
  const mins = h * 60 + m;
  const ranges = CFG.closedDates.includes(CFG.today) ? [] : (CFG.hours[todayWd] || []);
  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const open = ranges.find(([a, b]) => mins >= toMin(a) && mins < toMin(b));
  const next = ranges.find(([a]) => toMin(a) > mins);
  $('#openDot').classList.toggle('open', !!open);
  $('#openText').textContent = open ? `Aberto agora · até às ${open[1]}` : next ? `Fechado · abre às ${next[0]}` : 'Fechado hoje';

  $('#servicesList').append(...CFG.services.map((sv) => el('article', { class: 'service reveal' },
    el('div', { class: 'top' }, el('h3', {}, sv.name), el('span', { class: 'price' }, eur(sv.price))),
    el('p', {}, sv.description),
    el('span', { class: 'chip' }, `⏱ ${sv.minutes} min`),
    el('a', { href: '#marcar', class: 'btn btn-ghost btn-sm', onclick: () => selectService(sv.id, true) }, 'Marcar este')
  )));
}

// ---------- Wizard ----------
function selectService(id, jump) {
  state.service = CFG.services.find((s) => s.id === id);
  state.time = null;
  $$('#serviceOptions .option').forEach((o) => { const on = o.dataset.id === id; o.classList.toggle('selected', on); o.setAttribute('aria-checked', on); });
  if (jump) goTo(1);
  update();
}
function renderOptions() {
  $('#serviceOptions').append(...CFG.services.map((s) => el('button', {
    type: 'button', class: 'option', role: 'radio', 'aria-checked': 'false', 'data-id': s.id,
    onclick: () => { selectService(s.id); setTimeout(() => goTo(1), 180); },
  }, el('strong', {}, s.name), el('small', {}, `${s.minutes} min · ${eur(s.price)}`))));

  const barbers = [{ id: 'any', name: 'Qualquer barbeiro', sub: 'Mais horários disponíveis' }, ...CFG.barbers.map((b) => ({ ...b, sub: 'Barbeiro' }))];
  $('#barberOptions').append(...barbers.map((b) => el('button', {
    type: 'button', class: 'option' + (b.id === 'any' ? ' selected' : ''), role: 'radio', 'aria-checked': String(b.id === 'any'), 'data-id': b.id,
    onclick: (e) => {
      state.barber = b.id; state.time = null;
      $$('#barberOptions .option').forEach((o) => { const on = o.dataset.id === b.id; o.classList.toggle('selected', on); o.setAttribute('aria-checked', on); });
      update(); setTimeout(() => goTo(2), 180);
    },
  }, el('strong', {}, b.name), el('small', {}, b.sub))));

  const days = [];
  for (let i = 0; i <= CFG.booking.daysAhead; i++) {
    const d = addDays(CFG.today, i);
    const closed = !(CFG.hours[wd(d)] || []).length || CFG.closedDates.includes(d);
    const x = new Date(d + 'T12:00:00Z');
    const btn = el('button', { type: 'button', class: 'day', role: 'radio', 'data-date': d, 'aria-label': fmtDate(d) + (closed ? ' (fechado)' : ''), onclick: () => pickDate(d) },
      el('small', {}, i === 0 ? 'Hoje' : DAYS_SHORT[x.getUTCDay()]), el('b', {}, String(x.getUTCDate())), el('small', {}, MONTHS[x.getUTCMonth()]));
    if (closed) btn.disabled = true;
    days.push(btn);
  }
  $('#days').append(...days);
}

async function pickDate(d) {
  state.date = d; state.time = null;
  $$('#days .day').forEach((b) => { const on = b.dataset.date === d; b.classList.toggle('selected', on); b.setAttribute('aria-checked', on); });
  update();
  await loadTimes();
}
async function loadTimes() {
  const box = $('#times');
  if (!state.date || !state.service) { box.replaceChildren(el('p', { class: 'empty' }, 'Escolha um dia para ver as horas livres.')); return; }
  box.replaceChildren(el('p', { class: 'empty' }, 'A procurar horários…'));
  try {
    const { slots } = await api(`/api/availability?service=${state.service.id}&barber=${state.barber}&date=${state.date}`);
    if (!slots.length) { box.replaceChildren(el('p', { class: 'empty' }, 'Sem horários livres neste dia. Experimente outro.')); return; }
    box.replaceChildren(...slots.map((s) => el('button', {
      type: 'button', class: 'time', role: 'radio', 'aria-checked': 'false', 'data-time': s.time,
      onclick: () => {
        state.time = s.time;
        $$('#times .time').forEach((t) => { const on = t.dataset.time === s.time; t.classList.toggle('selected', on); t.setAttribute('aria-checked', on); });
        update();
      },
    }, s.time)));
  } catch (e) { box.replaceChildren(el('p', { class: 'empty' }, e.message)); }
}

function goTo(step) {
  state.step = step;
  $$('.step-pane').forEach((p) => p.classList.toggle('active', Number(p.dataset.step) === step));
  $$('.progress span').forEach((s, i) => s.classList.toggle('on', i <= step));
  $('#wizardNav').style.display = step === 4 ? 'none' : 'flex';
  $('#backBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('#nextBtn').textContent = step === 3 ? 'Confirmar marcação' : 'Continuar';
  hideError();
  if (step === 2) {
    if (!state.date) { const first = $('#days .day:not([disabled])'); if (first) pickDate(first.dataset.date); }
    else loadTimes();
  }
  if (step === 3) setTimeout(() => $('#fName').focus(), 50);
  update();
}
function canContinue() {
  if (state.step === 0) return !!state.service;
  if (state.step === 1) return true;
  if (state.step === 2) return !!(state.date && state.time);
  if (state.step === 3) return true;
  return false;
}
function update() {
  const s = state.service;
  $('#sumService').textContent = s ? s.name : '—';
  $('#sumBarber').textContent = state.barber === 'any' ? 'Qualquer barbeiro' : CFG.barbers.find((b) => b.id === state.barber).name;
  $('#sumWhen').textContent = state.date ? `${fmtDate(state.date)}${state.time ? ' às ' + state.time : ''}` : '—';
  $('#sumDuration').textContent = s ? `${s.minutes} min` : '—';
  $('#sumPrice').textContent = s ? eur(s.price) : '—';
  $('#nextBtn').disabled = !canContinue();
}
function showError(msg) { const a = $('#bookingError'); a.textContent = msg; a.classList.add('show'); }
function hideError() { $('#bookingError').classList.remove('show'); }

async function submitBooking() {
  const f = $('#detailsForm');
  const name = $('#fName').value.trim(), phone = $('#fPhone').value.trim();
  if (name.length < 2) return showError('Indique o seu nome.'), $('#fName').focus();
  if (!/^[+\d][\d\s-]{7,20}$/.test(phone)) return showError('Indique um telemóvel válido.'), $('#fPhone').focus();
  if (!$('#fConsent').checked) return showError('Aceite a política de privacidade para continuar.');
  const btn = $('#nextBtn'); btn.disabled = true; btn.textContent = 'A confirmar…';
  try {
    const { booking } = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ serviceId: state.service.id, barberId: state.barber, date: state.date, time: state.time, name, phone, email: $('#fEmail').value, notes: $('#fNotes').value, consent: true }),
    });
    $('#successText').textContent = `${booking.service} com ${booking.barber} · ${fmtDate(booking.date)} às ${booking.time}`;
    $('#successCode').textContent = booking.code;
    $('#sumBarber').textContent = booking.barber;
    f.reset();
    goTo(4);
  } catch (e) {
    showError(e.message);
    if (/ocupado/.test(e.message)) { state.time = null; setTimeout(() => goTo(2), 1200); }
  } finally { btn.textContent = state.step === 3 ? 'Confirmar marcação' : 'Continuar'; update(); }
}

// ---------- Lookup / cancel ----------
async function lookup(e) {
  e.preventDefault();
  const code = $('#lCode').value.trim(), phone = $('#lPhone').value.trim();
  $('#lookupError').classList.remove('show');
  const box = $('#lookupResult'); box.replaceChildren();
  try {
    const { booking: b } = await api('/api/bookings/lookup', { method: 'POST', body: JSON.stringify({ code, phone }) });
    const label = { confirmada: 'Confirmada', concluida: 'Concluída', cancelada: 'Cancelada', falta: 'Falta' }[b.status];
    const card = el('div', { class: 'panel', style: 'margin-top:16px' },
      el('strong', {}, `${b.service} · ${eur(b.price)}`),
      el('p', { class: 'muted', style: 'margin:.3em 0' }, `${fmtDate(b.date)} às ${b.time} com ${b.barber}`),
      el('span', { class: 'chip' }, label));
    if (b.status === 'confirmada') {
      card.append(el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
        if (!confirm('Cancelar esta marcação?')) return;
        try { await api('/api/bookings/cancel', { method: 'POST', body: JSON.stringify({ code, phone }) }); toast('Marcação cancelada.'); lookup(e); }
        catch (err) { $('#lookupError').textContent = err.message; $('#lookupError').classList.add('show'); }
      } }, 'Cancelar marcação')));
    }
    box.append(card);
  } catch (err) { $('#lookupError').textContent = err.message; $('#lookupError').classList.add('show'); }
}

// ---------- Init ----------
function initUi() {
  $('#menuBtn').addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); });
  $$('#nav a').forEach((a) => a.addEventListener('click', () => $('#nav').classList.remove('open')));
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); $('#' + open.dataset.open).showModal(); }
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
    if (e.target.tagName === 'DIALOG') e.target.close();
  });
  $('#backBtn').addEventListener('click', () => goTo(Math.max(0, state.step - 1)));
  $('#nextBtn').addEventListener('click', () => (state.step === 3 ? submitBooking() : goTo(state.step + 1)));
  $('#newBooking').addEventListener('click', () => { Object.assign(state, { time: null }); goTo(0); });
  $('#lookupForm').addEventListener('submit', lookup);
  const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && (x.target.classList.add('in'), io.unobserve(x.target))), { threshold: .12 });
  $$('.reveal').forEach((n) => io.observe(n));
}

(async () => {
  try {
    CFG = await api('/api/config');
    renderShop();
    renderOptions();
    initUi();
    goTo(0);
  } catch (e) {
    document.body.prepend(el('div', { class: 'alert error show', style: 'margin:16px' }, 'Não foi possível carregar o site. Tente recarregar a página.'));
  }
})();
