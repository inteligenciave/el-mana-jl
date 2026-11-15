/* BORRADOR: guarda lo que la persona está escribiendo (y la pestaña/pantalla donde estaba) para recuperarlo si la página se actualiza.
   Solo este navegador (localStorage), por pantalla y por rol, 24 h. Nunca guarda contraseñas, PIN, claves, cuentas ni tarjetas.
   Si localStorage falla, la pantalla funciona igual. Va ANTES de todo lo demás en la página.
   API: Borrador.registrar(clave, getEstado, setEstado)  estado propio de una pantalla (carrito, filtros...) que vive en JS
        Borrador.tab(ruta[, i])   pestaña abierta        Borrador.exito()  «se guardó bien»: borra lo que ya se envió
        Borrador.limpiar()        borra todo (cambiar rol / salir)    Borrador.sesion()  devuelve al rol/módulo donde estaba
        Borrador.config({ctx, aviso, raices, sesion}) lo usa el portal del cliente */
(function () {
"use strict";
const PRE = 'elmana:borr:', VIDA = 24 * 36e5, DEB = 400, VENTANA = 20000, MAXV = 5000;
let cfg = {ctx: null, aviso: null, raices: null, interno: !!document.getElementById('main')};
const regs = {}, aplicadoReg = new Set(), pend = {}, nrest = {}, ventana = {};
let ctxAct = null, modalAbierto = false, restaurando = false, aplicando = false, avisado = false, propio = false, ultimo = null, sesCache = '', tFlush = 0, tObs = 0;

/* ---------- almacenamiento (todo con try/catch) ---------- */
const ls = {
  get(k) { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } },
  claves() { const r = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(PRE) === 0) r.push(k); } } catch (e) { /* nada */ } return r; }
};
function leer(ctx) { const d = ls.get(PRE + 'd:' + ctx); if (!d) return null; if (!d.ts || Date.now() - d.ts > VIDA) { ls.del(PRE + 'd:' + ctx); return null; } return d; }
function escribir(ctx, d) {
  if (!d.f || !Object.keys(d.f).length) delete d.f;
  if (d.r && !Object.keys(d.r).length) delete d.r;
  if (!d.f && !d.r && d.tab == null) { ls.del(PRE + 'd:' + ctx); return; }
  d.ts = Date.now(); ls.set(PRE + 'd:' + ctx, d);
}
function purgar() { ls.claves().forEach(k => { const d = ls.get(k); if (!d || !d.ts || Date.now() - d.ts > VIDA) ls.del(k); }); }

/* ---------- contexto: pantalla + rol ---------- */
function ctxDe(ruta) {
  try {
    if (cfg.ctx) return cfg.ctx(ruta);
    if (typeof S === 'undefined' || !S || S.entry !== 'in') return null;
    if (typeof Boot !== 'undefined' && Boot.state !== 'ready') return null;
    return 'i:' + S.rol + ':' + (ruta || S.route);
  } catch (e) { return null; }
}
const raices = () => cfg.raices || (cfg.interno ? ['#main', '#modal', '#top'] : ['#app']);
const ambito = el => { const r = raices(); for (let i = 0; i < r.length; i++) { const n = document.querySelector(r[i]); if (n && n.contains(el)) return r[i] === '#modal' ? 'o' : r[i] === '#top' ? 't' : 'm'; } return null; };

