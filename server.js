// Barbershop booking site: zero-dependency Node.js server with built-in SQLite.
// Run: ADMIN_PASSWORD=yourpassword node server.js
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createNotifier } = require('./notifier');

const ROOT = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'barbearia.db');
const TZ = CONFIG.shop.timezone || 'Europe/Lisbon';
const STATUSES = ['confirmada', 'concluida', 'cancelada', 'falta'];
// Opening hours are derived from the booking start times (first start to last end) when "slots" is used.
if (CONFIG.slots && !CONFIG.hours) {
  const dur = Math.max(...CONFIG.services.map((s) => s.minutes));
  CONFIG.hours = {};
  for (let d = 0; d < 7; d++) {
    const list = CONFIG.slots[String(d)] || [];
    CONFIG.hours[d] = list.length ? [[list[0], minToHHMM(hhmmToMin(list[list.length - 1]) + dur)]] : [];
  }
}
function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToHHMM(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[aviso] ADMIN_PASSWORD não definida: a usar "admin123". Defina uma palavra-passe antes de publicar.');
}

// ---------- Database ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    barber_id TEXT NOT NULL,
    barber_name TEXT NOT NULL,
    date TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    end_min INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmada',
    source TEXT NOT NULL DEFAULT 'online',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, barber_id);
`);

// ---------- Time helpers (shop timezone) ----------
function nowInShop() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay();
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtDate = (d) => { const x = new Date(d + 'T12:00:00Z'); return `${DAY_NAMES[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTH_NAMES[x.getUTCMonth()]}`; };
const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));

const notifier = createNotifier({ db, config: CONFIG, publicUrl: PUBLIC_URL, fmtDate, toHHMM });

// ---------- Availability ----------
function busyFor(date, barberId) {
  return db.prepare(
    "SELECT start_min, end_min FROM bookings WHERE date = ? AND barber_id = ? AND status != 'cancelada'"
  ).all(date, barberId);
}

function freeSlots(date, service, barberId) {
  const now = nowInShop();
  const last = addDays(now.date, CONFIG.booking.daysAhead);
  if (!isValidDate(date) || date < now.date || date > last) return [];
  if (CONFIG.booking.startDate && date < CONFIG.booking.startDate) return [];
  if ((CONFIG.closedDates || []).includes(date)) return [];
  const ranges = CONFIG.hours[String(weekday(date))] || [];
  const step = CONFIG.booking.slotMinutes;
  const barbers = barberId && barberId !== 'any' ? CONFIG.barbers.filter((b) => b.id === barberId) : CONFIG.barbers;
  const busy = Object.fromEntries(barbers.map((b) => [b.id, busyFor(date, b.id)]));
  const earliest = date === now.date ? now.minutes + (CONFIG.booking.minNoticeMinutes || 0) : -1;
  const slots = [];
  const starts = [];
  if (CONFIG.slots) (CONFIG.slots[String(weekday(date))] || []).forEach((t) => starts.push(toMin(t)));
  else for (const [open, close] of ranges) for (let s = toMin(open); s + service.minutes <= toMin(close); s += step) starts.push(s);
  {
    for (const s of starts) {
      if (s < earliest) continue;
      const e = s + service.minutes;
      const free = barbers.filter((b) => !busy[b.id].some((x) => s < x.end_min && e > x.start_min)).map((b) => b.id);
      if (free.length) slots.push({ time: toHHMM(s), barbers: free });
    }
  }
  return slots;
}

// ---------- Auth ----------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}
const isAdmin = (req) => !!verify(cookies(req).session);

const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (loginAttempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  loginAttempts.set(ip, list);
  return list.length >= 10;
}

// ---------- HTTP helpers ----------
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid json')); } });
  });
}
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp' };

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/dashboard') pathname = '/admin.html';
  const file = path.normalize(path.join(ROOT, 'public', pathname));
  if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, { error: 'Proibido' });
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Página não encontrada'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function publicBooking(b) {
  return { code: b.code, name: b.name, service: b.service_name, barber: b.barber_name, date: b.date, time: toHHMM(b.start_min), end: toHHMM(b.end_min), price: b.price, status: b.status };
}
function adminBooking(b) {
  return { ...publicBooking(b), id: b.id, reminder_sent_at: b.reminder_sent_at, phone: b.phone, email: b.email, notes: b.notes, service_id: b.service_id, barber_id: b.barber_id, source: b.source, created_at: b.created_at };
}

// ---------- Booking creation ----------
function createBooking(input, source) {
  const service = CONFIG.services.find((s) => s.id === input.serviceId);
  if (!service) return { status: 400, error: 'Escolha um serviço.' };
  const name = clean(input.name, 80);
  const phone = clean(input.phone, 25);
  const email = clean(input.email, 120);
  const notes = clean(input.notes, 300);
  if (name.length < 2) return { status: 400, error: 'Indique o seu nome.' };
  if (!/^[+\d][\d\s-]{7,20}$/.test(phone)) return { status: 400, error: 'Indique um telemóvel válido.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, error: 'O email não é válido.' };
  if (source === 'online' && input.consent !== true) return { status: 400, error: 'É necessário aceitar a política de privacidade.' };
  if (!isValidDate(input.date) || !/^\d{2}:\d{2}$/.test(input.time || '')) return { status: 400, error: 'Escolha dia e hora.' };

  db.exec('BEGIN IMMEDIATE');
  try {
    const slot = freeSlots(input.date, service, input.barberId).find((s) => s.time === input.time);
    if (!slot) { db.exec('ROLLBACK'); return { status: 409, error: 'Esse horário acabou de ficar ocupado. Escolha outro.' }; }
    const barber = CONFIG.barbers.find((b) => b.id === slot.barbers[0]);
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const start = toMin(input.time);
    db.prepare(`INSERT INTO bookings (code, name, phone, email, notes, service_id, service_name, barber_id, barber_name, date, start_min, end_min, price, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      code, name, phone, email || null, notes || null, service.id, service.name, barber.id, barber.name,
      input.date, start, start + service.minutes, service.price, source
    );
    db.exec('COMMIT');
    const booking = db.prepare('SELECT * FROM bookings WHERE code = ?').get(code);
    notifier.markReminderIfClose(booking, nowInShop());
    notifier.bookingCreated(booking).catch((e) => console.error('[mensagem]', e));
    return { status: 201, booking };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- Stats ----------
function stats() {
  const today = nowInShop().date;
  const weekStart = addDays(today, -((weekday(today) + 6) % 7)); // Monday
  const monthStart = today.slice(0, 8) + '01';
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const active = "status IN ('confirmada','concluida')";
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const r = one(`SELECT COUNT(*) n, COALESCE(SUM(price),0) v FROM bookings WHERE date = ? AND ${active}`, d);
    last14.push({ date: d, count: r.n, revenue: r.v });
  }
  const next7 = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    next7.push({ date: d, count: one(`SELECT COUNT(*) n FROM bookings WHERE date = ? AND status = 'confirmada'`, d).n });
  }
  const totals = one(`SELECT COUNT(*) n,
      SUM(status='cancelada') cancel, SUM(status='falta') noshow FROM bookings WHERE date >= ?`, monthStart);
  return {
    today,
    todayCount: one(`SELECT COUNT(*) n FROM bookings WHERE date = ? AND ${active}`, today).n,
    todayRevenue: one(`SELECT COALESCE(SUM(price),0) v FROM bookings WHERE date = ? AND ${active}`, today).v,
    weekRevenue: one(`SELECT COALESCE(SUM(price),0) v FROM bookings WHERE date BETWEEN ? AND ? AND ${active}`, weekStart, addDays(weekStart, 6)).v,
    monthRevenue: one(`SELECT COALESCE(SUM(price),0) v FROM bookings WHERE date >= ? AND date <= ? AND ${active}`, monthStart, today.slice(0, 8) + '31').v,
    upcoming: one(`SELECT COUNT(*) n FROM bookings WHERE date >= ? AND status = 'confirmada'`, today).n,
    monthTotal: totals.n || 0,
    monthCancelled: totals.cancel || 0,
    monthNoShow: totals.noshow || 0,
    clients: one('SELECT COUNT(DISTINCT phone) n FROM bookings').n,
    topServices: db.prepare(`SELECT service_name name, COUNT(*) n, SUM(price) v FROM bookings WHERE ${active} GROUP BY service_name ORDER BY n DESC LIMIT 6`).all(),
    byBarber: db.prepare(`SELECT barber_name name, COUNT(*) n, SUM(price) v FROM bookings WHERE date >= ? AND ${active} GROUP BY barber_name ORDER BY n DESC`).all(monthStart),
    last14,
    next7,
  };
}

