#!/usr/bin/env node
// Verifica uma lição da skill anatomy: erros de consola, sliders reativos,
// navegação por etapas, quiz, largura mobile e modo escuro.
// Uso: node verificar.js <ficheiro.html> [captura.png]
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const ficheiro = process.argv[2];
  if (!ficheiro) { console.error('Uso: node verificar.js <ficheiro.html> [captura.png]'); process.exit(2); }
  const url = 'file://' + path.resolve(ficheiro);
  const browser = await chromium.launch();
  const falhas = [], avisos = [];

  async function abrir(opts) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    return { ctx, page, erros };
  }

  // 1. Desktop: erros, etapas, sliders, quiz
  const { ctx, page, erros } = await abrir({ viewport: { width: 1200, height: 900 } });
  const nEtapas = await page.$$eval('.etapa', e => e.length);
  if (nEtapas < 2) falhas.push(`Só ${nEtapas} etapa(s); a lição deve ter várias.`);
  const temPreve = await page.$$eval('.preve', e => e.length);
  const temQuiz = await page.$$eval('.quiz .desafio', e => e.length);
  const temTermos = await page.$$eval('.termo[data-def]', e => e.length);
  if (!temPreve) falhas.push('Falta um bloco "Prevê primeiro" (.preve).');
  if (temQuiz < 3) falhas.push(`Quiz com ${temQuiz} desafio(s); devem ser 3 a 5.`);
  if (!temTermos) falhas.push('Nenhum termo do glossário (.termo[data-def]).');

  let slidersTestados = 0, slidersMortos = 0;
  for (let i = 0; i < nEtapas; i++) {
    await page.evaluate(k => Etapas.ir(k), i);
    // revela blocos de previsão para testar o que está por trás
    const preve = await page.$(`.etapa.ativa .preve .opcao`);
    if (preve) { await preve.click(); await page.waitForTimeout(100); }
    const sliders = await page.$$('.etapa.ativa input[type=range]');
    for (const s of sliders) {
      if (!(await s.isVisible())) continue;
      const antes = await page.evaluate(() => document.querySelector('.etapa.ativa').innerHTML + [...document.querySelectorAll('.etapa.ativa canvas')].map(c => c.toDataURL()).join(''));
      await s.evaluate(el => { el.value = +el.min + (+el.max - +el.min) * 0.83; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForTimeout(120);
      const depois = await page.evaluate(() => document.querySelector('.etapa.ativa').innerHTML + [...document.querySelectorAll('.etapa.ativa canvas')].map(c => c.toDataURL()).join(''));
      slidersTestados++;
      if (antes === depois) { slidersMortos++; falhas.push(`Slider #${await s.getAttribute('id')} na etapa ${i + 1} não altera nada visível.`); }
    }
  }
  // quiz: clica na primeira opção de cada desafio de escolha e verifica feedback
  await page.evaluate(n => Etapas.ir(n - 1), nEtapas);
  const desafios = await page.$$('.quiz .desafio');
  for (const d of desafios) {
    const op = await d.$('.opcao') || await d.$('.verificar');
    if (!op) continue;
    if (!(await op.isVisible())) { const idx = await d.evaluate(el => [...document.querySelectorAll('.etapa')].indexOf(el.closest('.etapa'))); await page.evaluate(k => Etapas.ir(k), idx); }
    await op.click();
    const txt = await d.$eval('.feedback', f => f.textContent.trim()).catch(() => '');
    if (!txt) falhas.push('Um desafio do quiz não dá feedback ao responder.');
  }
  if (erros.length) falhas.push('Erros na consola: ' + [...new Set(erros)].join(' | '));
  await ctx.close();

  // 2. Mobile 375px em modo escuro
  const m = await abrir({ viewport: { width: 375, height: 800 }, colorScheme: 'dark' });
  for (let i = 0; i < nEtapas; i++) {
    await m.page.evaluate(k => Etapas.ir(k), i);
    const sw = await m.page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 376) { falhas.push(`Scroll horizontal a 375 px na etapa ${i + 1} (largura ${sw}px).`); break; }
  }
  const contraste = await m.page.evaluate(() => {
    const b = getComputedStyle(document.body);
    return { fundo: b.backgroundColor, texto: b.color };
  });
  if (contraste.fundo === contraste.texto) falhas.push('Modo escuro: texto com a mesma cor do fundo.');
  if (process.argv[3]) {
    await m.page.evaluate(() => Etapas.ir(0));
    await m.page.waitForTimeout(500); // deixa terminar a animação de entrada
    await m.page.screenshot({ path: process.argv[3], fullPage: true });
  }
  await m.ctx.close();
  await browser.close();

  console.log(`Etapas: ${nEtapas} | Prevê primeiro: ${temPreve} | Desafios: ${temQuiz} | Termos: ${temTermos} | Sliders testados: ${slidersTestados}`);
  avisos.forEach(a => console.log('AVISO: ' + a));
  if (falhas.length) { falhas.forEach(f => console.log('FALHA: ' + f)); process.exit(1); }
  console.log('OK: todas as verificações passaram.');
})();