/* ---------- qué campos se pueden guardar ---------- */
const SECRETO = /pass|contras|clave|(^|[^a-z])pin([^a-z]|$)|token|cuenta|(^|[^a-z])cta([^a-z]|$)|tarjeta|card|cvv|cvc|iban|secret|swift|routing|c[oó]digo.?seg/i;
function guardable(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  if (t !== 'INPUT' && t !== 'SELECT' && t !== 'TEXTAREA') return false;
  const ty = (el.type || '').toLowerCase();
  if (/^(password|file|hidden|button|submit|reset|image)$/.test(ty)) return false;
  if (el.hasAttribute('data-nodraft') || el.closest('[data-nodraft]') || el.hasAttribute('data-act-change') || el.disabled || el.readOnly) return false;
  const marca = [el.id, el.name, el.getAttribute('data-k'), el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ');
  if (SECRETO.test(marca) || /^cc-/.test(el.getAttribute('autocomplete') || '')) return false;
  if (ty === 'tel' || ty === 'text' || ty === 'number' || ty === '') { if (/^\D*(\d[\s.-]?){12,}\D*$/.test(el.value || '')) return false; }
  return true;
}
const base = el => el.id || el.name || el.getAttribute('data-k') || '';
function claveDe(el, orden) {
  const a = ambito(el); if (!a) return null;
  let b = base(el);
  if (!b) { const l = el.closest('label'); b = '~' + (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (l && l.textContent.trim().slice(0, 24)) || el.getAttribute('data-act') || el.tagName.toLowerCase() + (el.type || '')); if (orden) { orden[a + b] = (orden[a + b] || 0) + 1; b += '#' + orden[a + b]; } else b += '#?'; }
  return a + ':' + b;
}
function valorDe(el) {
  const ty = (el.type || '').toLowerCase();
  if (ty === 'checkbox') return {v: !!el.checked, b: !!el.defaultChecked};
  if (ty === 'radio') return el.checked ? {v: el.value, b: null} : null;
  if (el.tagName === 'SELECT') { const d = [...el.options].find(o => o.defaultSelected) || el.options[0]; return {v: el.value, b: d ? d.value : ''}; }
  return {v: String(el.value).slice(0, MAXV), b: el.defaultValue};
}
const esDefecto = (el, x) => { const ty = (el.type || '').toLowerCase(); return ty === 'radio' ? !el.checked : x.v === x.b; };
function campos() { /* [{el, key}] de lo que hay ahora en pantalla */
  const orden = {}, r = [];
  raices().forEach(sel => document.querySelectorAll(sel + ' input,' + sel + ' select,' + sel + ' textarea').forEach(el => { if (guardable(el)) { const k = claveDe(el, orden); if (k) r.push({el, key: k}); } }));
  return r;
}

/* ---------- guardar ---------- */
const dueno = new WeakMap(); /* a qué pantalla pertenece cada campo: un «change» tardío (al cambiar de pantalla) no debe caer en la nueva */
function anotar(el, esChange) {
  if (restaurando || !el || !el.isConnected || !guardable(el)) return;
  const ctx = (esChange && dueno.get(el)) || ctxDe(); if (!ctx) return;
  dueno.set(el, ctx);
  const orden = {}; /* el orden solo importa para campos sin id: se calcula con todo lo que hay en pantalla */
  const hit = campos().find(c => c.el === el); const key = hit ? hit.key : claveDe(el, orden); if (!key) return;
  const ty = (el.type || '').toLowerCase(), v = valorDe(el); if (!v) { if (ty === 'radio') return; return; }
  (pend[ctx] = pend[ctx] || {})[ty === 'radio' ? key : key] = {x: v, radio: ty === 'radio', def: ty === 'radio' ? false : esDefecto(el, v)};
  programar();
}
function programar() { clearTimeout(tFlush); tFlush = setTimeout(flush, DEB); }
function flush() {
  clearTimeout(tFlush);
  try {
    Object.keys(pend).forEach(ctx => {
      const d = leer(ctx) || {f: {}}; d.f = d.f || {};
      Object.keys(pend[ctx]).forEach(k => { const p = pend[ctx][k]; if (p.def) delete d.f[k]; else d.f[k] = p.x; });
      escribir(ctx, d); delete pend[ctx];
    });
    const grupos = {};
    Object.keys(regs).forEach(c => { const rc = ctxReg(c); if (rc) (grupos[rc] = grupos[rc] || []).push(c); });
    Object.keys(grupos).forEach(rc => {
      const d = leer(rc) || {}; let cambio = false; d.r = d.r || {};
      grupos[rc].forEach(c => {
        let v; try { v = regs[c].get(); } catch (e) { return; }
        const nuevo = v == null || (typeof v === 'object' && !Object.keys(v).length) ? undefined : v;
        if (JSON.stringify(nuevo) !== JSON.stringify(d.r[c])) { if (nuevo === undefined) delete d.r[c]; else d.r[c] = nuevo; cambio = true; }
      });
      if (cambio) escribir(rc, d);
    });
    guardarSesion();
  } catch (e) { /* sin almacenamiento */ }
}
function guardarSesion() {
  try {
    if (!cfg.interno || typeof S === 'undefined' || typeof Boot === 'undefined' || Boot.state !== 'ready') return;
    if (S.entry === 'in') { const t = JSON.stringify({rol: S.rol, mod: S.mod}); if (t !== sesCache) { sesCache = t; ls.set(PRE + 'ses', {rol: S.rol, mod: S.mod, ts: Date.now()}); } }
    else if (sesCache !== '-') { sesCache = '-'; ls.del(PRE + 'ses'); }
  } catch (e) { /* nada */ }
}

/* ---------- borrar: enviado, cancelado, cambio de rol ---------- */
function quitar(ctx, claves) {
  if (!ctx || !claves || !claves.length) return;
  try {
    if (pend[ctx]) claves.forEach(k => delete pend[ctx][k]);
    const d = leer(ctx); if (!d || !d.f) return;
    claves.forEach(k => delete d.f[k]); escribir(ctx, d);
  } catch (e) { /* nada */ }
}
function cerrarVentana() { Object.keys(ventana).forEach(k => { ventana[k] = 0; }); }
function contenedor(desde) { /* el grupo más cercano que tiene campos: ahí vive el formulario del botón */
  let n = desde;
  while (n && n !== document.body) {
    if (n.id === 'main' || n.id === 'top' || n.id === 'app') return null;
    if (n.querySelector && n.querySelector('input,select,textarea') && campos().some(c => n.contains(c.el))) return n;
    n = n.parentElement;
  }
  return null;
}
function clavesDe(cont) { return cont ? campos().filter(c => cont.contains(c.el)).map(c => c.key) : []; }
function limpiarTodo() {
  Object.keys(pend).forEach(k => delete pend[k]); clearTimeout(tFlush);
  ls.claves().forEach(k => ls.del(k)); sesCache = '';
  Object.keys(nrest).forEach(k => delete nrest[k]);
}
function exito() {
  if (propio) return;
  try {
    const u = ultimo, ctx = ctxDe();
    if (u && Date.now() - u.t < 20000 && u.ctx === ctx) quitar(ctx, u.keys);
    cerrarVentana();
    setTimeout(() => { /* si la pantalla se vació sola tras guardar, lo que quedó guardado ya no vale */
      try {
        const c = ctxDe(), d = c && leer(c); if (!d || !d.f) return;
        const vivos = campos(), borrar = [];
        vivos.forEach(({el, key}) => { const x = d.f[key]; if (!x) return; const v = valorDe(el); if (v && esDefecto(el, v) && !((el.type || '') === 'radio')) borrar.push(key); });
        quitar(c, borrar);
      } catch (e) { /* nada */ }
    }, 700);
  } catch (e) { /* nada */ }
}

/* ---------- recuperar ---------- */
function restaurable(el, x) {
  const ty = (el.type || '').toLowerCase();
  if (ty === 'radio') return !el.checked && el.value === x.v;
  const cur = valorDe(el); if (!cur) return false;
  if (ty === 'checkbox') return cur.v === x.b && cur.v !== x.v;
  if (el.tagName === 'SELECT') return cur.v === x.b && cur.v !== x.v && [...el.options].some(o => o.value === x.v);
  return cur.v === x.b && cur.v !== x.v && (cur.v === '' || cur.v === x.b);
}
function poner(el, x) {
  restaurando = true;
  try {
    const ty = (el.type || '').toLowerCase();
    if (ty === 'checkbox') el.checked = !!x.v; else if (ty === 'radio') el.checked = true; else el.value = x.v;
    el.dispatchEvent(new Event(ty === 'checkbox' || ty === 'radio' || el.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  } finally { restaurando = false; }
}
function ventanaAbierta(ambitoK) { return Date.now() < (ventana[ambitoK] || 0); }
const ctxReg = c => { try { return regs[c].ctx ? regs[c].ctx() : ctxDe(); } catch (e) { return null; } };
function aplicarTodosRegs() { let algo = false; Object.keys(regs).forEach(c => { const rc = ctxReg(c), d = rc && leer(rc); if (d && aplicarRegs(rc, d, c)) algo = true; }); return algo; }
function aplicarRegs(ctx, d, solo) {
  if (!d || !d.r) return false; let algo = false;
  Object.keys(regs).forEach(c => {
    if (solo && c !== solo) return;
    const id = ctx + '|' + c; if (aplicadoReg.has(id) || d.r[c] === undefined) return;
    aplicadoReg.add(id);
    try { regs[c].set(d.r[c]); algo = true; } catch (e) { console.error(e); }
  });
  return algo;
}
function aplicar() {
  if (aplicando) return; aplicando = true;
  let nuevo = false;
  try {
    const ctx = ctxDe(); if (aplicarTodosRegs()) nuevo = true; if (!ctx) return;
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const d = leer(ctx); if (!d) break;
      if (!d.f) break;
      let volver = false;
      for (const {el, key} of campos()) {
        const x = d.f[key]; if (!x || !ventanaAbierta(key[0])) continue;
        const id = ctx + '|' + key; if ((nrest[id] || 0) >= 6) continue;
        if (!el.isConnected || !restaurable(el, x)) continue;
        nrest[id] = (nrest[id] || 0) + 1; poner(el, x); nuevo = true;
        if (!el.isConnected) { volver = true; break; } /* el cambio redibujó la pantalla: se vuelve a mirar */
      }
      if (!volver) break;
    }
  } catch (e) { console.error(e); } finally { aplicando = false; }
  if (nuevo && !avisado) {
    avisado = true; propio = true;
    try { if (cfg.aviso) cfg.aviso('Recuperamos lo que estabas escribiendo'); else if (typeof toast === 'function') toast('Recuperamos lo que estabas escribiendo'); } catch (e) { /* nada */ }
    propio = false;
  }
}

/* ---------- vigilar la pantalla ---------- */
function alCambiar() {
  try {
    const ctx = ctxDe();
    if (ctx !== ctxAct) { ctxAct = ctx; ventana.m = ventana.t = ctx ? Date.now() + VENTANA : 0; ventana.o = 0; }
    if (cfg.interno) {
      const mo = document.getElementById('modal'), abierto = !!(mo && !mo.hidden && mo.firstElementChild);
      if (abierto && !modalAbierto) ventana.o = Date.now() + VENTANA;
      if (!abierto && modalAbierto && ctx) { /* se cerró sin guardar: lo escrito ahí ya no hace falta */
        const d = leer(ctx); if (d && d.f) quitar(ctx, Object.keys(d.f).filter(k => k[0] === 'o'));
      }
      modalAbierto = abierto;
    }
    if (ctx) aplicar();
    guardarSesion();
  } catch (e) { console.error(e); }
}
function vigilar() {
  const sels = raices(); let alguno = false;
  const mo = new MutationObserver(() => { clearTimeout(tObs); tObs = setTimeout(alCambiar, 30); });
  sels.concat(cfg.interno ? ['#modal'] : []).forEach(s => { const n = document.querySelector(s); if (n) { mo.observe(n, {childList: true, subtree: true, attributes: true, attributeFilter: ['hidden']}); alguno = true; } });
  if (!alguno) return;
  alCambiar();
}

/* ---------- eventos ---------- */
const CANCELA = /cancel|descart|closeModal|^cerrar$|^cerrarHoja$/i;
document.addEventListener('input', e => { anotar(e.target); }, true);
document.addEventListener('change', e => { anotar(e.target, true); programar(); }, true);
document.addEventListener('keyup', () => { programar(); }, true);
document.addEventListener('click', e => {
  try {
    programar();
    const a = e.target.closest && e.target.closest('[data-act],[data-a]'); if (!a) return;
    const act = a.getAttribute('data-act') || a.getAttribute('data-a') || '';
    if (/^(cambiarRol|elegirRol|setRol|salir)$/.test(act)) { limpiarTodo(); return; }
    if (act === 'inicio') { ls.del(PRE + 'ses'); sesCache = ''; return; }
    const ctx = ctxDe(), cont = contenedor(a) || (a.closest('#modal') ? document.getElementById('modal') : null), keys = clavesDe(cont);
    ultimo = {t: Date.now(), ctx, keys};
    if (CANCELA.test(act) || /^\s*(cancelar|descartar)\b/i.test(a.textContent || '')) { quitar(ctx, keys); cerrarVentana(); }
  } catch (er) { /* nada */ }
}, true);
document.addEventListener('submit', e => { try { const ctx = ctxDe(), f = e.target; ultimo = {t: Date.now(), ctx, keys: campos().filter(c => f.contains(c.el)).map(c => c.key)}; } catch (er) { /* nada */ } }, true);
document.addEventListener('reset', e => { try { const f = e.target; quitar(ctxDe(), campos().filter(c => f.contains(c.el)).map(c => c.key)); } catch (er) { /* nada */ } }, true);
window.addEventListener('hashchange', () => { setTimeout(alCambiar, 30); });
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* ---------- API ---------- */
window.Borrador = {
  registrar(clave, get, set, ctx) {
    regs[clave] = {get, set, ctx: ctx || null};
    try { const rc = ctxReg(clave), d = rc && leer(rc); if (d) aplicarRegs(rc, d, clave); } catch (e) { /* nada */ }
  },
  tab(ruta, i) {
    try {
      const ctx = ctxDe(ruta); if (!ctx) return i == null ? undefined : undefined;
      const d = leer(ctx);
      if (i === undefined) return d && typeof d.tab === 'number' ? d.tab : undefined;
      const x = d || {}; if (x.tab === i) return; x.tab = i; escribir(ctx, x);
    } catch (e) { /* nada */ }
  },
  exito, limpiar: limpiarTodo, flush,
  sesion() {
    try {
      if (typeof S === 'undefined' || S.entry === 'in') return;
      const s = ls.get(PRE + 'ses'); if (!s || !s.ts || Date.now() - s.ts > VIDA) { ls.del(PRE + 'ses'); return; }
      if (typeof ROLES !== 'undefined' && ROLES[s.rol] && typeof modsOf === 'function' && modsOf(s.rol).includes(s.mod)) { S.rol = s.rol; S.mod = s.mod; S.entry = 'in'; }
    } catch (e) { /* nada */ }
  },
  config(o) { Object.assign(cfg, o || {}); }
};
purgar();
/* avisos de éxito de la app del equipo: cada toast sin tipo (verde) es «se guardó» */
try {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      if (cfg.interno && typeof window.toast === 'function') { const t0 = window.toast; window.toast = function (t, kind) { const r = t0.apply(this, arguments); if (!kind) exito(); return r; }; }
    } catch (e) { /* nada */ }
    vigilar();
  });
} catch (e) { /* nada */ }
})();
