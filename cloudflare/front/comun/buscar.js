/* Buscador común de TODO el sistema: normalización, coincidencia y lista de sugerencias desplegable.
   Cada barra recibe SU PROPIO conjunto de datos y de campos: aquí no hay búsqueda cruzada entre áreas.
   Uso: Busca.registrar('clave', {sugerir: (q, el) => [...], elegir?: (item, el) => ..., vivo?: (q, el) => ..., espera?: ms})
        y en el HTML de la barra: <input type="search" ${Busca.atr('clave')} value="...">  */
const Busca = (() => {
  /* Sin tildes, sin mayúsculas, sin signos: «Ábasto el-Puente» y «ABASTO EL PUENTE» son lo mismo (igual que VD.normNombre) */
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[.,;:()\-_/\\'"]/g, ' ').replace(/\s+/g, ' ').trim();
  const lista = v => (Array.isArray(v) ? v : [v]).filter(x => x != null && x !== '').map(String);
  /* ¿La consulta aparece en ESTE texto? Todas las palabras (en cualquier orden) o, para códigos, pegada sin espacios (RC00017) */
  function coincide(q, texto) {
    const t = norm(q); if (!t) return true;
    const h = norm(texto); if (!h) return false;
    if (!/\s/.test(String(q).trim())) { if (h.includes(t)) return true; } /* una sola «palabra» (código, referencia, RC-00017): seguida, no suelta */
    else if (t.split(' ').every(k => h.includes(k))) return true;
    const c = t.replace(/ /g, ''); return c.length >= 3 && h.replace(/ /g, '').includes(c);
  }
  /* 3 = empieza igual, 2 = una palabra empieza igual, 1 = contiene */
  function puntaje(q, texto) {
    const t = norm(q), h = norm(texto); if (!t) return 0;
    if (h.startsWith(t)) return 3; if (h.split(' ').some(w => w.startsWith(t.split(' ')[0]))) return 2; return 1;
  }
  /* Filtra la lista de la pantalla: items + función que devuelve los textos buscables de cada uno */
  const filtrar = (items, q, textos) => norm(q) ? items.filter(it => { const t = lista(textos(it)); return t.some(x => coincide(q, x)) || (/\s/.test(String(q).trim()) && coincide(q, t.join(' '))); }) : items;
  /* Sugerencias por tipo de dato: defs = [{tipo:'Cliente', valores: it => [...], detalle?: it => 'texto'}]. Devuelve [{t, d, tipo}] sin repetir. */
  function sugerir(q, items, defs, max = 6) {
    if (!norm(q)) return [];
    const vistos = new Map();
    for (const it of items) for (const df of defs) for (const v of lista(df.valores(it))) {
      if (!coincide(q, v)) continue;
      const k = df.tipo + '|' + norm(v), p = puntaje(q, v);
      if (!vistos.has(k) || vistos.get(k).p < p) vistos.set(k, {t: v, tipo: df.tipo, d: df.tipo + (df.detalle ? ' · ' + df.detalle(it) : ''), p, it});
    }
    return [...vistos.values()].sort((a, b) => b.p - a.p || a.t.localeCompare(b.t, 'es')).slice(0, max);
  }
  const textosDe = defs => it => defs.flatMap(df => lista(df.valores(it)));

  /* ---- componente desplegable (una sola lista para todo el sistema, fija en pantalla para que nunca la recorte un overflow) ---- */
  const reg = {}, E = {el: null, items: [], act: -1, timer: null};
  let ul = null, estado = null, silencio = false;
  const registrar = (clave, def) => { reg[clave] = def; };
  const atr = (clave, k = '') => `data-bq="${clave}" ${k ? `data-bqk="${k}" ` : ''}role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="bq-lista" autocomplete="off" spellcheck="false"`;
  function asegurar() {
    if (ul) return;
    ul = document.createElement('ul'); ul.id = 'bq-lista'; ul.className = 'bq-lista'; ul.setAttribute('role', 'listbox'); ul.setAttribute('aria-label', 'Sugerencias'); ul.hidden = true; document.body.appendChild(ul);
    estado = document.createElement('div'); estado.className = 'bq-estado'; estado.setAttribute('role', 'status'); estado.setAttribute('aria-live', 'polite'); document.body.appendChild(estado);
    ul.addEventListener('mousedown', e => e.preventDefault()); /* no le quita el foco a la barra */
    ul.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) elegir(+li.dataset.i); });
  }
  function posicionar() {
    if (!E.el || !ul || ul.hidden) return;
    const r = E.el.getBoundingClientRect(), vw = document.documentElement.clientWidth, ancho = Math.min(Math.max(r.width, 260), vw - 16);
    const abajo = innerHeight - r.bottom - 8, arriba = r.top - 8, sobre = abajo < 170 && arriba > abajo;
    ul.style.left = Math.max(8, Math.min(r.left, vw - ancho - 8)) + 'px'; ul.style.width = ancho + 'px';
    ul.style.maxHeight = Math.max(110, Math.min(300, sobre ? arriba : abajo)) + 'px';
    if (sobre) { ul.style.top = 'auto'; ul.style.bottom = (innerHeight - r.top + 2) + 'px'; } else { ul.style.bottom = 'auto'; ul.style.top = (r.bottom + 2) + 'px'; }
  }
  function cerrar() {
    if (ul) { ul.hidden = true; ul.innerHTML = ''; }
    if (E.el && E.el.isConnected) { E.el.setAttribute('aria-expanded', 'false'); E.el.removeAttribute('aria-activedescendant'); }
    E.items = []; E.act = -1;
  }
  function mostrar(el) {
    asegurar(); E.el = el; const d = reg[el.dataset.bq]; if (!d) return cerrar();
    E.items = (d.sugerir(el.value, el) || []).slice(0, d.max || 6); E.act = -1;
    if (!E.items.length) { cerrar(); if (norm(el.value)) estado.textContent = 'Sin sugerencias.'; return; }
    ul.innerHTML = E.items.map((it, i) => `<li role="option" id="bq-o-${i}" data-i="${i}" aria-selected="false"><b>${esc(it.t)}</b>${it.d ? `<span>${esc(it.d)}</span>` : ''}</li>`).join('');
    ul.hidden = false; el.setAttribute('aria-expanded', 'true'); el.removeAttribute('aria-activedescendant'); posicionar();
    estado.textContent = E.items.length + (E.items.length === 1 ? ' sugerencia.' : ' sugerencias.') + ' Usa las flechas y Enter.';
  }
  function marcar(i) {
    const n = E.items.length; if (!n) return; E.act = (i + n) % n;
    ul.querySelectorAll('li').forEach((li, k) => { const on = k === E.act; li.setAttribute('aria-selected', on); li.classList.toggle('on', on); if (on) { li.scrollIntoView({block: 'nearest'}); E.el.setAttribute('aria-activedescendant', li.id); } });
  }
  function elegir(i) {
    const it = E.items[i], el = E.el; if (!it || !el) return; const d = reg[el.dataset.bq];
    cerrar();
    if (d.elegir) d.elegir(it, el); else { el.value = it.t; if (d.vivo) d.vivo(it.t, el); }
  }
  /* Tras volver a dibujar la pantalla, la barra se reemplaza: se le devuelve el foco, el cursor y la lista abierta */
  const guardarFoco = () => { const a = document.activeElement; return a && a.dataset && a.dataset.bq ? {c: a.dataset.bq, k: a.dataset.bqk || '', s: a.selectionStart, e: a.selectionEnd, ab: !!(ul && !ul.hidden)} : null; };
  function restaurarFoco(g) {
    if (!g) { if (ul && !ul.hidden && !(E.el && E.el.isConnected)) cerrar(); return; }
    const n = [...document.querySelectorAll('[data-bq]')].find(x => x.dataset.bq === g.c && (x.dataset.bqk || '') === g.k);
    if (!n) { cerrar(); return; }
    silencio = true; n.focus({preventScroll: true}); silencio = false; try { n.setSelectionRange(g.s, g.e); } catch (e) { /* tipo sin selección */ }
    if (g.ab) mostrar(n); else E.el = n;
  }
  document.addEventListener('input', e => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.bq) return; const d = reg[el.dataset.bq]; if (!d) return;
    mostrar(el);
    if (d.vivo) { clearTimeout(E.timer); const hacer = () => d.vivo(el.value, el); if (d.espera) E.timer = setTimeout(hacer, d.espera); else hacer(); }
  });
  document.addEventListener('keydown', e => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.bq || !reg[el.dataset.bq]) return;
    const abierta = ul && !ul.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!abierta) { mostrar(el); if (!E.items.length) return; } marcar(E.act < 0 ? (e.key === 'ArrowDown' ? 0 : E.items.length - 1) : E.act + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter' && abierta && E.act >= 0) { e.preventDefault(); e.stopPropagation(); elegir(E.act); }
    else if (e.key === 'Escape' && abierta) { e.preventDefault(); e.stopPropagation(); cerrar(); }
  }, true);
  document.addEventListener('focusout', e => { if (e.target && e.target.dataset && e.target.dataset.bq) setTimeout(() => { const a = document.activeElement; if (!(a && a.dataset && a.dataset.bq)) cerrar(); }, 0); });
  document.addEventListener('focusin', e => { const el = e.target; if (!silencio && el && el.dataset && el.dataset.bq && reg[el.dataset.bq] && norm(el.value)) mostrar(el); });
  addEventListener('resize', posicionar); addEventListener('scroll', posicionar, true);
  return {norm, coincide, puntaje, filtrar, sugerir, textosDe, registrar, atr, mostrar, cerrar, guardarFoco, restaurarFoco};
})();
window.Busca = Busca;
