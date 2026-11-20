/* EXAMEN DE CLICS · cuenta cuántos clics, teclas, cambios de pantalla y desplazamientos
   hacen falta para completar cada tarea desde la puerta de entrada de su puesto.
   NO cambia el código de la app: solo la maneja como lo haría una persona (con un navegador de verdad) y cuenta.
   Uso:  node src/pruebas/clics/examen-clics.mjs [--url http://localhost:8800] [--tareas id1,id2] [--puesto ventas]
                                                   [--vista 1366x768|375x812] [--ver] [--depurar]
   Resultado: carpeta resultados/ (JSON + tabla Markdown). Ver README.md. */
import {createRequire} from 'node:module';
import {execSync, spawn} from 'node:child_process';
import {cpSync, rmSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {existsSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const AISLADO = !!arg('aislado', false);
let URL_BASE = String(arg('url', 'http://localhost:8800')).replace(/\/$/, '');
const VISTA = String(arg('vista', '1366x768')).split('x').map(Number);
const VER = !!arg('ver', false), DEPURAR = !!arg('depurar', false);
const SOLO = arg('tareas', '') ? String(arg('tareas')).split(',') : null, PUESTO = arg('puesto', null);

/* ---------- Playwright: busca el que ya esté instalado (proyecto o instalación global) ---------- */
function cargarPlaywright() {
  const cand = [process.env.PLAYWRIGHT_PATH, 'playwright'];
  try { const g = execSync('npm root -g', {encoding: 'utf8'}).trim(); cand.push(join(g, 'playwright'), join(g, '@playwright/mcp/node_modules/playwright'), join(g, '@playwright/cli/node_modules/playwright')); } catch (e) { /* sin npm */ }
  const req = createRequire(join(process.cwd(), 'x.js'));
  for (const c of cand.filter(Boolean)) { try { return req(c); } catch (e) { /* siguiente */ } }
  throw new Error('No encontré Playwright. Instálalo (npm i -D playwright) o define PLAYWRIGHT_PATH.');
}
const {chromium} = cargarPlaywright();

/* ---------- Contador dentro de la página: solo cuenta lo que hace la persona (eventos «de verdad») ---------- */
const CONTADOR = () => {
  if (window.__cxOn) return; window.__cxOn = true;
  const env = (t, d) => { try { window.__cxEv(t, d || ''); } catch (e) { /* aún no listo */ } };
  document.addEventListener('click', e => { if (e.isTrusted) env('clic', (e.target && e.target.tagName) || ''); }, true);
  document.addEventListener('keydown', e => { if (e.isTrusted && !['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) env('tecla', e.key); }, true);
  document.addEventListener('input', e => { if (e.isTrusted) { const t = e.target; env('campo', (t.name || t.id || t.placeholder || t.tagName)); } }, true);
  document.addEventListener('change', e => { if (e.isTrusted) env('cambio', (e.target.name || e.target.id || e.target.tagName)); }, true);
  window.addEventListener('hashchange', () => env('pantalla', location.hash));
  const mirar = () => ['modal', 'drawer', 'ptPan'].forEach(id => { const el = document.getElementById(id); if (!el || el.__cxObs) return; el.__cxObs = 1;
    let ab = !el.hidden; new MutationObserver(() => { const ahora = !el.hidden; if (ahora && !ab) env('ventana', id); ab = ahora; }).observe(el, {attributes: true, attributeFilter: ['hidden']}); });
  document.addEventListener('DOMContentLoaded', mirar); setInterval(mirar, 500);
  const toastObs = () => { const t = document.getElementById('toast'); if (!t || t.__cxObs) return; t.__cxObs = 1; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) env('aviso', (n.classList.contains('err') ? 'ERR|' : n.classList.contains('warn') ? 'AVISO|' : 'ok|') + n.textContent.trim().slice(0, 140)); }))).observe(t, {childList: true}); }; setInterval(toastObs, 300);
};

/* ---------- Búsquedas dentro de la página ---------- */
const NORM = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const ENC = {
  /* Devuelve el elemento visible y activo que mejor coincide con el texto (o con el selector CSS) */
  boton: ({t, css, nth = 0, en}) => {
    const n = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none')) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) { const top = document.elementFromPoint(x, y); if (top && !(e.contains(top) || top.contains(e))) return false; } return true; };
    const modal = document.querySelector('#modal:not([hidden])');
    const raices = en ? [...document.querySelectorAll(en)] : modal ? [modal, document] : [document];
    for (const raiz of raices) {
      let c = css ? [...raiz.querySelectorAll(css)] : [...raiz.querySelectorAll('button,a,[data-act],[role=button],[role=menuitem],[role=tab],[role=option],summary,label,.btn,.pst')];
      c = c.filter(e => vis(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
      if (t) { const q = n(t); const cs = c.filter(e => String(e.textContent).replace(/s+/g, ' ').trim() === String(t).trim()); const ex = cs.length ? cs : c.filter(e => n(e.textContent) === q || n(e.getAttribute('aria-label')) === q), pa = c.filter(e => n(e.textContent).startsWith(q) || n(e.getAttribute('aria-label')).startsWith(q)), inc = c.filter(e => n(e.textContent).includes(q) || n(e.getAttribute('aria-label')).includes(q) || n(e.title).includes(q)); c = ex.length ? ex : pa.length ? pa : inc; }
      if (c[nth]) return c[nth];
    }
    return null;
  },
  /* Campo de texto/número/fecha/lista: por selector o por la etiqueta que se le ve */
  campo: ({t, css, nth = 0, en}) => {
    const n = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const modal = document.querySelector('#modal:not([hidden])');
    const raices = en ? [...document.querySelectorAll(en)] : modal ? [modal, document] : [document];
    for (const raiz of raices) {
      let c = [...raiz.querySelectorAll(css || 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select')].filter(e => vis(e) && !e.disabled);
      if (t && !css) { const q = n(t);
        const desc = e => { const l = e.closest('label'), id = e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]'), prev = e.previousElementSibling, par = e.parentElement;
          return [e.placeholder, e.getAttribute('aria-label'), e.name, e.id, l && l.textContent, id && id.textContent, prev && /^(LABEL|SPAN|P|B|SMALL|DIV)$/.test(prev.tagName) && prev.textContent, par && par.firstElementChild !== e && par.firstElementChild && par.firstElementChild.textContent].map(n).filter(Boolean); };
        const ex = c.filter(e => desc(e).some(d => d === q)), inc = c.filter(e => desc(e).some(d => d.includes(q))); c = ex.length ? ex : inc; }
      if (c[nth]) return c[nth];
    }
    return null;
  },
  /* ¿Está el texto en pantalla? */
  texto: ({t}) => { const q = String(t).toLowerCase(); return document.body.innerText.toLowerCase().includes(q); },
  /* Lista de lo que se ve para poder depurar un fallo */
  vista: () => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const raiz = document.querySelector('#modal:not([hidden])') || document.querySelector('#main') || document.body;
    return {ruta: location.hash, modal: !!document.querySelector('#modal:not([hidden])'),
      botones: [...raiz.querySelectorAll('button,a[href],[data-act]')].filter(vis).map(e => (e.dataset.act ? '[' + e.dataset.act + '] ' : '') + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 50)).slice(0, 70),
      campos: [...raiz.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).map(e => e.tagName[0] + ':' + (e.type || '') + ':' + (e.name || e.id || e.placeholder || e.getAttribute('aria-label') || '') + (e.value ? '=' + String(e.value).slice(0, 15) : '')).slice(0, 40),
      avisos: [...document.querySelectorAll('#toast .toast')].map(e => e.textContent.trim().slice(0, 140))};
  }
};

/* ---------- Ejecutor de pasos ---------- */
class Corrida {
  constructor(page, tarea) { this.page = page; this.tarea = tarea; this.c = {clics: 0, teclas: 0, campos: new Set(), cambios: 0, pantallas: 0, ventanas: 0, scrolls: 0, listas: 0, archivos: 0, focos: 0}; this.libre = false; this.bitacora = []; this.avisos = []; this.hitos = []; this.reintentos = 0; }
  suma(t, d) {
    if (t === 'aviso') { this.avisos.push(d); return; }
    if (this.libre) return;
    if (t === 'clic') this.c.clics++; else if (t === 'tecla') this.c.teclas++; else if (t === 'campo') this.c.campos.add(d);
    else if (t === 'pantalla') this.c.pantallas++; else if (t === 'ventana') this.c.ventanas++;
  }
  foto() { return {clics: this.c.clics, teclas: this.c.teclas, campos: this.c.campos.size, pantallas: this.c.pantallas, ventanas: this.c.ventanas, scrolls: this.c.scrolls}; }
  async espera(ms = 350) { await this.page.waitForTimeout(ms); }
  async buscar(tipo, sel, intentos = 20) {
    const o = typeof sel === 'string' ? (/^(#|\.|\[|css=)/.test(sel) ? {css: sel.replace(/^css=/, '')} : {t: sel}) : sel;
    for (let i = 0; i < intentos; i++) { const h = await this.page.evaluateHandle(([f, o]) => (new Function('o', 'return (' + f + ')(o)'))(o), [ENC[tipo].toString(), o]); const el = h.asElement(); if (el) return el; await h.dispose(); await this.page.waitForTimeout(200); }
    throw new Error('No encontré en pantalla: «' + (o.t || o.css) + '»');
  }
  /* Si lo que se toca está fuera de lo que se ve, la persona tiene que desplazar: se cuenta 1 desplazamiento */
  async verYTocar(el, mover) {
    const fuera = await el.evaluate(e => { const r = e.getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth; });
    if (fuera) { if (!this.libre) this.c.scrolls++; await el.evaluate(e => e.scrollIntoView({block: 'center'})); await this.espera(120); }
    await mover();
  }
  async clic(sel) { for (let i = 0; i < 4; i++) { try { const el = await this.buscar('boton', sel); await this.verYTocar(el, () => el.click({timeout: 5000})); break; } catch (e) { if (i < 3 && /not attached|detached|Execution context|intercepts pointer/i.test(String(e.message))) { await this.page.waitForTimeout(300); continue; } throw e; } } await this.espera(); }
  async enfocar(el) { const ya = await el.evaluate(e => document.activeElement === e); if (!ya) { if (!this.libre) this.c.focos++; await el.click(); } }
  async escribe(sel, valor) {
    const el = await this.buscar('campo', sel);
    await this.verYTocar(el, async () => { await this.enfocar(el); await el.evaluate(e => { if (e.value) { e.select && e.select(); } }); await this.page.keyboard.type(String(valor), {delay: 5}); });
    await this.espera(200);
  }
  /* Lista desplegable: abrirla (1 clic) + escoger la opción (1 clic) */
  async elige(sel, opcion) {
    const el = await this.buscar('campo', sel);
    await this.verYTocar(el, async () => {
      const ops = await el.evaluate(e => [...e.options].map(o => [o.value, o.textContent.trim()]));
      const q = String(opcion).toLowerCase(); const hit = ops.find(o => o[1].toLowerCase() === q) || ops.find(o => o[1].toLowerCase().includes(q)) || ops.find(o => o[0] === opcion);
      if (!hit) throw new Error('La lista no tiene «' + opcion + '». Tiene: ' + ops.map(o => o[1]).join(' | ').slice(0, 200));
      if (!this.libre) { this.c.clics += 2; this.c.listas++; }
      await el.selectOption(hit[0]);
    });
    await this.espera(200);
  }
  async archivo(sel, ruta) { const el = await this.buscar('campo', {css: sel || 'input[type=file]'}).catch(() => null) || (await this.page.$('input[type=file]')); if (!el) throw new Error('No hay selector de archivo'); if (!this.libre) { this.c.clics += 2; this.c.archivos++; } await el.setInputFiles(ruta); await this.espera(); }
  async tecla(k) { await this.page.keyboard.press(k); await this.espera(); }
  async espera_texto(t, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await this.page.evaluate(([f, t]) => (new Function('o', 'return (' + f + ')(o)'))({t}), [ENC.texto.toString(), t])) return; await this.page.waitForTimeout(150); } throw new Error('No apareció el texto «' + t + '»'); }
  async hay(t) { return this.page.evaluate(([f, t]) => (new Function('o', 'return (' + f + ')(o)'))({t}), [ENC.texto.toString(), t]); }
  async vista() { return this.page.evaluate(ENC.vista); }
  /* Un paso = objeto con una sola acción. Ver README para la lista. */
  async paso(p) {
    const k = Object.keys(p).find(x => ['clic', 'escribe', 'elige', 'tecla', 'espera', 'ver', 'archivo', 'pausa', 'sino', 'aviso', 'hito', 'clicHasta', 'baja'].includes(x));
    const antes = this.foto(); const libreAntes = this.libre; if (p.libre) this.libre = true;
    try {
      if (k === 'clic') await this.clic(p.clic);
      else if (k === 'escribe') await this.escribe(p.escribe[0], p.escribe[1]);
      else if (k === 'elige') await this.elige(p.elige[0], p.elige[1]);
      else if (k === 'tecla') await this.tecla(p.tecla);
      else if (k === 'archivo') await this.archivo(p.archivo[0], p.archivo[1]);
      else if (k === 'espera') await this.espera_texto(p.espera, p.ms || 6000);
      else if (k === 'aviso') { const q = String(p.aviso).toLowerCase(); const t0 = Date.now(); while (!this.avisos.some(a => a.toLowerCase().includes(q) && !a.startsWith('ERR|'))) { if (Date.now() - t0 > (p.ms || 6000)) throw new Error('No salió el aviso «' + p.aviso + '». Avisos: ' + this.avisos.join(' / ').slice(0, 200)); await this.page.waitForTimeout(150); } }
      else if (k === 'clicHasta') { /* clic y espera el aviso; si no salió, la persona vuelve a pulsar (se cuenta cada clic y se anota como reintento) */
        for (let i = 0; i < 3; i++) { const n0 = this.avisos.length; await this.clic(p.clicHasta); if (i) this.reintentos++; const t0 = Date.now(); let ok = false; while (Date.now() - t0 < (p.ms || 2500)) { if (this.avisos.slice(n0).some(a => a.toLowerCase().includes(String(p.aviso).toLowerCase()))) { ok = true; break; } await this.page.waitForTimeout(150); } if (ok) break; if (i === 2) throw new Error('Tras 3 clics no salió el aviso «' + p.aviso + '»'); } }
      else if (k === 'hito') { this.hitos.push({hito: p.hito, ...this.foto()}); }
      else if (k === 'baja') { /* la persona baja la pantalla hasta ver el elemento (css): 1 desplazamiento */ const el = await this.page.waitForSelector(p.baja, {state: 'attached', timeout: 6000}); if (!this.libre) this.c.scrolls++; await el.evaluate(e => e.scrollIntoView({block: 'center'})); await this.espera(150); }
      else if (k === 'pausa') await this.espera(p.pausa);
      else if (k === 'ver') { if (!(await this.hay(p.ver))) throw new Error('No se ve «' + p.ver + '» (la tarea no terminó)'); }
      else if (k === 'sino') { /* paso opcional: si el texto está, hace los pasos de dentro */ if (await this.hay(p.sino)) for (const q of p.entonces || []) await this.paso(q); }
      else throw new Error('Paso desconocido: ' + JSON.stringify(p));
    } finally { this.libre = libreAntes; }
    const des = this.foto(); const d = {}; for (const x of Object.keys(des)) d[x] = des[x] - antes[x];
    this.bitacora.push({paso: JSON.stringify(p).slice(0, 110), ...d});
  }
}

/* ---------- Una tarea completa ---------- */
const PUESTOS = ['dueno', 'adm', 'produccion', 'empaque', 'ventas', 'rrhh'];
function idealDe(t) {
  const i = t.ideal || {}; const abrir = i.abrir ?? 1, el = i.elecciones ?? 0, conf = i.confirmar ?? 1;
  return {clics: 1 + abrir + el + conf, teclas: i.teclas ?? 0, desglose: `1 entrar al puesto + ${abrir} abrir la tarea + ${el} elecciones + ${conf} confirmar`};
}
/* Pasos previos (preparar datos): se hacen de verdad pero NO se cuentan. */
async function prepararPrevios(browser, t) {
  for (const pv of t.previo || []) {
    const ctx = await browser.newContext({viewport: {width: VISTA[0], height: VISTA[1]}}); const page = await ctx.newPage(); const co = new Corrida(page, t); co.libre = true;
    await page.exposeBinding('__cxEv', (src, tipo, dato) => co.suma(tipo, dato)); await page.addInitScript(CONTADOR);
    try { await page.goto(URL_BASE + '/'); await page.waitForSelector('.pst', {timeout: 15000}); await co.clic({css: `.pst[data-v="${pv.puesto}"]`}); await page.waitForTimeout(800); for (const p of pv.pasos) await co.paso(p); }
    catch (e) { console.log('   (aviso: falló la preparación de «' + t.id + '»: ' + String(e.message).split(/\r?\n/)[0] + ')'); }
    await ctx.close();
  }
}
async function correrTarea(browser, t) {
  await prepararPrevios(browser, t);
  const ctx = await browser.newContext({viewport: {width: VISTA[0], height: VISTA[1]}, hasTouch: VISTA[0] < 700, isMobile: VISTA[0] < 700});
  const page = await ctx.newPage(); const co = new Corrida(page, t);
  await page.exposeBinding('__cxEv', (src, tipo, dato) => co.suma(tipo, dato));
  await page.addInitScript(CONTADOR);
  page.on('response', async r => { try { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.status() >= 400 && r.request().method() !== 'GET') { let b = ''; try { b = (await r.text()).slice(0, 150); } catch (e) {} co.avisos.push('HTTP|' + r.status() + ' ' + u.pathname + ' ' + b); } } catch (e) { /* ignorar */ } });
  page.on('pageerror', e => co.avisos.push('Error de página: ' + String(e.message).slice(0, 120)));
  const res = {id: t.id, nombre: t.nombre, puesto: t.puesto, frecuencia: t.frecuencia || 'diaria', pasos: 0, ideal: idealDe(t), estado: 'ok', nota: t.nota || ''};
  try {
    const rolUrl = t.puesto === 'cliente' ? (t.url || '/cliente.html') : '/';
    await page.goto(URL_BASE + rolUrl); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    if (t.puesto !== 'cliente') { await page.goto(URL_BASE + '/'); await page.waitForSelector('.pst', {timeout: 15000}); await co.clic({css: `.pst[data-v="${t.puesto}"]`}); await page.waitForTimeout(900); }
    else await page.waitForTimeout(900);
    for (const p of t.pasos) { await co.paso(p); res.pasos++; }
    const errs = co.avisos.filter(a => a.startsWith('ERR|')); if (errs.length) { res.estado = 'con avisos'; res.error = errs.map(a => a.slice(4)).join(' / ').slice(0, 200); }
  } catch (e) {
    res.estado = 'fallo'; res.error = String(e.message).split('\n')[0].slice(0, 220);
    if (DEPURAR) { res.vista = await co.vista().catch(() => null); try { mkdirSync(join(AQUI, 'resultados'), {recursive: true}); await page.screenshot({path: join(AQUI, 'resultados', 'depurar-' + t.id + '.png')}); } catch (e) { /* sin foto */ } }
  }
  const f = co.foto();
  res.real = {clics: f.clics, teclas: f.teclas, campos: f.campos, pantallas: f.pantallas, ventanas: f.ventanas, desplazamientos: f.scrolls, listas: co.c.listas, archivos: co.c.archivos, focos: co.c.focos};
  res.exceso = f.clics - res.ideal.clics; res.bitacora = co.bitacora; res.hitos = co.hitos; res.real.reintentos = co.reintentos;
  res.avisos = co.avisos.filter(a => !a.startsWith('ok|Entraste como'));
  await ctx.close(); return res;
}


/* ---------- Modo aislado: copia la base local a una carpeta temporal y levanta un servidor propio (puerto 8811).
   Así el examen no ensucia tus datos y cada corrida parte de lo mismo. ---------- */
let servidor = null, carpetaTmp = null;
async function levantarAislado() {
  const raiz = join(AQUI, '..', '..', '..'); const origen = arg('origen', false) ? String(arg('origen')) : join(raiz, '.wrangler', 'state', 'v3');
  if (!existsSync(origen)) throw new Error('No encuentro la base local en ' + origen);
  carpetaTmp = mkdtempSync(join(tmpdir(), 'examen-clics-')); const destino = join(carpetaTmp, 'v3'); cpSync(origen, destino, {recursive: true, filter: p => !/observability|ratelimit|cache/.test(p)});
  const puerto = Number(arg('puerto', 8811)); URL_BASE = 'http://localhost:' + puerto;
  servidor = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(puerto), '--persist-to', carpetaTmp], {cwd: raiz, shell: true, stdio: 'ignore'});
  for (let i = 0; i < 90; i++) { try { const r = await fetch(URL_BASE + '/'); if (r.ok) return; } catch (e) { /* aún no */ } await new Promise(r => setTimeout(r, 1000)); }
  throw new Error('El servidor aislado no arrancó');
}
function apagarAislado() { if (servidor) { try { execSync('taskkill /pid ' + servidor.pid + ' /T /F', {stdio: 'ignore'}); } catch (e) { try { servidor.kill(); } catch (x) { /* ya cerrado */ } } } if (carpetaTmp) { try { rmSync(carpetaTmp, {recursive: true, force: true}); } catch (e) { /* se limpia solo */ } } }

