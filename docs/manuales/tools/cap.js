/* Ayudas para tomar las capturas de los manuales (solo local). Uso: node <script>.js */
const {chromium} = require('C:/Users/Aleja/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core');
const BASE = 'http://localhost:8800/', OUT = 'C:/Users/Aleja/El mana-puestos/docs/manuales/img/';
exports.abrir = async (rol, pref) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 1366, height: 768}, deviceScaleFactor: 1, locale: 'es-VE'});
  const page = await ctx.newPage();
  const errores = []; page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(BASE + '#'); await page.waitForTimeout(1200);
  const cr = page.locator('text=Cambiar rol'); if (await cr.count()) { await cr.first().click(); await page.waitForTimeout(500); }
  await page.locator('button', {hasText: new RegExp('^\s*' + rol + '\s*$')}).first().click(); await page.waitForTimeout(1500);
  const U = {
    ir: async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(1300); },
    clic: async t => { await page.locator('text=' + t).first().click(); await page.waitForTimeout(900); },
    marcar: async (...ts) => { for (const t of ts) { try { await page.locator(t.startsWith('css:') ? t.slice(4) : 'text=' + t).first().evaluate(e => { e.style.outline = '4px solid #C92121'; e.style.outlineOffset = '3px'; e.style.borderRadius = '8px'; }, null, {timeout: 3000}); } catch (e) { console.log('sin marcar:', t); } } },
    foto: async n => { await page.waitForTimeout(250); await page.screenshot({path: OUT + (pref || '') + n + '.png'}); await page.evaluate(() => document.querySelectorAll('[style*="outline"]').forEach(e => { e.style.outline = ''; })); console.log('ok', (pref || '') + n); },
    borroso: async () => page.evaluate(() => {
      const w = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT), ns = [];
      while (w.nextNode()) ns.push(w.currentNode);
      document.querySelectorAll('#main td input').forEach(i => { i.style.filter = 'blur(5px)'; });
      ns.forEach(n => { if (/(\$|Bs)\s?[\d]/.test(n.nodeValue) && n.parentElement && !n.parentElement.closest('button')) n.parentElement.style.filter = 'blur(5px)'; });
    }),
    texto: async () => page.evaluate(() => document.querySelector('#main').innerText)
  };
  return {browser, ctx, page, errores, U};
};