// ---------- Router ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const m = req.method;

  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  // Public API
  if (m === 'GET' && p === '/api/config') {
    const { shop, hours, services, booking, closedDates } = CONFIG;
    const barbers = CONFIG.barbers.map(({ id, name }) => ({ id, name }));
    return send(res, 200, { shop, hours, barbers, services, booking, closedDates, today: nowInShop().date });
  }
  if (m === 'GET' && p === '/api/availability') {
    const service = CONFIG.services.find((s) => s.id === url.searchParams.get('service'));
    if (!service) return send(res, 400, { error: 'Serviço inválido.' });
    return send(res, 200, { slots: freeSlots(url.searchParams.get('date'), service, url.searchParams.get('barber') || 'any') });
  }
  if (m === 'POST' && p === '/api/bookings') {
    const r = createBooking(await readBody(req), 'online');
    return r.error ? send(res, r.status, { error: r.error }) : send(res, 201, { booking: publicBooking(r.booking) });
  }
  if (m === 'POST' && p === '/api/bookings/lookup') {
    const body = await readBody(req);
    const b = db.prepare('SELECT * FROM bookings WHERE code = ? AND replace(phone, \' \', \'\') = ?')
      .get(clean(body.code, 10).toUpperCase(), clean(body.phone, 25).replace(/\s/g, ''));
    return b ? send(res, 200, { booking: publicBooking(b) }) : send(res, 404, { error: 'Marcação não encontrada. Confirme o código e o telemóvel.' });
  }
  if (m === 'POST' && p === '/api/bookings/cancel') {
    const body = await readBody(req);
    const b = db.prepare('SELECT * FROM bookings WHERE code = ? AND replace(phone, \' \', \'\') = ?')
      .get(clean(body.code, 10).toUpperCase(), clean(body.phone, 25).replace(/\s/g, ''));
    if (!b) return send(res, 404, { error: 'Marcação não encontrada.' });
    if (b.status !== 'confirmada') return send(res, 400, { error: 'Esta marcação já não pode ser cancelada.' });
    db.prepare("UPDATE bookings SET status = 'cancelada' WHERE id = ?").run(b.id);
    notifier.bookingCancelledByClient(b).catch((e) => console.error('[mensagem]', e));
    return send(res, 200, { booking: publicBooking({ ...b, status: 'cancelada' }) });
  }

  // Admin auth
  if (m === 'POST' && p === '/api/admin/login') {
    const ip = req.socket.remoteAddress;
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Demasiadas tentativas. Tente daqui a 15 minutos.' });
    const body = await readBody(req);
    const a = Buffer.from(String(body.password || '')), b = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      loginAttempts.get(ip).push(Date.now());
      return send(res, 401, { error: 'Palavra-passe errada.' });
    }
    const token = sign({ exp: Date.now() + 12 * 3600 * 1000 });
    return send(res, 200, { ok: true }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` });
  }
  if (m === 'POST' && p === '/api/admin/logout') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (p.startsWith('/api/admin/') && !isAdmin(req)) return send(res, 401, { error: 'Sessão expirada.' });

  // Admin API
  if (m === 'GET' && p === '/api/admin/me') return send(res, 200, { ok: true });
  if (m === 'GET' && p === '/api/admin/stats') return send(res, 200, stats());
  if (m === 'GET' && p === '/api/admin/notifications') return send(res, 200, { channels: notifier.channels, items: notifier.list(60) });
  const remindMatch = p.match(/^\/api\/admin\/bookings\/(\d+)\/remind$/);
  if (remindMatch && m === 'POST') {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(remindMatch[1]));
    if (!b) return send(res, 404, { error: 'Não encontrada.' });
    db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?").run(b.id);
    await notifier.sendReminder(b);
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/admin/bookings') {
    const where = [], params = [];
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const status = url.searchParams.get('status'), q = url.searchParams.get('q');
    if (isValidDate(from)) { where.push('date >= ?'); params.push(from); }
    if (isValidDate(to)) { where.push('date <= ?'); params.push(to); }
    if (STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
    if (q) { where.push('(name LIKE ? OR phone LIKE ? OR code LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const rows = db.prepare(`SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date ASC, start_min ASC LIMIT 1000`).all(...params);
    return send(res, 200, { bookings: rows.map(adminBooking) });
  }
  if (m === 'POST' && p === '/api/admin/bookings') {
    const r = createBooking(await readBody(req), 'balcao');
    return r.error ? send(res, r.status, { error: r.error }) : send(res, 201, { booking: adminBooking(r.booking) });
  }
  const idMatch = p.match(/^\/api\/admin\/bookings\/(\d+)$/);
  if (idMatch && m === 'PATCH') {
    const body = await readBody(req);
    if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Estado inválido.' });
    const r = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(body.status, Number(idMatch[1]));
    return r.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Não encontrada.' });
  }
  if (idMatch && m === 'DELETE') {
    const r = db.prepare('DELETE FROM bookings WHERE id = ?').run(Number(idMatch[1]));
    return r.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Não encontrada.' });
  }
  if (m === 'GET' && p === '/api/admin/export.csv') {
    const rows = db.prepare('SELECT * FROM bookings ORDER BY date, start_min').all();
    const head = ['codigo', 'data', 'hora', 'cliente', 'telemovel', 'email', 'servico', 'barbeiro', 'preco', 'estado', 'origem', 'notas', 'criada_em'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(';'), ...rows.map((b) => [b.code, b.date, toHHMM(b.start_min), b.name, b.phone, b.email, b.service_name, b.barber_name, b.price, b.status, b.source, b.notes, b.created_at].map(esc).join(';'))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="marcacoes.csv"' });
    return res.end('﻿' + csv);
  }

  return send(res, 404, { error: 'Não encontrado.' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, e.message === 'invalid json' ? 400 : 500, { error: 'Ocorreu um erro. Tente novamente.' });
  });
});

if (require.main === module) {
  notifier.startScheduler(nowInShop, addDays);
  const c = notifier.channels;
  console.log(`Mensagens: SMS/WhatsApp ${c.sms ? 'ativo (' + c.twilioKind + ')' : 'não configurado'} · Telegram ${c.telegram ? 'ativo' : 'não configurado'} · Email ${c.email ? 'ativo' : 'não configurado'}`);
  server.listen(PORT, () => {
    console.log(`Site:      http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/admin`);
  });
}

module.exports = { server, db };