/* ---------- Principal ---------- */
async function main() {
  if (AISLADO) { console.log('Levantando servidor aislado…'); await levantarAislado(); }
  const dir = join(AQUI, 'tareas'); let tareas = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs') && (arg('explorar', false) || !f.startsWith('zz-'))).sort()) tareas.push(...(await import(pathToFileURL(join(dir, f)).href)).default);
  if (SOLO) tareas = tareas.filter(t => SOLO.includes(t.id)); if (PUESTO) tareas = tareas.filter(t => t.puesto === PUESTO);
  const browser = await chromium.launch({headless: !VER}); const out = [];
  for (const t of tareas) {
    const r = await correrTarea(browser, t); out.push(r);
    console.log(`${r.estado === 'ok' ? 'OK ' : r.estado === 'fallo' ? 'XX ' : '~~ '}${t.id.padEnd(28)} clics ${String(r.real.clics).padStart(3)} (ideal ${r.ideal.clics}) teclas ${String(r.real.teclas).padStart(3)} pant ${r.real.pantallas} despl ${r.real.desplazamientos}${r.error ? '  ← ' + r.error : ''}`);
    if (DEPURAR && r.vista) console.log('   vista:', JSON.stringify(r.vista));
    if (DEPURAR && arg('bitacora', false)) r.bitacora.forEach(b => console.log('    ·', b.paso, '| clics', b.clics, 'teclas', b.teclas, 'pant', b.pantallas, 'vent', b.ventanas, 'desp', b.scrolls));
    if (DEPURAR && r.avisos && r.avisos.length) console.log('   avisos:', r.avisos.join(' || ').slice(0, 300));
  }
  await browser.close();
  const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); const rd = join(AQUI, 'resultados'); mkdirSync(rd, {recursive: true});
  const meta = {fecha: new Date().toISOString(), url: URL_BASE, vista: VISTA.join('x'), tareas: out.length};
  writeFileSync(join(rd, `clics-${sello}.json`), JSON.stringify({meta, resultados: out}, null, 1));
  writeFileSync(join(rd, `clics-${sello}.md`), tablaMd(meta, out)); writeFileSync(join(rd, 'ultimo.json'), JSON.stringify({meta, resultados: out}, null, 1));
  console.log(`\nListo. ${out.length} tareas. Resultados en ${rd}`);
}
function tablaMd(meta, rs) {
  const o = [...rs].sort((a, b) => b.real.clics - a.real.clics);
  let m = `# Examen de clics · ${meta.fecha.slice(0, 16).replace('T', ' ')} · vista ${meta.vista}\n\n| # | Tarea | Puesto | Estado | Clics reales | Clics ideales | Sobran | Teclas | Pantallas | Desplazamientos |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  o.forEach((r, i) => { m += `| ${i + 1} | ${r.nombre} | ${r.puesto} | ${r.estado}${r.error ? ' (' + r.error + ')' : ''} | ${r.real.clics} | ${r.ideal.clics} | ${r.exceso} | ${r.real.teclas} | ${r.real.pantallas} | ${r.real.desplazamientos} |\n`; });
  return m;
}
main().then(apagarAislado, e => { console.error(e); apagarAislado(); process.exit(1); });
