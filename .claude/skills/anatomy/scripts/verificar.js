#!/usr/bin/env node
// Verifica uma lição da skill anatomy: erros de consola, sliders reativos,
// navegação por etapas, quiz, largura mobile e modo escuro.
// Uso: node verificar.js <ficheiro.html> [captura.png]
const path = require('path');
// Encontra o Playwright local ou o global (npm root -g) sem precisar de NODE_PATH.
function carregarPlaywright() {
  try { return require('playwright'); } catch (_) {}
  const raiz = require('child_process').execSync('npm root -g').toString().trim();
  return require(path.join(raiz, 'playwright'));
}
const { chromium } = carregarPlaywright();

(async () => {
  const ficheiro = process.argv[2];
  if (!ficheiro) { console.error('Uso: node verificar.js <ficheiro.html> [captura.png]'); process.exit(2); }
  // O ficheiro do Artifact não tem esqueleto (o Artifact acrescenta-o ao publicar):
  // para testar como no Artifact, envolve-o num esqueleto equivalente numa cópia temporária.
  const fs = require('fs'), os = require('os');
  let fonte = fs.readFileSync(ficheiro, 'utf8');
  if (!/^\s*<!doctype/i.test(fonte)) {
    fonte = '<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + fonte + '</body></html>';
  }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'anatomy-')), 'licao.html');
  fs.writeFileSync(tmp, fonte);
  const url = 'file://' + tmp;
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
    // Estado visual da etapa, sem os <output> dos sliders (esses mudam sempre).
    const estado = () => page.evaluate(() => {
      const e = document.querySelector('.etapa.ativa').cloneNode(true);
      e.querySelectorAll('.controlo output').forEach(o => o.remove());
      return e.innerHTML + [...document.querySelectorAll('.etapa.ativa canvas')].map(c => c.toDataURL()).join('');
    });
    // Se a etapa muda sozinha (animação), a comparação não prova nada: avisa em vez de passar.
    const a1 = await estado(); await page.waitForTimeout(150); const a2 = await estado();
    const anima = a1 !== a2;
    for (const s of sliders) {
      if (!(await s.isVisible())) continue;
      const id = await s.getAttribute('id');
      slidersTestados++;
      if (anima) { avisos.push(`Etapa ${i + 1} está animada: confirma na captura que o slider #${id} muda a visualização.`); continue; }
      const antes = await estado();
      await s.evaluate(el => { el.value = +el.min + (+el.max - +el.min) * 0.83; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForTimeout(120);
      if (antes === await estado()) { slidersMortos++; falhas.push(`Slider #${id} na etapa ${i + 1} só muda o número, não a visualização.`); }
    }
  }
  // quiz: clica na primeira opção de cada desafio de escolha e verifica feedback
  await page.evaluate(n => Etapas.ir(n - 1), nEtapas);
  const desafios = await page.$$('.quiz .desafio');
  for (const [n, d] of desafios.entries()) {
    const idx = await d.evaluate(el => [...document.querySelectorAll('.etapa')].indexOf(el.closest('.etapa')));
    await page.evaluate(k => Etapas.ir(k), idx);
    const certa = await d.getAttribute('data-certa');
    if (certa) {
      // escolha múltipla: a opção certa tem de existir e ser aceite
      const op = await d.$(`.opcao[data-valor="${certa}"]`);
      if (!op) { falhas.push(`Desafio ${n + 1}: nenhuma opção com data-valor="${certa}".`); continue; }
      await op.click();
      if (!(await d.evaluate(el => el.classList.contains('resolvido')))) falhas.push(`Desafio ${n + 1}: a resposta certa não é aceite.`);
    } else {
      const nome = await d.getAttribute('data-verificar');
      const existe = await page.evaluate(k => typeof (Quiz.verificadores || {})[k] === 'function', nome);
      if (!existe) falhas.push(`Desafio ${n + 1}: falta Quiz.verificadores.${nome}.`);
      const v = await d.$('.verificar');
      if (v) await v.click(); else falhas.push(`Desafio ${n + 1}: falta o botão .verificar.`);
    }
    const txt = await d.$eval('.feedback', f => f.textContent.trim()).catch(() => '');
    if (!txt) falhas.push(`Desafio ${n + 1} não dá feedback ao responder.`);
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
