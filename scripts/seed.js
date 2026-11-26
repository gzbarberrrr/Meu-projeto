// Fills the database with demo bookings so the dashboard has data. Run: npm run seed
'use strict';
process.env.DB_PATH = process.env.DB_PATH || require('node:path').join(__dirname, '..', 'data', 'barbearia.db');
const { db } = require('../server.js');
const cfg = require('../config.json');
const names = ['João Silva', 'Pedro Costa', 'Rui Santos', 'Tiago Ferreira', 'Miguel Oliveira', 'André Pereira', 'Bruno Rodrigues', 'Diogo Martins', 'Hugo Sousa', 'Ricardo Gomes'];
const today = new Date();
const ins = db.prepare(`INSERT INTO bookings (code, name, phone, service_id, service_name, barber_id, barber_name, date, start_min, end_min, price, status, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
let n = 0;
for (let d = -13; d <= 6; d++) {
  const date = new Date(today); date.setDate(date.getDate() + d);
  const ds = date.toISOString().slice(0, 10);
  const starts = (cfg.slots && cfg.slots[String(date.getDay())]) || [];
  for (const barber of cfg.barbers) {
    for (const hhmm of starts) {
      if (Math.random() < 0.35) continue;
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m;
      const s = cfg.services[Math.floor(Math.random() * cfg.services.length)];
      const status = d < 0 ? (Math.random() < 0.85 ? 'concluida' : Math.random() < 0.5 ? 'falta' : 'cancelada') : 'confirmada';
      const nm = names[Math.floor(Math.random() * names.length)];
      ins.run(Math.random().toString(16).slice(2, 8).toUpperCase(), nm, '91' + String(1000000 + Math.floor(Math.random() * 8999999)), s.id, s.name, barber.id, barber.name, ds, t, t + s.minutes, s.price, status, Math.random() < 0.8 ? 'online' : 'balcao');
      n++;
    }
  }
}
console.log(`${n} marcações de demonstração criadas.`);
