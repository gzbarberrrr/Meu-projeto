// Notifications: booking confirmation, new-booking alert to the barber, and reminders before the appointment.
// Channels are enabled through environment variables; without any, messages are logged for manual WhatsApp sending.
'use strict';

const env = process.env;
const channels = {
  sms: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
  telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
};
const twilioKind = (env.TWILIO_CHANNEL || 'sms').toLowerCase() === 'whatsapp' ? 'whatsapp' : 'sms';

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^[29]\d{8}$/.test(p)) p = '+351' + p; // Portuguese numbers without country code
  if (!p.startsWith('+')) p = '+' + p;
  return /^\+\d{8,15}$/.test(p) ? p : null;
}
const waLink = (phone, text) => {
  const p = normalizePhone(phone);
  return p ? `https://wa.me/${p.slice(1)}?text=${encodeURIComponent(text)}` : null;
};

async function sendTwilio(to, body) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const prefix = twilioKind === 'whatsapp' ? 'whatsapp:' : '';
  const from = twilioKind === 'whatsapp' && !env.TWILIO_FROM.startsWith('whatsapp:') ? 'whatsapp:' + env.TWILIO_FROM : env.TWILIO_FROM;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: prefix + to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
async function sendTelegram(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
async function sendEmail(to, subject, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Email ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function createNotifier({ db, config, publicUrl, fmtDate, toHHMM }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      kind TEXT NOT NULL,
      audience TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const cols = db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name);
  if (!cols.includes('reminder_sent_at')) db.exec('ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT');

  const shop = config.shop.name;
  const log = db.prepare('INSERT INTO notifications (booking_id, kind, audience, channel, recipient, message, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const barberOf = (b) => config.barbers.find((x) => x.id === b.barber_id) || {};

  // Try every configured channel for one recipient; log each attempt. Falls back to "manual" (WhatsApp link in dashboard).
  async function deliver(b, kind, audience, { phone, email, telegramChat, subject, text }) {
    const attempts = [];
    const to = normalizePhone(phone);
    if (channels.sms && to) attempts.push([twilioKind, to, () => sendTwilio(to, text)]);
    if (channels.telegram && telegramChat) attempts.push(['telegram', String(telegramChat), () => sendTelegram(telegramChat, text)]);
    if (channels.email && email) attempts.push(['email', email, () => sendEmail(email, subject, text)]);
    let sent = false;
    for (const [channel, recipient, fn] of attempts) {
      try { await fn(); sent = true; log.run(b.id, kind, audience, channel, recipient, text, 'enviada', null); }
      catch (e) { log.run(b.id, kind, audience, channel, recipient, text, 'falhou', e.message); console.error('[mensagem]', e.message); }
    }
    if (!sent) {
      log.run(b.id, kind, audience, 'whatsapp-manual', to || phone || null, text, 'manual', attempts.length ? 'Envio automático falhou' : 'Nenhum canal automático configurado');
      console.log(`[mensagem ${kind} → ${audience}] ${text}`);
    }
  }

  const when = (b) => `${fmtDate(b.date)} às ${toHHMM(b.start_min)}`;
  const link = publicUrl ? ` Gerir marcação: ${publicUrl}` : '';
  const toBarber = (b, kind, text) => {
    const barber = barberOf(b);
    return deliver(b, kind, 'barbeiro', {
      phone: barber.phone || config.notifications?.barberPhone,
      email: config.shop.email && !/exemplo/.test(config.shop.email) ? config.shop.email : null,
      telegramChat: barber.telegramChatId || env.TELEGRAM_CHAT_ID,
      subject: `${shop}: ${kind === 'lembrete' ? 'lembrete' : kind === 'cancelamento' ? 'marcação cancelada' : 'nova marcação'}`,
      text,
    });
  };
  const toClient = (b, kind, subject, text) => deliver(b, kind, 'cliente', { phone: b.phone, email: b.email, subject, text });

  async function bookingCreated(b) {
    await Promise.allSettled([
      toClient(b, 'confirmacao', `${shop}: marcação confirmada`,
        `Olá ${b.name}! A sua marcação na ${shop} está confirmada: ${b.service_name} com ${b.barber_name}, ${when(b)}. Código: ${b.code}.${link}`),
      toBarber(b, 'nova', `💈 Nova marcação: ${b.name} (${b.phone}) · ${b.service_name} · ${when(b)}${b.notes ? ` · Nota: ${b.notes}` : ''}`),
    ]);
  }
  async function bookingCancelledByClient(b) {
    await toBarber(b, 'cancelamento', `❌ Marcação cancelada pelo cliente: ${b.name} (${b.phone}) · ${b.service_name} · ${when(b)}`);
  }
  async function sendReminder(b) {
    await Promise.allSettled([
      toClient(b, 'lembrete', `${shop}: lembrete da sua marcação`,
        `Olá ${b.name}, lembrete: tem ${b.service_name} na ${shop} com ${b.barber_name}, ${when(b)}. Se não puder vir, cancele com o código ${b.code}.${link}`),
      toBarber(b, 'lembrete', `⏰ Lembrete: ${when(b)} · ${b.name} (${b.phone}) · ${b.service_name}`),
    ]);
  }

  // Minutes from "now" (shop time) until the booking starts
  const minutesUntil = (b, now) => (Date.UTC(...b.date.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))) - Date.UTC(...now.date.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)))) / 60000 + b.start_min - now.minutes;

  function startScheduler(nowInShop, addDays) {
    const hours = config.notifications?.reminderHoursBefore ?? 24;
    const tick = async () => {
      const now = nowInShop();
      const rows = db.prepare("SELECT * FROM bookings WHERE status = 'confirmada' AND reminder_sent_at IS NULL AND date BETWEEN ? AND ?")
        .all(now.date, addDays(now.date, Math.ceil(hours / 24) + 1));
      for (const b of rows) {
        const mins = minutesUntil(b, now);
        if (mins > 0 && mins <= hours * 60) {
          db.prepare("UPDATE bookings SET reminder_sent_at = datetime('now') WHERE id = ?").run(b.id);
          await sendReminder(b).catch((e) => console.error('[lembrete]', e));
        }
      }
    };
    tick();
    return setInterval(tick, 60 * 1000);
  }

  // Bookings made inside the reminder window already got a confirmation, so skip the reminder for them.
  function markReminderIfClose(b, now) {
    const hours = config.notifications?.reminderHoursBefore ?? 24;
    if (minutesUntil(b, now) <= hours * 60) db.prepare("UPDATE bookings SET reminder_sent_at = 'nao-necessario' WHERE id = ?").run(b.id);
  }

  function list(limit = 50) {
    return db.prepare('SELECT n.*, b.name AS client_name, b.code FROM notifications n LEFT JOIN bookings b ON b.id = n.booking_id ORDER BY n.id DESC LIMIT ?')
      .all(limit).map((n) => ({ ...n, whatsapp: n.status !== 'enviada' ? waLink(n.recipient, n.message) : null }));
  }

  return { bookingCreated, bookingCancelledByClient, sendReminder, startScheduler, markReminderIfClose, list, channels: { ...channels, twilioKind } };
}

module.exports = { createNotifier, normalizePhone };
